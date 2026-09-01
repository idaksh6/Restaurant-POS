import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import ConfirmModal from '../components/ConfirmModal'
import MenuPicker from '../components/MenuPicker'
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

function TaIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="ta-ico"
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

function IconBag() {
  return (
    <TaIcon>
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </TaIcon>
  )
}
function IconPlus() {
  return (
    <TaIcon>
      <path d="M12 5v14M5 12h14" />
    </TaIcon>
  )
}
function IconSend() {
  return (
    <TaIcon>
      <path d="M4 12h12" />
      <path d="M13 7l5 5-5 5" />
      <path d="M4 7v10" />
    </TaIcon>
  )
}
function IconPay() {
  return (
    <TaIcon>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </TaIcon>
  )
}
function IconUser() {
  return (
    <TaIcon>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
    </TaIcon>
  )
}
function IconBolt() {
  return (
    <TaIcon>
      <path d="M13 2 6 13h6l-1 9 7-11h-6l1-9Z" />
    </TaIcon>
  )
}
function IconTicket() {
  return (
    <TaIcon>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v1.2a1.8 1.8 0 0 0 0 3.6V16a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 15.5v-7Z" />
      <path d="M12 8v8" />
    </TaIcon>
  )
}

function IconCancel() {
  return (
    <TaIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </TaIcon>
  )
}

function IconHold() {
  return (
    <TaIcon>
      <rect x="5" y="4" width="4" height="16" rx="1" />
      <rect x="15" y="4" width="4" height="16" rx="1" />
    </TaIcon>
  )
}

