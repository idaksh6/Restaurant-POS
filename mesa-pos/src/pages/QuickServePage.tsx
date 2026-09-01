import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import ConfirmModal from '../components/ConfirmModal'
import MenuPicker from '../components/MenuPicker'
import MesaSelect from '../components/MesaSelect'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import TextPromptModal from '../components/TextPromptModal'
import { redeemFoodVoucher } from '../data/foodVouchers'
import { lineTotal, money, nowTime, type OpenTicket } from '../data/mock'
import { hydrateSequencesFromApi, nextSeq } from '../data/sequences'
import { calcBill, cashFromSettle, recipesFromDishes } from '../lib/bill'
import { SAUDI } from '../locale/saudi'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { useSync } from '../sync/SyncContext'
import { attachZatcaToReceipt } from '../hardware/zatca'

type OrderTypeOpt = 'takeaway' | 'dine-in' | 'delivery'

function nextServeNo() {
  return nextSeq('quickServe')
}

function QsIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="qs-ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function IconBolt() {
  return (
    <QsIcon>
      <path d="M13 2 6 13h6l-1 9 7-11h-6l1-9Z" />
    </QsIcon>
  )
}
function IconPlus() {
  return (
    <QsIcon>
      <path d="M12 5v14M5 12h14" />
    </QsIcon>
  )
}
function IconSend() {
  return (
    <QsIcon>
      <path d="M4 12h12" />
      <path d="M13 7l5 5-5 5" />
      <path d="M4 7v10" />
    </QsIcon>
  )
}
function IconPay() {
  return (
    <QsIcon>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </QsIcon>
  )
}
function IconUser() {
  return (
    <QsIcon>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
    </QsIcon>
  )
}
function IconTable() {
  return (
    <QsIcon>
      <rect x="3" y="7" width="18" height="4" rx="1.5" />
      <path d="M6 11v7M18 11v7M10 11v4M14 11v4" />
    </QsIcon>
  )
}
function IconNote() {
  return (
    <QsIcon>
      <path d="M7 4h8l2 2v14H7V4Z" />
      <path d="M9.5 10h5M9.5 13h5M9.5 16h3" />
    </QsIcon>
  )
}
function IconBag() {
  return (
    <QsIcon>
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </QsIcon>
  )
}

function IconCancel() {
  return (
    <QsIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </QsIcon>
  )
}

function statusLabel(lines: { sent?: boolean }[]) {
  if (lines.length === 0) return { label: 'New', tone: 'muted' as const }
  if (lines.some((l) => !l.sent)) return { label: 'Open', tone: 'amber' as const }
  return { label: 'Sent', tone: 'teal' as const }
}

