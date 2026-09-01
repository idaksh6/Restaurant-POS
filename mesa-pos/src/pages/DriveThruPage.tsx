import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import CustomerSearchPanel from '../components/CustomerSearchPanel'
import MesaSelect from '../components/MesaSelect'
import MenuPicker from '../components/MenuPicker'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import { lineTotal, money, nowTime, type OpenTicket } from '../data/mock'
import { hydrateSequencesFromApi, nextSeq } from '../data/sequences'
import { calcBill, cashFromSettle, recipesFromDishes } from '../lib/bill'
import { SAUDI } from '../locale/saudi'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { useBranch } from '../state/BranchContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { useSync } from '../sync/SyncContext'

type OrderTypeOpt = 'drive-thru' | 'takeaway' | 'dine-in' | 'delivery'

function nextLaneNo() {
  return nextSeq('driveThru')
}

export default function DriveThruPage() {
  const { user } = useAuth()
  const perms = user ? getPermissions(user.role) : getPermissions('cashier')
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { dishes } = useMasters()
  const { redeemGiftCard } = useCatalog()
  const { addCashIn } = useShift()
  const { activeBranchId } = useBranch()
  const { syncEpoch } = useSync()
  const {
    tickets,
    addTicket,
    addToTicket,
    changeTicketQty,
    sendTicketOrders,
    settleTicket,
    deductRecipeStock,
    flash,
    dayIsClosed,
  } = usePos()

  useEffect(() => {
    void hydrateSequencesFromApi().catch(() => undefined)
  }, [syncEpoch, activeBranchId])

  const [ticketId, setTicketId] = useState<string | null>(null)
  const [laneNo, setLaneNo] = useState(0)
  const [orderType, setOrderType] = useState<OrderTypeOpt>('drive-thru')
  const [ticketNote, setTicketNote] = useState('')
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null)
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [showCustomer, setShowCustomer] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [showKeypad, setShowKeypad] = useState(false)
  const [keypadCode, setKeypadCode] = useState('')

  const selected = tickets.find((t) => t.id === ticketId)
  const driveTickets = useMemo(
    () => tickets.filter((t) => t.id.startsWith('dt-')),
    [tickets],
  )

  useEffect(() => {
    if (ticketId && tickets.some((t) => t.id === ticketId)) return
    const open = [...tickets].reverse().find((t) => t.id.startsWith('dt-'))
    if (open) {
      setTicketId(open.id)
      const match = open.customer.match(/#(\d+)/)
      setLaneNo(match ? Number(match[1]) : nextLaneNo())
      return
    }
    const n = nextLaneNo()
    const ticket: OpenTicket = {
      id: `dt-${Date.now()}`,
      type: 'takeaway',
      customer: `#${n} Drive Thru`,
      openedAt: nowTime(),
      lines: [],
    }
    addTicket(ticket)
    setTicketId(ticket.id)
    setLaneNo(n)
  }, [ticketId, tickets, addTicket])

  const lines = selected?.lines ?? []
  const pending = lines.filter((l) => !l.sent).length
  const goods = lineTotal(lines)
  const bill = useMemo(() => calcBill(goods, 0, []), [goods])
  const { tax, total } = bill

  const linkedCustomer = linkedCustomerId
    ? customers.find((c) => c.id === linkedCustomerId)
    : undefined

  function newTicket() {
    const n = nextLaneNo()
    const ticket: OpenTicket = {
      id: `dt-${Date.now()}`,
      type: orderType === 'delivery' ? 'delivery' : 'takeaway',
      customer: linkedCustomer?.name
        ? `#${n} Drive Thru · ${linkedCustomer.name}`
        : `#${n} Drive Thru`,
      openedAt: nowTime(),
      lines: [],
    }
    addTicket(ticket)
    setTicketId(ticket.id)
    setLaneNo(n)
    setTicketNote('')
    flash(`New lane · #${n}`)
  }

  function completeSettle(result: SettleResult) {
    if (!selected) return
    const redeemSar = result.loyaltyRedeemSar ?? 0
    if (result.customerId && (result.loyaltyRedeemPts ?? 0) > 0) {
      redeemPoints(result.customerId, result.loyaltyRedeemPts!)
    }
    if (result.giftCardId && (result.giftCardAmount ?? 0) > 0) {
      redeemGiftCard(result.giftCardId, result.giftCardAmount!)
    }
    const payable = Math.max(0, Math.round((total - redeemSar) * 100) / 100)
    if (result.customerId) earnPoints(result.customerId, payable)
    settleTicket(selected.id, {
      method: result.method,
      source: `Drive Thru #${laneNo}`,
      staff: user?.name,
      subtotal: bill.taxable,
      tax,
      total: payable,
      lines,
      splitPayments: result.splitPayments,
      customerId: result.customerId ?? linkedCustomerId ?? undefined,
      loyaltyRedeem: redeemSar || undefined,
    })
    deductRecipeStock(lines, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(result.method, payable, result.splitPayments))
    setShowSettle(false)
    flash(`Paid · Drive Thru #${laneNo} · ${result.method}`)
    setTicketId(null)
    setLinkedCustomerId(null)
    setTicketNote('')
  }

  function tempBill() {
    if (!selected || lines.length === 0) {
      flash('Add items first')
      return
    }
    setReceipt({
      title: `Drive Thru #${laneNo} · Temporary`,
      method: 'Temp bill · not settled',
      lines,
      subtotal: bill.taxable,
      tax,
      total,
      staff: user?.name,
      time: nowTime(),
      customerName: linkedCustomer?.name,
    })
  }

  function voidLastNew() {
    if (!selected) return
    const last = [...lines].reverse().find((l) => !l.sent)
    if (!last) {
      flash('No unsent line to return')
      return
    }
    changeTicketQty(selected.id, last.id, -last.qty)
    flash(`Returned · ${last.name}`)
  }

  function addByCode() {
    if (!selected || !keypadCode.trim()) return
    const dish = dishes.find(
      (d) => d.active && (d.code === keypadCode.trim() || d.name.toLowerCase() === keypadCode.trim().toLowerCase()),
    )
    if (!dish) {
      flash('Code not found')
      return
    }
    addToTicket(selected.id, dish)
    setKeypadCode('')
    flash(`Added · ${dish.name}`)
  }

  const nowLabel = useMemo(
    () =>
      new Date().toLocaleString('en-SA', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [],
  )

  return (
    <div className="dt-page">
      <header className="dt-top">
        <strong>Mesa · Drive Thru</strong>
        <div className="dt-top-right">
          <span>{nowLabel}</span>
          {dayIsClosed ? <span className="chip">Day closed</span> : null}
          <Link to="/" className="dt-close" aria-label="Close">
            ✕
          </Link>
        </div>
      </header>

      <div className="dt-shell">
        <aside className="dt-actions">
          <Link to="/dine-in" className="dt-action">
            Select table
          </Link>
          <button type="button" className="dt-action" onClick={() => setShowCustomer(true)}>
            Select customer
          </button>
          <button
            type="button"
            className="dt-action"
            onClick={() => flash('Merge is for dine-in tables')}
          >
            Merge
          </button>
          <button
            type="button"
            className="dt-action"
            onClick={() => {
              const note = window.prompt('Ticket note', ticketNote) ?? ticketNote
              setTicketNote(note)
              if (note) flash('Note saved')
            }}
          >
            Ticket note
          </button>
          <button type="button" className="dt-action" onClick={voidLastNew}>
            Return
          </button>
          <button type="button" className="dt-action" onClick={newTicket}>
            New
          </button>
          {perms.canSendOrders ? (
            <button
              type="button"
              className="dt-action accent"
              onClick={() => {
                if (!selected || pending === 0) {
                  flash('Nothing new to send')
                  return
                }
                setShowSend(true)
              }}
            >
              Send orders{pending > 0 ? ` (${pending})` : ''}
            </button>
          ) : null}
          <button
            type="button"
            className="dt-action"
            onClick={() => flash('Priority · normal — rush via Send Orders')}
          >
            Order priority
          </button>
          <Link to="/delivery" className="dt-action">
            Delivery boy
          </Link>
          <button
            type="button"
            className="dt-action"
            disabled={lines.length === 0}
            onClick={tempBill}
          >
            Temporary bill
          </button>
        </aside>

        <section className="dt-ticket panel">
          <div className="dt-ticket-head">
            <div>
              <h2>
                #{laneNo || '—'} <em>Drive Thru</em>
              </h2>
              <div className="dt-chips">
                <span className="chip">{orderType.replace('-', ' ')}</span>
                {linkedCustomer ? <span className="chip">{linkedCustomer.name}</span> : null}
                {driveTickets.length > 1 ? (
                  <span className="chip">{driveTickets.length} open</span>
                ) : null}
              </div>
            </div>
            <label className="dt-type">
              Change type
              <MesaSelect
                value={orderType}
                onChange={(v) => setOrderType(v as OrderTypeOpt)}
                options={[
                  { value: 'drive-thru', label: 'Drive Thru' },
                  { value: 'takeaway', label: 'Takeaway' },
                  { value: 'dine-in', label: 'Dine-in' },
                  { value: 'delivery', label: 'Delivery' },
                ]}
              />
            </label>
          </div>

          <div className="dt-status">
            <div>
              <span>Status</span>
              <strong>{lines.length === 0 ? 'New order' : pending > 0 ? 'Unpaid · open' : 'Sent · unpaid'}</strong>
            </div>
            <button type="button" className="dt-plus" onClick={newTicket} title="New ticket">
              +
            </button>
          </div>

          {ticketNote ? <p className="dt-note">Note: {ticketNote}</p> : null}

          <div className="dt-lines">
            <div className="dt-lines-head">
              <span>Qty · Item</span>
              <span>Status</span>
              <span>Unpaid</span>
            </div>
            {lines.length === 0 ? (
              <div className="ticket-empty">
                <strong>Lane ready</strong>
                Tap menu items to build the car order.
              </div>
            ) : (
              <div className="dt-group">
                <header>New Order</header>
                {lines.map((line) => (
                  <div key={line.id} className="dt-line">
                    <div className="dt-line-main">
                      <em>{line.qty}</em>
                      <div>
                        <strong>{line.name}</strong>
                        <small>
                          {money(line.price)}
                          {line.note ? ` · ${line.note}` : ''}
                        </small>
                      </div>
                    </div>
                    <span className={line.sent ? 'sent' : 'new'}>{line.sent ? 'Sent' : 'New'}</span>
                    <div className="dt-line-right">
                      <strong>{money(line.qty * line.price)}</strong>
                      <div className="qty-controls">
                        <button
                          type="button"
                          onClick={() => selected && changeTicketQty(selected.id, line.id, -1)}
                        >
                          −
                        </button>
                        <span>{line.qty}</span>
                        <button
                          type="button"
                          onClick={() => selected && changeTicketQty(selected.id, line.id, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dt-totals">
            <div>
              <span>Ticket total</span>
              <span>{money(goods)}</span>
            </div>
            <div>
              <span>{SAUDI.vatLabel}</span>
              <span>{money(tax)}</span>
            </div>
            <div className="grand">
              <span>Balance</span>
              <span>{money(total)}</span>
            </div>
          </div>

          <div className="dt-ticket-actions">
            {perms.canSettle ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={lines.length === 0 || dayIsClosed}
                onClick={() => setShowSettle(true)}
              >
                Settle
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={lines.length === 0}
                onClick={() => flash('Payment requested — cashier will settle')}
              >
                Request pay
              </button>
            )}
            <Link to="/" className="btn btn-ghost">
              Close
            </Link>
          </div>
        </section>

        <section className="dt-menu panel">
          {selected ? (
            <MenuPicker onAdd={(item, note) => addToTicket(selected.id, item, note)} />
          ) : (
            <div className="ticket-empty">Opening lane…</div>
          )}
          <button type="button" className="dt-keypad-btn" onClick={() => setShowKeypad(true)}>
            Keypad
          </button>
        </section>
      </div>

      <footer className="dt-foot">
        <Link to="/quick-serve" className="dt-foot-link">
          Quick Serve
        </Link>
        <span>{user?.roleLabel ?? user?.name}</span>
        <Link to="/" className="dt-foot-home">
          Main Menu
        </Link>
      </footer>

      {showSend && selected ? (
        <SendOrdersModal
          pendingCount={pending}
          onClose={() => setShowSend(false)}
          onSend={(priority) => {
            sendTicketOrders(selected.id, priority)
            setShowSend(false)
            flash(`KOT sent · ${priority}`)
          }}
        />
      ) : null}

      {showSettle && selected ? (
        <SettleModal
          title={`Drive Thru #${laneNo}`}
          total={total}
          customers={customers}
          preselectCustomerId={linkedCustomerId ?? undefined}
          onClose={() => setShowSettle(false)}
          onConfirm={completeSettle}
        />
      ) : null}

      {showCustomer ? (
        <CustomerSearchPanel
          selectedId={linkedCustomerId}
          onClose={() => setShowCustomer(false)}
          onSelect={(c) => {
            setLinkedCustomerId(c?.id ?? null)
            setShowCustomer(false)
            flash(c ? `Customer · ${c.name}` : 'Walk-in')
          }}
        />
      ) : null}

      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}

      {showKeypad ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card dt-keypad-modal">
            <div className="section-head">
              <h2>Item keypad</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setShowKeypad(false)}>
                Close
              </button>
            </div>
            <p className="modal-lead">Enter product code and add to the drive-thru ticket.</p>
            <input
              className="search"
              value={keypadCode}
              onChange={(e) => setKeypadCode(e.target.value)}
              placeholder="Product code"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') addByCode()
              }}
            />
            <div className="dt-pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'C') setKeypadCode('')
                    else if (k === '⌫') setKeypadCode((v) => v.slice(0, -1))
                    else setKeypadCode((v) => `${v}${k}`)
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-primary" onClick={addByCode}>
              Add item
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