function ticketNo(ticket: OpenTicket) {
  const fromCustomer = ticket.customer.match(/#(\d+)/)
  if (fromCustomer) return fromCustomer[1]
  const fromId = ticket.id.match(/tk-(\d+)/)
  return fromId?.[1] ?? '—'
}

function statusOf(ticket: OpenTicket) {
  if (ticket.held) return { label: 'Held', tone: 'held' as const }
  if (ticket.lines.length === 0) return { label: 'New', tone: 'muted' as const }
  if (ticket.lines.some((l) => !l.sent)) return { label: 'Open', tone: 'amber' as const }
  return { label: 'Sent', tone: 'teal' as const }
}

export default function TakeawayPage() {
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
    updateTicket,
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

  const takeaway = useMemo(
    () =>
      tickets.filter(
        (t) => t.type === 'takeaway' && !t.id.startsWith('qs-') && !t.id.startsWith('dt-'),
      ),
    [tickets],
  )

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ticketNote, setTicketNote] = useState('')
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null)
  const [showCustomer, setShowCustomer] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)

  useEffect(() => {
    if (!selectedId) return
    if (!takeaway.some((t) => t.id === selectedId)) {
      setSelectedId(null)
      setTicketNote('')
      setLinkedCustomerId(null)
    }
  }, [takeaway, selectedId])

  const selected = takeaway.find((t) => t.id === selectedId) ?? null
  const lines = selected?.lines ?? []
  const pending = lines.filter((l) => !l.sent).length
  const goods = lineTotal(lines)
  const bill = useMemo(() => calcBill(goods, 0, []), [goods])
  const { tax, total, taxable } = bill

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    const list = !q
      ? takeaway
      : takeaway.filter(
          (t) =>
            t.customer.toLowerCase().includes(q) ||
            t.id.toLowerCase().includes(q) ||
            (t.phone ?? '').includes(q),
        )
    // Active queue first, held tickets at the end
    return [...list].sort((a, b) => Number(!!a.held) - Number(!!b.held))
  }, [takeaway, q])

  const openCount = takeaway.filter((t) => !t.held && t.lines.some((l) => !l.sent)).length
  const readyCount = takeaway.filter(
    (t) => !t.held && t.lines.length > 0 && t.lines.every((l) => l.sent),
  ).length
  const heldCount = takeaway.filter((t) => t.held).length
  const queueTotal = takeaway.reduce((s, t) => s + calcBill(lineTotal(t.lines), 0, []).total, 0)

  const linkedCustomer = linkedCustomerId
    ? customers.find((c) => c.id === linkedCustomerId)
    : undefined

  function createTicket(opts?: { quiet?: boolean; walkIn?: boolean }) {
    if (dayIsClosed) {
      flash('Day is closed — reopen in Back Office')
      return
    }
    const n = nextSeq('takeaway')
    const useCustomer = opts?.walkIn ? undefined : linkedCustomer
    const ticket: OpenTicket = {
      id: `tk-${n}-${Date.now()}`,
      type: 'takeaway',
      customer: useCustomer
        ? `Walk-in #${n} · ${useCustomer.name}`
        : `Walk-in #${n}`,
      phone: useCustomer?.phone,
      openedAt: nowTime(),
      lines: [],
      held: false,
    }
    addTicket(ticket)
    setSelectedId(ticket.id)
    setTicketNote('')
    if (opts?.walkIn) setLinkedCustomerId(null)
    if (!opts?.quiet) flash(`Takeaway #${n}`)
  }

  function selectTicket(ticket: OpenTicket) {
    if (ticket.held) {
      updateTicket(ticket.id, { held: false, heldAt: undefined })
      flash(`Resumed · #${ticketNo(ticket)}`)
    }
    setSelectedId(ticket.id)
    setTicketNote('')
    const match = customers.find(
      (c) => c.name === ticket.customer || (ticket.phone && c.phone === ticket.phone),
    )
    setLinkedCustomerId(match?.id ?? null)
  }

  function holdTicket() {
    if (!selected) return
    if (dayIsClosed) {
      flash('Day is closed', 'err')
      return
    }
    if (selected.lines.length === 0) {
      flash('Add items before holding', 'err')
      return
    }
    const n = ticketNo(selected)
    updateTicket(selected.id, { held: true, heldAt: nowTime() })
    setTicketNote('')
    createTicket({ quiet: true, walkIn: true })
    flash(`Held #${n} · next customer ready`)
  }

  function applyCustomer(customerId: string | null) {
    setLinkedCustomerId(customerId)
    setShowCustomer(false)
    if (!selected) return
    if (!customerId) {
      const n = ticketNo(selected)
      updateTicket(selected.id, { customer: `Walk-in #${n}`, phone: undefined })
      flash('Walk-in')
      return
    }
    const c = customers.find((x) => x.id === customerId)
    if (!c) return
    const n = ticketNo(selected)
    updateTicket(selected.id, {
      customer: `Walk-in #${n} · ${c.name}`,
      phone: c.phone,
    })
    flash(`Customer · ${c.name}`)
  }

  function requestCancel() {
    if (!selected) return
    setShowCancel(true)
  }

  function confirmCancel() {
    if (!selected) return
    const id = selected.id
    cancelTicket(id, 'Cancelled from takeaway')
    setShowCancel(false)
    setSelectedId(null)
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
      source: `Takeaway · ${selected.customer}`,
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
      title: `Takeaway · ${selected.customer}`,
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
    setSelectedId(null)
    setLinkedCustomerId(null)
    setTicketNote('')
  }

  return (
    <div className="zk-ta">
      <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />

      <div className="ta-page">
        <header className="ta-toolbar">
          <div className="ta-toolbar-brand">
            <span className="ta-hero-mark">
              <IconBag />
            </span>
            <div>
              <h1>Takeaway</h1>
              <p>
                {takeaway.length} open · {openCount} need KOT · {money(queueTotal)}
                {dayIsClosed ? ' · day closed' : ''}
              </p>
            </div>
          </div>
          <div className="ta-toolbar-stats" aria-hidden={false}>
            <span>
              <strong>{takeaway.length}</strong> tickets
            </span>
            <span>
              <strong>{openCount}</strong> KOT
            </span>
            <span>
              <strong>{readyCount}</strong> ready
            </span>
            {heldCount ? (
              <span className="ta-stat-held">
                <strong>{heldCount}</strong> held
              </span>
            ) : null}
          </div>
          <div className="ta-hero-actions">
            {dayIsClosed ? <span className="ta-pill closed">Day closed</span> : null}
            <Link to="/quick-serve" className="ta-link-btn">
              <IconBolt /> Quick serve
            </Link>
            <button
              type="button"
              className="btn btn-primary ta-new-btn"
              disabled={dayIsClosed}
              onClick={() => createTicket()}
            >
              <IconPlus /> New ticket
            </button>
          </div>
        </header>

        <section className="ta-rail">
          <div className="ta-rail-head">
            <h2>
              <IconTicket /> Queue
            </h2>
            <span className="ta-chip">{filtered.length}</span>
          </div>
          <div className="ta-rail-scroll">
            {filtered.map((ticket) => {
              const st = statusOf(ticket)
              const amt = calcBill(lineTotal(ticket.lines), 0, []).total
              const active = ticket.id === selectedId
              return (
                <button
                  key={ticket.id}
                  type="button"
                  className={`ta-rail-card${active ? ' selected' : ''}${ticket.held ? ' held' : ''}`}
                  onClick={() => selectTicket(ticket)}
                  title={ticket.held ? 'Tap to resume held customer' : undefined}
                >
                  <span className="ta-ticket-no">#{ticketNo(ticket)}</span>
                  <span className="ta-rail-copy">
                    <strong>{ticket.customer.replace(/^Walk-in /, '')}</strong>
                    <em className={`ta-status ${st.tone}`}>{st.label}</em>
                  </span>
                  <span className="ta-rail-amt">{money(amt)}</span>
                </button>
              )
            })}
            <button
              type="button"
              className="ta-rail-add"
              disabled={dayIsClosed}
              onClick={() => createTicket()}
              title="New ticket"
            >
              <IconPlus />
              <span>New</span>
            </button>
            {filtered.length === 0 && takeaway.length > 0 ? (
              <div className="ta-rail-empty">No matches</div>
            ) : null}
          </div>
        </section>

        <section className={`ta-work-panel${selected ? ' has-ticket' : ''}`}>
          {!selected ? (
            <div className="ta-empty tall">
              <IconBag />
              <strong>Select a ticket</strong>
              <span>Pick from the queue above or create a new takeaway order.</span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={dayIsClosed}
                onClick={() => createTicket()}
              >
                <IconPlus /> New ticket
              </button>
            </div>
          ) : (
            <>
              <div className="ta-work-head">
                <div>
                  <h2>
                    #{ticketNo(selected)} <em>Takeaway</em>
                  </h2>
                  <div className="ta-work-tags">
                    <span className={`ta-status ${statusOf(selected).tone}`}>
                      {statusOf(selected).label}
                    </span>
                    <span className="ta-chip soft">{selected.customer}</span>
                    {linkedCustomer ? (
                      <span className="ta-chip soft">
                        <IconUser /> {linkedCustomer.name}
                      </span>
                    ) : null}
                    {dayIsClosed ? <span className="ta-pill closed">Day closed</span> : null}
                  </div>
                </div>
                  <div className="ta-work-tools">
                    <button type="button" className="ta-tool" onClick={() => setShowCustomer(true)}>
                      <IconUser /> Customer
                    </button>
                    <button type="button" className="ta-tool" onClick={() => setShowNote(true)}>
                      Note
                    </button>
                    <button
                      type="button"
                      className="ta-tool hold"
                      disabled={dayIsClosed || selected.lines.length === 0 || selected.held}
                      title="Park this customer and serve the next one"
                      onClick={holdTicket}
                    >
                      <IconHold /> Hold
                    </button>
                    <button type="button" className="ta-tool danger" onClick={requestCancel}>
                      <IconCancel /> Cancel
                    </button>
                  </div>
              </div>

              {ticketNote ? <p className="ta-note">Note: {ticketNote}</p> : null}

              <div className="ta-work-body">
                <div className="ta-menu">
                  <MenuPicker
                    onAdd={(item, note) => {
                      if (dayIsClosed) {
                        flash('Day is closed')
                        return
                      }
                      addToTicket(selected.id, item, note)
                    }}
                  />
                </div>

                <div className="ta-order">
                  <div className="ta-panel-head compact">
                    <h2>Order</h2>
                    <span className="ta-chip">
                      {lines.length} · {pending ? `${pending} unsent` : 'all sent'}
                    </span>
                  </div>
                  <div className="ta-lines">
                    {lines.length === 0 ? (
                      <div className="ta-empty inline">
                        <strong>No items yet</strong>
                        <span>Tap products to build the ticket.</span>
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
                              onClick={() => changeTicketQty(selected.id, line.id, -1)}
                            >
                              −
                            </button>
                            <span>{line.qty}</span>
                            <button
                              type="button"
                              disabled={dayIsClosed}
                              onClick={() => changeTicketQty(selected.id, line.id, 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="ta-totals">
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

                    <div className="ta-actions">
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
                          className="btn btn-primary"
                          disabled={lines.length === 0 || dayIsClosed}
                          onClick={() => setShowSettle(true)}
                        >
                          <IconPay /> Settle
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={lines.length === 0}
                          onClick={() => flash('Ticket ready — cashier will settle')}
                        >
                          Send to cashier
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost ta-cancel-btn" onClick={requestCancel}>
                        <IconCancel /> Cancel ticket
                      </button>
                    </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <HubFooter backTo="/" backLabel="Home" />

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
          title={selected.customer}
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
              <button type="button" className="btn btn-ghost" onClick={() => applyCustomer(null)}>
                Walk-in
              </button>
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => applyCustomer(c.id)}
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
              ? `Cancel ${selected.customer}? Kitchen may already have items.`
              : `Cancel ${selected.customer}? This removes the ticket from the queue.`
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