export default function QuickServePage() {
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
    cancelTicket,
    deductRecipeStock,
    flash,
    dayIsClosed,
  } = usePos()

  useEffect(() => {
    void hydrateSequencesFromApi().catch(() => undefined)
  }, [syncEpoch, activeBranchId])

  const [search, setSearch] = useState('')
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [serveNo, setServeNo] = useState(0)
  const [orderType, setOrderType] = useState<OrderTypeOpt>('takeaway')
  const [ticketNote, setTicketNote] = useState('')
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null)
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [showCustomer, setShowCustomer] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)

  const selected = tickets.find((t) => t.id === ticketId)

  useEffect(() => {
    if (ticketId && tickets.some((t) => t.id === ticketId)) return
    const empty = [...tickets].reverse().find((t) => t.id.startsWith('qs-') && t.lines.length === 0)
    const open = empty ?? [...tickets].reverse().find((t) => t.id.startsWith('qs-'))
    if (open) {
      setTicketId(open.id)
      const match = open.customer.match(/#(\d+)/)
      setServeNo(match ? Number(match[1]) : 0)
      return
    }
    if (ticketId) return
    if (dayIsClosed) return
    const n = nextServeNo()
    const ticket: OpenTicket = {
      id: `qs-${Date.now()}`,
      type: 'takeaway',
      customer: `#${n} Quick Serve`,
      openedAt: nowTime(),
      lines: [],
    }
    addTicket(ticket)
    setTicketId(ticket.id)
    setServeNo(n)
  }, [ticketId, tickets, addTicket, dayIsClosed])

  const lines = selected?.lines ?? []
  const pending = lines.filter((l) => !l.sent).length
  const goods = lineTotal(lines)
  const bill = useMemo(() => calcBill(goods, 0, []), [goods])
  const { tax, total, taxable } = bill
  const status = statusLabel(lines)

  const linkedCustomer = linkedCustomerId
    ? customers.find((c) => c.id === linkedCustomerId)
    : undefined

  function newTicket() {
    if (dayIsClosed) {
      flash('Day is closed — reopen in Back Office')
      return
    }
    const n = nextServeNo()
    const ticket: OpenTicket = {
      id: `qs-${Date.now()}`,
      type: orderType === 'delivery' ? 'delivery' : 'takeaway',
      customer: linkedCustomer?.name
        ? `#${n} Quick Serve · ${linkedCustomer.name}`
        : `#${n} Quick Serve`,
      openedAt: nowTime(),
      lines: [],
    }
    addTicket(ticket)
    setTicketId(ticket.id)
    setServeNo(n)
    setTicketNote('')
    flash(`Quick Serve #${n}`)
  }

  function requestCancel() {
    if (!selected) return
    setShowCancel(true)
  }

  function confirmCancel() {
    if (!selected) return
    cancelTicket(selected.id, 'Cancelled from quick serve')
    setShowCancel(false)
    setTicketId(null)
    setLinkedCustomerId(null)
    setTicketNote('')
  }

  function completeSettle(result: SettleResult) {
    if (!selected) return
    if (dayIsClosed) {
      flash('Day is closed')
      return
    }
    if (lines.length === 0) {
      flash('Add items before settle')
      return
    }
    const redeemSar = result.loyaltyRedeemSar ?? 0
    if (result.customerId && (result.loyaltyRedeemPts ?? 0) > 0) {
      redeemPoints(result.customerId, result.loyaltyRedeemPts!)
    }
    if (result.giftCardId && (result.giftCardAmount ?? 0) > 0) {
      redeemGiftCard(result.giftCardId, result.giftCardAmount!)
    }
    if (result.foodVoucherId) {
      redeemFoodVoucher(result.foodVoucherId)
    }
    const payable = Math.max(0, Math.round((total - redeemSar) * 100) / 100)
    const customerId = result.customerId ?? linkedCustomerId ?? undefined
    if (customerId) earnPoints(customerId, payable)
    settleTicket(selected.id, {
      method: result.method,
      source: `Quick Serve #${serveNo || selected.customer}`,
      staff: user?.name,
      subtotal: taxable,
      tax,
      total: payable,
      lines,
      splitPayments: result.splitPayments,
      customerId,
      loyaltyRedeem: redeemSar || undefined,
    })
    deductRecipeStock(lines, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(result.method, payable, result.splitPayments))
    setShowSettle(false)
    setReceipt(attachZatcaToReceipt({
      title: `Quick Serve #${serveNo || selected.customer}`,
      method: result.method,
      lines,
      subtotal: taxable,
      tax,
      total: payable,
      loyaltyRedeem: redeemSar || undefined,
      splitPayments: result.splitPayments,
      staff: user?.name,
      time: new Date().toLocaleString(),
      customerName: linkedCustomer?.name ?? selected.customer,
      kind: 'paid',
    }))
    flash(`Paid by ${result.method}`)
    setTicketId(null)
    setLinkedCustomerId(null)
    setTicketNote('')
  }

  return (
    <div className="zk-qs">
      <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />

      <div className="qs-page">
        <header className="qs-toolbar">
          <div className="qs-toolbar-brand">
            <span className="qs-hero-mark">
              <IconBolt />
            </span>
            <div>
              <h1>Quick Serve</h1>
              <p>
                #{serveNo || '—'} · {status.label}
                {dayIsClosed ? ' · day closed' : ''}
              </p>
            </div>
          </div>
          <div className="qs-toolbar-actions">
            {dayIsClosed ? <span className="qs-pill closed">Day closed</span> : null}
            <Link to="/takeaway" className="qs-link-btn">
              <IconBag /> Takeaway list
            </Link>
            <button
              type="button"
              className="btn btn-primary qs-new-btn"
              disabled={dayIsClosed}
              onClick={newTicket}
            >
              <IconPlus /> New ticket
            </button>
          </div>
        </header>

        <nav className="qs-tools" aria-label="Quick actions">
          <Link to="/dine-in" className="qs-tool">
            <IconTable /> Table
          </Link>
          <button type="button" className="qs-tool" onClick={() => setShowCustomer(true)}>
            <IconUser /> Customer
          </button>
          <button type="button" className="qs-tool" onClick={() => setShowNote(true)}>
            <IconNote /> Note
          </button>
          <button type="button" className="qs-tool" disabled={dayIsClosed} onClick={newTicket}>
            <IconPlus /> New
          </button>
          {perms.canSendOrders ? (
            <button
              type="button"
              className="qs-tool accent"
              disabled={dayIsClosed}
              onClick={() => {
                if (!selected || pending === 0) {
                  flash('Nothing new to send')
                  return
                }
                setShowSend(true)
              }}
            >
              <IconSend /> Send{pending > 0 ? ` (${pending})` : ''}
            </button>
          ) : null}
          <Link to="/delivery" className="qs-tool">
            Delivery
          </Link>
          <button
            type="button"
            className="qs-tool"
            disabled={lines.length === 0}
            onClick={() => flash('Temporary bill printed to preview')}
          >
            Temp bill
          </button>
        </nav>

        <div className="qs-desk">
          <section className="qs-menu-panel">
            {selected ? (
              <MenuPicker
                onAdd={(item, note) => {
                  if (dayIsClosed) {
                    flash('Day is closed')
                    return
                  }
                  addToTicket(selected.id, item, note)
                }}
              />
            ) : (
              <div className="qs-empty">
                <IconBolt />
                <strong>Opening ticket…</strong>
              </div>
            )}
          </section>

          <section className="qs-ticket-panel">
            <div className="qs-ticket-head">
              <div>
                <h2>
                  #{serveNo || '—'} <em>Quick Serve</em>
                </h2>
                <div className="qs-tags">
                  <span className={`qs-status-pill ${status.tone}`}>{status.label}</span>
                  <span className="qs-chip soft">{selected?.customer ?? '—'}</span>
                  {linkedCustomer ? (
                    <span className="qs-chip soft">
                      <IconUser /> {linkedCustomer.name}
                    </span>
                  ) : null}
                </div>
              </div>
              <label className="qs-type">
                Type
                <MesaSelect
                  value={orderType}
                  onChange={(v) => setOrderType(v as OrderTypeOpt)}
                  options={[
                    { value: 'takeaway', label: 'Takeaway' },
                    { value: 'dine-in', label: 'Dine-in' },
                    { value: 'delivery', label: 'Delivery' },
                  ]}
                />
              </label>
            </div>

            {ticketNote ? <p className="qs-note">Note: {ticketNote}</p> : null}

            <div className="qs-lines">
              {lines.length === 0 ? (
                <div className="qs-empty inline">
                  <strong>No items yet</strong>
                  <span>Tap products on the left to build the ticket.</span>
                </div>
              ) : (
                lines.map((line) => (
                  <div key={line.id} className="order-line">
                    <div className="name">{line.name}</div>
                    <strong>{money(line.qty * line.price)}</strong>
                    <div className="sub">
                      {money(line.price)} · {line.sent ? 'Sent' : 'New'}
                      {line.note ? ` · ${line.note}` : ''}
                    </div>
                    <div className="qty-controls">
                      <button
                        type="button"
                        disabled={dayIsClosed || line.sent}
                        onClick={() => selected && changeTicketQty(selected.id, line.id, -1)}
                      >
                        −
                      </button>
                      <span>{line.qty}</span>
                      <button
                        type="button"
                        disabled={dayIsClosed}
                        onClick={() => selected && changeTicketQty(selected.id, line.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="qs-totals">
              <div>
                <span>Subtotal</span>
                <span>{money(taxable)}</span>
              </div>
              <div>
                <span>{SAUDI.vatLabel}</span>
                <span>{money(tax)}</span>
              </div>
              <div className="grand">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
            </div>

            <div className="qs-ticket-actions">
              {perms.canSendOrders ? (
                <button
                  type="button"
                  className="btn btn-teal"
                  disabled={dayIsClosed}
                  onClick={() => {
                    if (!pending) {
                      flash('Nothing new to send')
                      return
                    }
                    setShowSend(true)
                  }}
                >
                  <IconSend /> Send orders{pending > 0 ? ` (${pending})` : ''}
                </button>
              ) : null}
              {perms.canSettle ? (
                <button
                  type="button"
                  className="btn btn-teal"
                  disabled={lines.length === 0 || dayIsClosed}
                  onClick={() => setShowSettle(true)}
                >
                  <IconPay /> Settle
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
              <button type="button" className="btn btn-ghost qs-cancel-btn" onClick={requestCancel}>
                <IconCancel /> Cancel ticket
              </button>
            </div>
          </section>
        </div>
      </div>

      <HubFooter backTo="/takeaway" backLabel="Takeaway list" />

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
          title="Quick Serve"
          total={total}
          customers={customers}
          preselectCustomerId={linkedCustomerId ?? undefined}
          onClose={() => setShowSettle(false)}
          onConfirm={completeSettle}
        />
      ) : null}

      {showCustomer ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="section-head">
              <h2>Select customer</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCustomer(false)}>
                Close
              </button>
            </div>
            <div className="method-grid">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setLinkedCustomerId(null)
                  setShowCustomer(false)
                }}
              >
                Walk-in
              </button>
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setLinkedCustomerId(c.id)
                    setShowCustomer(false)
                    flash(`Customer · ${c.name}`)
                  }}
                >
                  {c.name} · {c.points} pts
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showNote ? (
        <TextPromptModal
          title="Ticket note"
          label="Note"
          initialValue={ticketNote}
          placeholder="Allergy, packing, call when ready…"
          confirmLabel="Save"
          cancelLabel="Close"
          onClose={() => setShowNote(false)}
          onConfirm={(value) => {
            setTicketNote(value)
            setShowNote(false)
            if (value) flash('Note saved')
          }}
        />
      ) : null}

      {showCancel && selected ? (
        <ConfirmModal
          title="Cancel ticket"
          message={
            selected.lines.some((l) => l.sent)
              ? `Cancel Quick Serve #${serveNo}? Kitchen may already have items.`
              : `Cancel Quick Serve #${serveNo}? This removes the ticket.`
          }
          confirmLabel="Cancel ticket"
          cancelLabel="Keep ticket"
          danger
          onClose={() => setShowCancel(false)}
          onConfirm={confirmCancel}
        />
      ) : null}

      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}
    </div>
  )
}
