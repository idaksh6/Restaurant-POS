import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import { lineTotal, money, nowTime, type OrderLine } from '../data/mock'
import { calcBill, cashFromSettle, recipesFromDishes } from '../lib/bill'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { getPermissions } from '../auth/roles'
import { SAUDI } from '../locale/saudi'
import { attachZatcaToReceipt } from '../hardware/zatca'

type PayTarget =
  | { kind: 'table'; id: string; title: string; lines: OrderLine[]; total: number; meta: string; status: string; discountPct: number; charges: { id: string; name: string; amount: number }[]; goods: number }
  | { kind: 'ticket'; id: string; title: string; lines: OrderLine[]; total: number; meta: string; status: string; discountPct: number; charges: { id: string; name: string; amount: number }[]; goods: number }

function PayIcon({ children }: { children: ReactNode }) {
  return (
    <svg className="pay-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

function IconReady() {
  return (
    <PayIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.2 11 14.7 15.5 9.5" />
    </PayIcon>
  )
}

function IconDining() {
  return (
    <PayIcon>
      <path d="M8 4v7a2 2 0 0 0 2 2v7" />
      <path d="M8 8H6M8 11H6" />
      <path d="M16 4c0 4 2 5 2 9v7" />
      <path d="M16 4v9" />
    </PayIcon>
  )
}

function IconBag() {
  return (
    <PayIcon>
      <path d="M5 8h9v9H5V8Z" />
      <path d="M14 11h3.5L20 14v3h-6v-6Z" />
      <circle cx="8" cy="18.5" r="1.4" />
      <circle cx="17" cy="18.5" r="1.4" />
    </PayIcon>
  )
}

function IconTotal() {
  return (
    <PayIcon>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M4 10h16" />
      <path d="M8 15h3" />
    </PayIcon>
  )
}

function IconTable() {
  return (
    <PayIcon>
      <rect x="3" y="7" width="18" height="4" rx="1.5" />
      <path d="M6 11v7M18 11v7M10 11v4M14 11v4" />
    </PayIcon>
  )
}

function IconTicket() {
  return (
    <PayIcon>
      <path d="M5 8.5A1.5 1.5 0 0 1 6.5 7h11A1.5 1.5 0 0 1 19 8.5v2a1.5 1.5 0 0 0 0 3v2A1.5 1.5 0 0 1 17.5 17h-11A1.5 1.5 0 0 1 5 15.5v-2a1.5 1.5 0 0 0 0-3v-2Z" />
      <path d="M12 8v8" />
    </PayIcon>
  )
}

function IconCashier() {
  return (
    <PayIcon>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3 4-4.5 7-4.5S17.6 16 19 19" />
    </PayIcon>
  )
}

function IconBill() {
  return (
    <PayIcon>
      <path d="M7 4h8l2 2v14H7V4Z" />
      <path d="M9.5 10h5M9.5 13h5M9.5 16h3" />
    </PayIcon>
  )
}

function IconSettle() {
  return (
    <PayIcon>
      <path d="M4 8h16v10H4V8Z" />
      <path d="M4 11h16" />
      <path d="M8 15h4" />
    </PayIcon>
  )
}

function IconCash() {
  return (
    <PayIcon>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M7 12h.01M17 12h.01" />
    </PayIcon>
  )
}

function IconCard() {
  return (
    <PayIcon>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </PayIcon>
  )
}

function IconWallet() {
  return (
    <PayIcon>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5v-8Z" />
      <path d="M16 13h4" />
      <circle cx="16.5" cy="13" r="1" />
    </PayIcon>
  )
}

function IconSplit() {
  return (
    <PayIcon>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
      <path d="M5 9h6M13 15h6" />
    </PayIcon>
  )
}

function IconMap() {
  return (
    <PayIcon>
      <path d="M4 6.5 9 4l6 2.5L20 4v13.5L15 20l-6-2.5L4 20V6.5Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </PayIcon>
  )
}

function IconQueue() {
  return (
    <PayIcon>
      <path d="M5 7h14M5 12h14M5 17h10" />
    </PayIcon>
  )
}

function statusIcon(status: string, kind: PayTarget['kind']) {
  if (kind === 'ticket' || status === 'takeaway' || status === 'delivery' || status === 'online') {
    return <IconBag />
  }
  if (status === 'billing') return <IconBill />
  return <IconDining />
}

export default function PaymentsPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { dishes } = useMasters()
  const { addCashIn } = useShift()
  const {
    tables,
    tableOrders,
    tickets,
    settleTable,
    settleTicket,
    requestBill,
    tableDiscounts,
    getTableChargeLines,
    deductRecipeStock,
    flash,
  } = usePos()
  const [target, setTarget] = useState<PayTarget | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [query, setQuery] = useState('')

  const canSettle = user ? getPermissions(user.role).canSettle : false

  const tableQueue = useMemo(() => {
    return tables
      .filter((t) => t.status === 'billing' || t.status === 'occupied')
      .map((table) => {
        const lines = tableOrders[table.id] ?? []
        const goods = lineTotal(lines)
        const discountPct = tableDiscounts[table.id] ?? 0
        const charges = getTableChargeLines(table.id, goods)
        const bill = calcBill(goods, discountPct, charges)
        const qty = lines.reduce((s, l) => s + l.qty, 0)
        return {
          kind: 'table' as const,
          id: table.id,
          title: `Table ${table.label}`,
          lines,
          goods,
          discountPct,
          charges,
          total: bill.total,
          meta: `${table.area} · ${table.guests ?? 0} guests · ${qty} items`,
          status: table.status,
        }
      })
      .filter((t) => t.lines.length > 0)
      .sort((a, b) => Number(b.status === 'billing') - Number(a.status === 'billing'))
  }, [tables, tableOrders, tableDiscounts, getTableChargeLines])

  const ticketQueue = useMemo(() => {
    return tickets
      .filter((ticket) => ticket.type !== 'dine-in' && ticket.lines.length > 0)
      .map((ticket) => {
        const goods = lineTotal(ticket.lines) + (ticket.deliveryFee ?? 0)
        const bill = calcBill(goods, 0, [])
        const qty = ticket.lines.reduce((s, l) => s + l.qty, 0)
        const channel =
          ticket.id.startsWith('qs-')
            ? 'quick-serve'
            : ticket.id.startsWith('dt-')
              ? 'drive-thru'
              : ticket.type
        return {
          kind: 'ticket' as const,
          id: ticket.id,
          title: ticket.customer,
          lines: ticket.lines,
          goods,
          discountPct: 0,
          charges: [] as { id: string; name: string; amount: number }[],
          total: bill.total,
          meta: `${channel} · ${qty} items${ticket.deliveryFee ? ` · fee ${money(ticket.deliveryFee)}` : ''}`,
          status: ticket.type,
        }
      })
  }, [tickets])

  const filteredTables = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tableQueue
    return tableQueue.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.meta.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q),
    )
  }, [tableQueue, query])

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ticketQueue
    return ticketQueue.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.meta.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q),
    )
  }, [ticketQueue, query])

  const queueTotal = useMemo(
    () => [...filteredTables, ...filteredTickets].reduce((s, i) => s + i.total, 0),
    [filteredTables, filteredTickets],
  )

  function complete(result: SettleResult) {
    if (!target || !user) return
    const bill = calcBill(target.goods, target.discountPct, target.charges)
    const redeemSar = result.loyaltyRedeemSar ?? 0
    if (result.customerId && (result.loyaltyRedeemPts ?? 0) > 0) {
      redeemPoints(result.customerId, result.loyaltyRedeemPts!)
    }
    const payable = Math.max(0, Math.round((bill.total - redeemSar) * 100) / 100)
    if (result.customerId) earnPoints(result.customerId, payable)
    const custName = customers.find((c) => c.id === result.customerId)?.name
    deductRecipeStock(target.lines, recipesFromDishes(dishes))
    const settleMeta = {
      method: result.method,
      source: target.title,
      staff: user.name,
      subtotal: target.goods,
      tax: bill.tax,
      total: payable,
      discountAmt: bill.discountAmt || undefined,
      lines: target.lines.map((l) => ({ ...l })),
      splitPayments: result.splitPayments,
      customerId: result.customerId,
      loyaltyRedeem: redeemSar || undefined,
      charges: target.charges.length ? target.charges : undefined,
    }
    if (target.kind === 'table') {
      settleTable(target.id, settleMeta)
    } else {
      settleTicket(target.id, settleMeta)
    }
    setReceipt(
      attachZatcaToReceipt({
        title: target.title,
        method: result.method,
        lines: target.lines.map((l) => ({ ...l })),
        subtotal: target.goods,
        discountAmt: bill.discountAmt || undefined,
        charges: target.charges.length
          ? target.charges.map((c) => ({ name: c.name, amount: c.amount }))
          : undefined,
        tax: bill.tax,
        total: payable,
        loyaltyRedeem: redeemSar || undefined,
        splitParts: result.splitParts,
        splitPayments: result.splitPayments,
        tendered: result.tendered,
        change: result.change,
        staff: user.name,
        time: nowTime(),
        customerName: custName,
        kind: 'paid',
      }),
    )
    addCashIn(cashFromSettle(result.method, payable, result.splitPayments))
    setTarget(null)
    flash(`Paid by ${result.method}`)
  }

  if (!canSettle) {
    return (
      <div className="zk-pay">
        <DashHeader search={query} onSearchChange={setQuery} brandTo="/" />
        <div className="panel floor-panel">
          <div className="ticket-empty">
            <strong>Payments locked for your role</strong>
            Only Cashier and Admin can settle.
            <div style={{ marginTop: '1rem' }}>
              <Link to="/" className="btn btn-ghost">
                Back home
              </Link>
            </div>
          </div>
        </div>
        <HubFooter backTo="/" backLabel={t.home} />
      </div>
    )
  }

  function renderRows(items: PayTarget[]) {
    return (
      <div className="pay-list">
        <div className="pay-list-head">
          <span>Order</span>
          <span>Details</span>
          <span>Status</span>
          <span>Amount</span>
          <span>Action</span>
        </div>
        {items.map((item) => (
          <div key={`${item.kind}-${item.id}`} className={`pay-list-row ${item.status}`}>
            <strong className="pay-list-title">
              <span className="pay-list-ico" aria-hidden>
                {item.kind === 'table' ? <IconTable /> : <IconTicket />}
              </span>
              {item.title}
            </strong>
            <span className="pay-list-meta">{item.meta}</span>
            <span className={`pay-badge ${item.kind === 'ticket' ? 'ticket' : item.status}`}>
              <span className="pay-badge-ico" aria-hidden>
                {statusIcon(item.status, item.kind)}
              </span>
              {item.status}
            </span>
            <strong className="pay-list-amount">{money(item.total)}</strong>
            <div className="pay-list-actions">
              {item.kind === 'table' && item.status !== 'billing' ? (
                <button
                  type="button"
                  className="btn btn-ghost pay-action-btn"
                  onClick={() => {
                    requestBill(item.id)
                    flash('Marked billing')
                  }}
                >
                  <IconBill />
                  Mark billing
                </button>
              ) : null}
              <button type="button" className="btn btn-primary pay-action-btn" onClick={() => setTarget(item)}>
                <IconSettle />
                Settle
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="zk-pay">
      <DashHeader search={query} onSearchChange={setQuery} brandTo="/" />
      <div className="pay-page">
        <section className="pay-desk">
          <header className="pay-desk-head">
            <div>
              <h2>
                <IconQueue />
                Settle queue
              </h2>
              <p className="pay-sub">
                {filteredTables.length + filteredTickets.length} pending · {money(queueTotal)} due
              </p>
            </div>
            <span className="pay-cashier">
              <IconCashier />
              Cashier · {user?.name}
            </span>
          </header>

          <div className="pay-metrics">
            <div className="pay-metric">
              <span className="pay-metric-ico" aria-hidden>
                <IconReady />
              </span>
              <div>
                <strong>{filteredTables.filter((t) => t.status === 'billing').length}</strong>
                <span>Ready to pay</span>
              </div>
            </div>
            <div className="pay-metric">
              <span className="pay-metric-ico" aria-hidden>
                <IconDining />
              </span>
              <div>
                <strong>{filteredTables.filter((t) => t.status === 'occupied').length}</strong>
                <span>Still dining</span>
              </div>
            </div>
            <div className="pay-metric">
              <span className="pay-metric-ico" aria-hidden>
                <IconBag />
              </span>
              <div>
                <strong>{filteredTickets.length}</strong>
                <span>Takeaway / delivery</span>
              </div>
            </div>
            <div className="pay-metric highlight">
              <span className="pay-metric-ico" aria-hidden>
                <IconTotal />
              </span>
              <div>
                <strong>{money(queueTotal)}</strong>
                <span>Queue total</span>
              </div>
            </div>
          </div>

          <div className="pay-queue">
            {filteredTables.length > 0 ? (
              <div className="pay-section">
                <div className="pay-section-title">
                  <IconTable />
                  Dine-in tables
                </div>
                {renderRows(filteredTables)}
              </div>
            ) : null}

            {filteredTickets.length > 0 ? (
              <div className="pay-section">
                <div className="pay-section-title">
                  <IconBag />
                  Takeaway · Delivery · Online
                </div>
                {renderRows(filteredTickets)}
              </div>
            ) : null}

            {filteredTables.length === 0 && filteredTickets.length === 0 ? (
              <div className="pay-empty">
                <strong>Queue empty</strong>
                <span>
                  {query.trim()
                    ? 'No bills match your search.'
                    : 'No open bills. They appear here when a waiter requests payment.'}
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="pay-rail">
          <div className="pay-rail-copy">
            <h2>Settle from here</h2>
            <p>Take cash, mada, cards, or wallets. Split when the table asks.</p>
          </div>

          <div className="pay-methods">
            <span>
              <IconCash />
              Cash
            </span>
            <span>
              <IconCard />
              mada
            </span>
            <span>
              <IconCard />
              Visa / MC
            </span>
            <span>
              <IconWallet />
              Apple Pay
            </span>
            <span>
              <IconWallet />
              STC Pay
            </span>
            <span>
              <IconSplit />
              Split
            </span>
          </div>

          <ol className="pay-guide">
            <li>
              <strong>Waiter bills the table</strong>
              <span>Status moves to billing</span>
            </li>
            <li>
              <strong>Take payment here</strong>
              <span>Cash · mada · Apple Pay · STC Pay</span>
            </li>
            <li>
              <strong>Receipt prints</strong>
              <span>Table frees · {SAUDI.vatLabel}</span>
            </li>
          </ol>

          <Link to="/dine-in" className="btn btn-teal pay-floor-btn">
            <IconMap />
            Open floor map
          </Link>
        </aside>
      </div>
      <HubFooter backTo="/" backLabel={t.home} />
      {target ? (
        <SettleModal
          title={target.title}
          total={target.total}
          customers={customers}
          onClose={() => setTarget(null)}
          onConfirm={complete}
        />
      ) : null}
      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}
    </div>
  )
}
