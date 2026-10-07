import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import { lineTotal, money, nowTime, type OrderLine, type OrderType } from '../data/mock'
import { calcBill, cashFromSettle, recipesFromDishes } from '../lib/bill'
import { localizedAreaName } from '../lib/branding'
import { orderTaxBillOptions } from '../data/tax'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { getPermissions } from '../auth/roles'
import { attachZatcaToReceipt } from '../hardware/zatca'
import { buildReceiptIdentity } from '../lib/receiptIds'

type PayTarget =
  | { kind: 'table'; id: string; title: string; lines: OrderLine[]; total: number; meta: string; status: string; discountPct: number; charges: { id: string; name: string; amount: number }[]; goods: number; orderType: OrderType; area?: string }
  | { kind: 'ticket'; id: string; title: string; lines: OrderLine[]; total: number; meta: string; status: string; discountPct: number; charges: { id: string; name: string; amount: number }[]; goods: number; orderType: OrderType; area?: string }

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
  const { t, lang } = useI18n()
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { dishes } = useMasters()
  const { taxes } = useCatalog()
  const { company } = useBranch()
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
  const taxEnabled = company.enableTax !== false

  function statusDisplay(status: string, kind: PayTarget['kind']) {
    if (kind === 'ticket') {
      if (status === 'takeaway') return t.navTakeaway
      if (status === 'delivery') return t.navDelivery
      if (status === 'online') return t.navOnline
      return status
    }
    if (status === 'billing') return t.tableBilling
    if (status === 'occupied') return t.payStillDining
    return status
  }

  function channelLabel(channel: string) {
    if (channel === 'quick-serve') return t.quickServe
    if (channel === 'drive-thru') return t.driveThru
    if (channel === 'takeaway') return t.navTakeaway
    if (channel === 'delivery') return t.navDelivery
    if (channel === 'online') return t.navOnline
    return channel
  }

  const tableQueue = useMemo(() => {
    return tables
      .filter((table) => table.status === 'billing' || table.status === 'occupied')
      .map((table) => {
        const lines = tableOrders[table.id] ?? []
        const goods = lineTotal(lines)
        const discountPct = tableDiscounts[table.id] ?? 0
        const charges = getTableChargeLines(table.id, goods)
        const bill = calcBill(
          goods,
          discountPct,
          charges,
          orderTaxBillOptions(lines, dishes, taxes, taxEnabled),
        )
        const qty = lines.reduce((s, l) => s + l.qty, 0)
        const guests = table.guests ?? 0
        return {
          kind: 'table' as const,
          id: table.id,
          title: `${t.printTable} ${table.label}`,
          lines,
          goods,
          discountPct,
          charges,
          total: bill.total,
          meta: `${localizedAreaName(table.area, lang)} · ${t.payGuestsCount.replace('{n}', String(guests))} · ${qty} ${qty === 1 ? t.itemOne : t.itemMany}`,
          status: table.status,
          orderType: 'dine-in' as const,
          area: table.area,
        }
      })
      .filter((item) => item.lines.length > 0)
      .sort((a, b) => Number(b.status === 'billing') - Number(a.status === 'billing'))
  }, [tables, tableOrders, tableDiscounts, getTableChargeLines, dishes, taxes, taxEnabled, t, lang])

  const ticketQueue = useMemo(() => {
    return tickets
      .filter((ticket) => ticket.type !== 'dine-in' && ticket.lines.length > 0)
      .map((ticket) => {
        const lineGoods = lineTotal(ticket.lines)
        const fee = ticket.deliveryFee ?? 0
        const charges =
          fee > 0 ? [{ id: 'delivery-fee', name: t.dlDeliveryFee, amount: fee }] : []
        const bill = calcBill(
          lineGoods,
          0,
          charges,
          orderTaxBillOptions(ticket.lines, dishes, taxes, taxEnabled),
        )
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
          goods: lineGoods,
          discountPct: 0,
          charges,
          total: bill.total,
          meta: `${channelLabel(channel)} · ${qty} ${qty === 1 ? t.itemOne : t.itemMany}${fee ? ` · ${t.payFeeMeta.replace('{amount}', money(fee, lang))}` : ''}`,
          status: ticket.type,
          orderType: ticket.type,
        }
      })
  }, [tickets, dishes, taxes, taxEnabled, t, lang])

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
    const bill = calcBill(
      target.goods,
      target.discountPct,
      target.charges,
      orderTaxBillOptions(target.lines, dishes, taxes, taxEnabled),
    )
    const redeemSar = result.loyaltyRedeemSar ?? 0
    if (result.customerId && (result.loyaltyRedeemPts ?? 0) > 0) {
      redeemPoints(result.customerId, result.loyaltyRedeemPts!)
    }
    const roundOff = Math.round((result.roundOff ?? 0) * 100) / 100
    const payable = Math.max(0, Math.round((bill.total - redeemSar + roundOff) * 100) / 100)
    if (result.customerId) earnPoints(result.customerId, payable)
    const custName = customers.find((c) => c.id === result.customerId)?.name
    deductRecipeStock(target.lines, recipesFromDishes(dishes))
    const dineTicket =
      target.kind === 'table'
        ? tickets.find(
            (tk) =>
              tk.tableId === target.id &&
              tk.checkStatus !== 'settled' &&
              tk.checkStatus !== 'merged',
          )
        : null
    const table = target.kind === 'table' ? tables.find((tb) => tb.id === target.id) : null
    const ids = buildReceiptIdentity({
      ticketId: target.kind === 'ticket' ? target.id : dineTicket?.id,
      staff: user,
      tableLabel: table?.label,
    })
    const settleMeta = {
      method: result.method,
      source: target.title,
      staff: user.name,
      staffUsername: ids.user,
      billNo: ids.billNo,
      orderId: ids.orderId,
      tableLabel: ids.tableLabel,
      subtotal: target.goods,
      tax: bill.tax,
      total: payable,
      discountAmt: bill.discountAmt || undefined,
      roundOff: roundOff || undefined,
      tendered: result.tendered,
      change: result.change,
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
        staffUsername: ids.user,
        billNo: ids.billNo,
        orderId: ids.orderId,
        tableLabel: ids.tableLabel,
        time: nowTime(),
        customerName: custName,
        kind: 'paid',
        orderType: target.orderType,
        tableArea: target.area,
      }),
    )
    addCashIn(cashFromSettle(result.method, payable, result.splitPayments))
    setTarget(null)
    flash(t.payPaidByFlash.replace('{method}', result.method))
  }

  if (!canSettle) {
    return (
      <div className="zk-pay">
        <DashHeader search={query} onSearchChange={setQuery} brandTo="/" />
        <div className="panel floor-panel">
          <div className="ticket-empty">
            <strong>{t.payLockedTitle}</strong>
            {t.payLockedBody}
            <div style={{ marginTop: '1rem' }}>
              <Link to="/" className="btn btn-ghost">
                {t.payBackHome}
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
          <span>{t.payColOrder}</span>
          <span>{t.payColDetails}</span>
          <span>{t.payColStatus}</span>
          <span>{t.payColAmount}</span>
          <span>{t.payColAction}</span>
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
              {statusDisplay(item.status, item.kind)}
            </span>
            <strong className="pay-list-amount">{money(item.total, lang)}</strong>
            <div className="pay-list-actions">
              {item.kind === 'table' && item.status !== 'billing' ? (
                <button
                  type="button"
                  className="btn btn-ghost pay-action-btn"
                  onClick={() => {
                    requestBill(item.id)
                    flash(t.payMarkedBillingFlash)
                  }}
                >
                  <IconBill />
                  {t.payMarkBilling}
                </button>
              ) : null}
              <button type="button" className="btn btn-primary pay-action-btn" onClick={() => setTarget(item)}>
                <IconSettle />
                {t.settle}
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
                {t.paySettleQueue}
              </h2>
              <p className="pay-sub">
                {t.payPendingDue
                  .replace('{n}', String(filteredTables.length + filteredTickets.length))
                  .replace('{amount}', money(queueTotal, lang))}
              </p>
            </div>
            <span className="pay-cashier">
              <IconCashier />
              {t.payCashier.replace('{name}', user?.name ?? '')}
            </span>
          </header>

          <div className="pay-metrics">
            <div className="pay-metric tone-ready">
              <span className="pay-metric-ico" aria-hidden>
                <IconReady />
              </span>
              <div>
                <strong>{filteredTables.filter((row) => row.status === 'billing').length}</strong>
                <span>{t.payReadyToPay}</span>
              </div>
            </div>
            <div className="pay-metric tone-dining">
              <span className="pay-metric-ico" aria-hidden>
                <IconDining />
              </span>
              <div>
                <strong>{filteredTables.filter((row) => row.status === 'occupied').length}</strong>
                <span>{t.payStillDining}</span>
              </div>
            </div>
            <div className="pay-metric tone-takeaway">
              <span className="pay-metric-ico" aria-hidden>
                <IconBag />
              </span>
              <div>
                <strong>{filteredTickets.length}</strong>
                <span>{t.payTakeawayDelivery}</span>
              </div>
            </div>
            <div className="pay-metric tone-total highlight">
              <span className="pay-metric-ico" aria-hidden>
                <IconTotal />
              </span>
              <div>
                <strong>{money(queueTotal, lang)}</strong>
                <span>{t.payQueueTotal}</span>
              </div>
            </div>
          </div>

          <div className="pay-queue">
            {filteredTables.length > 0 ? (
              <div className="pay-section">
                <div className="pay-section-title">
                  <IconTable />
                  {t.payDineInTables}
                </div>
                {renderRows(filteredTables)}
              </div>
            ) : null}

            <div className="pay-section">
              <div className="pay-section-title">
                <IconBag />
                {t.payTakeawayDeliveryOnline}
              </div>
              {filteredTickets.length > 0 ? (
                renderRows(filteredTickets)
              ) : (
                <div className="pay-section-empty">
                  <IconBag />
                  <strong>{t.payNoTakeawayOrders}</strong>
                  <span>{query.trim() ? t.payEmptySearchHint : t.payEmptyHint}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="pay-rail">
          <div className="pay-rail-copy">
            <h2>{t.paySettleFromHere}</h2>
            <p>{t.paySettleHint}</p>
          </div>

          <div className="pay-methods">
            <span className="pay-method tone-cash">
              <IconCash />
              {t.cash}
            </span>
            <span className="pay-method tone-mada">
              <IconCard />
              {t.payMada}
            </span>
            <span className="pay-method tone-card">
              <IconCard />
              {t.payVisaMc}
            </span>
            <span className="pay-method tone-wallet">
              <IconWallet />
              {t.payApplePay}
            </span>
            <span className="pay-method tone-stc">
              <IconWallet />
              {t.payStcPay}
            </span>
            <span className="pay-method tone-split">
              <IconSplit />
              {t.settleSplitBill}
            </span>
          </div>

          <ol className="pay-guide">
            <li>
              <strong>{t.payGuideWaiter}</strong>
              <span>{t.payGuideStatusBilling}</span>
            </li>
            <li>
              <strong>{t.payGuideTakePayment}</strong>
              <span>{t.payGuideMethods}</span>
            </li>
            <li>
              <strong>{t.payGuideReceipt}</strong>
              <span>{t.payGuideTableVat.replace('{vat}', t.vat)}</span>
            </li>
          </ol>

          <Link to="/dine-in" className="btn btn-teal pay-floor-btn">
            <IconMap />
            {t.payOpenFloorMap}
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
