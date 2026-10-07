import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import ConfirmModal from '../components/ConfirmModal'
import MenuPicker from '../components/MenuPicker'
import QtyStepper from '../components/QtyStepper'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import TextPromptModal from '../components/TextPromptModal'
import { redeemFoodVoucher } from '../data/foodVouchers'
import { ITEM_NOTE_SUGGESTIONS } from '../data/itemNotes'
import { lineTotal, money, nowTime, type OpenTicket } from '../data/mock'
import { hydrateSequencesFromApi, nextSeq } from '../data/sequences'
import { calcBill, calcBillWithFoodVoucher, cashFromSettle, recipesFromDishes, settleAfterFoodVoucher } from '../lib/bill'
import { floorDiscountPercents } from '../data/discount'
import {
  companyDefaultTaxPercent,
  dishTaxPercent,
  normalizeTaxIds,
  orderTaxBillOptions,
  taxBreakdownForOrder,
  vatDisplayLabel,
  vatRateLabel,
} from '../data/tax'
import { localizedLineName } from '../lib/branding'
import { lineNameWithoutOptions, parseOrderLineNote } from '../lib/orderLineOptions'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { useSync } from '../sync/SyncContext'
import { attachZatcaToReceipt } from '../hardware/zatca'
import { buildReceiptIdentity } from '../lib/receiptIds'

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

function statusOf(
  ticket: OpenTicket,
  labels: { held: string; empty: string; open: string; sent: string },
) {
  if (ticket.held) return { label: labels.held, tone: 'held' as const }
  if (ticket.lines.length === 0) return { label: labels.empty, tone: 'muted' as const }
  if (ticket.lines.some((l) => !l.sent)) return { label: labels.open, tone: 'amber' as const }
  return { label: labels.sent, tone: 'teal' as const }
}

export default function TakeawayPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const perms = user ? getPermissions(user.role) : getPermissions('cashier')
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { dishes } = useMasters()
  const { redeemGiftCard, taxes, discounts } = useCatalog()
  const { addCashIn } = useShift()
  const { activeBranchId, company } = useBranch()
  const { syncEpoch } = useSync()
  const {
    tickets,
    addTicket,
    updateTicket,
    addToTicket,
    changeTicketQty,
    setTicketLineNote,
    voidTicketLine,
    setTicketDiscount,
    toggleTicketCharge,
    getTicketChargeLines,
    chargeCatalog,
    sendTicketOrders,
    settleTicket,
    cancelTicket,
    deductRecipeStock,
    flash,
    dayIsClosed,
  } = usePos()

  const discountPicks = useMemo(() => floorDiscountPercents(discounts), [discounts])

  const statusLabels = useMemo(
    () => ({
      held: t.taStatusHeld,
      empty: t.taStatusNew,
      open: t.taStatusOpen,
      sent: t.taStatusSent,
    }),
    [t],
  )

  useEffect(() => {
    void hydrateSequencesFromApi().catch(() => undefined)
  }, [syncEpoch, activeBranchId])

  const takeaway = useMemo(
    () =>
      tickets.filter(
        (t) =>
          t.type === 'takeaway' &&
          !t.id.startsWith('qs-') &&
          !t.id.startsWith('dt-') &&
          !t.id.startsWith('bc-') &&
          t.channel !== 'barcode',
      ),
    [tickets],
  )

  const [searchParams] = useSearchParams()
  const deepTicketId = searchParams.get('ticket')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(() => deepTicketId)
  const [ticketNote, setTicketNote] = useState('')
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null)
  const [showCustomer, setShowCustomer] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [voidTarget, setVoidTarget] = useState<{
    ticketId: string
    lineId: string
    name: string
  } | null>(null)
  const [noteTarget, setNoteTarget] = useState<{
    ticketId: string
    lineId: string
    name: string
    note: string
  } | null>(null)

  useEffect(() => {
    if (deepTicketId && takeaway.some((t) => t.id === deepTicketId)) {
      setSelectedId(deepTicketId)
      return
    }
    if (!selectedId) return
    if (!takeaway.some((t) => t.id === selectedId)) {
      setSelectedId(null)
      setTicketNote('')
      setLinkedCustomerId(null)
    }
  }, [takeaway, selectedId, deepTicketId])

  const selected = takeaway.find((t) => t.id === selectedId) ?? null

  useEffect(() => {
    setTicketNote(selected?.note?.trim() ?? '')
  }, [selected?.id, selected?.note])

  const lines = selected?.lines ?? []
  const pending = lines.filter((l) => !l.sent).length
  const goods = lineTotal(lines)
  const discountPct = selected?.discountPct ?? 0
  const chargeIdsKey = (selected?.chargeIds ?? []).join(',')
  const taxEnabled = company.enableTax !== false
  const chargeLines = useMemo(
    () => (selected ? getTicketChargeLines(selected.id, goods) : []),
    // chargeIdsKey forces refresh when toggles change; getTicketChargeLines reads ticketsRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected?.id, chargeIdsKey, goods, getTicketChargeLines],
  )
  const taxOpts = useMemo(
    () => orderTaxBillOptions(lines, dishes, taxes, taxEnabled),
    [lines, dishes, taxes, taxEnabled],
  )
  const bill = useMemo(
    () => calcBill(goods, discountPct, chargeLines, taxOpts),
    [goods, discountPct, chargeLines, taxOpts],
  )
  const { tax, total, taxByRate, discountAmt } = bill
  const vatDetailRows = useMemo(
    () =>
      taxBreakdownForOrder({
        lines,
        dishes,
        taxes,
        discountPct,
        charges: chargeLines,
        enableTax: taxEnabled,
        taxByRate,
      }),
    [lines, dishes, taxes, discountPct, chargeLines, taxEnabled, taxByRate],
  )
  const vatLabel = useMemo(
    () =>
      vatDisplayLabel(
        companyDefaultTaxPercent(taxes),
        taxByRate.length > 1 ||
          lines.some((l) => {
            const dish = dishes.find((d) => d.id === l.itemId)
            return dishTaxPercent(dish?.taxIds, taxes) !== companyDefaultTaxPercent(taxes)
          }),
      ),
    [taxes, taxByRate.length, lines, dishes],
  )

  const handleMenuAdd = useCallback(
    (item: Parameters<typeof addToTicket>[1], note?: string) => {
      if (!selectedId) return
      if (dayIsClosed) {
        flash(t.dayClosed)
        return
      }
      addToTicket(selectedId, item, note)
    },
    [selectedId, dayIsClosed, flash, t.dayClosed, addToTicket],
  )

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
  const queueTotal = takeaway.reduce((s, tkt) => {
    const g = lineTotal(tkt.lines)
    return (
      s +
      calcBill(
        g,
        tkt.discountPct ?? 0,
        getTicketChargeLines(tkt.id, g),
        orderTaxBillOptions(tkt.lines, dishes, taxes, company.enableTax !== false),
      ).total
    )
  }, 0)

  const linkedCustomer = linkedCustomerId
    ? customers.find((c) => c.id === linkedCustomerId)
    : undefined

  function createTicket(opts?: { quiet?: boolean; walkIn?: boolean }) {
    if (dayIsClosed) {
      flash(t.dayClosedHint)
      return
    }
    const n = nextSeq('takeaway')
    const useCustomer = opts?.walkIn ? undefined : linkedCustomer
    const ticket: OpenTicket = {
      id: `tk-${n}-${Date.now()}`,
      type: 'takeaway',
      customer: useCustomer
        ? `${t.taWalkIn} #${n} · ${useCustomer.name}`
        : `${t.taWalkIn} #${n}`,
      phone: useCustomer?.phone,
      openedAt: nowTime(),
      lines: [],
      held: false,
    }
    addTicket(ticket)
    setSelectedId(ticket.id)
    setTicketNote('')
    if (opts?.walkIn) setLinkedCustomerId(null)
    if (!opts?.quiet) flash(`${t.navTakeaway} #${n}`)
  }

  function selectTicket(ticket: OpenTicket) {
    if (ticket.held) {
      updateTicket(ticket.id, { held: false, heldAt: undefined })
      flash(`${t.taResumeHeld} · #${ticketNo(ticket)}`)
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
      flash(t.dayClosed, 'err')
      return
    }
    if (selected.lines.length === 0) {
      flash(t.taNoItems, 'err')
      return
    }
    const n = ticketNo(selected)
    updateTicket(selected.id, { held: true, heldAt: nowTime() })
    setTicketNote('')
    createTicket({ quiet: true, walkIn: true })
    flash(`${t.taHold} #${n}`)
  }

  function applyCustomer(customerId: string | null) {
    setLinkedCustomerId(customerId)
    setShowCustomer(false)
    if (!selected) return
    if (!customerId) {
      const n = ticketNo(selected)
      updateTicket(selected.id, { customer: `${t.taWalkIn} #${n}`, phone: undefined })
      flash(t.taWalkIn)
      return
    }
    const c = customers.find((x) => x.id === customerId)
    if (!c) return
    const n = ticketNo(selected)
    updateTicket(selected.id, {
      customer: `${t.taWalkIn} #${n} · ${c.name}`,
      phone: c.phone,
    })
    flash(`${t.tileCustomer} · ${c.name}`)
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
      flash(t.dayClosed)
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
    const roundOff = Math.round((result.roundOff ?? 0) * 100) / 100
    const { bill: settledBill, payable, voucherSar } = settleAfterFoodVoucher({
      goods,
      discountPct,
      charges: chargeLines,
      taxOptions: taxOpts,
      baseBill: bill,
      foodVoucherSar: result.foodVoucherAmount,
      loyaltySar: redeemSar,
      roundOff,
    })
    const customerId = result.customerId ?? linkedCustomerId ?? undefined
    if (customerId) earnPoints(customerId, payable)
    const paySplits = (result.splitPayments ?? []).filter((p) => !/^Food voucher/i.test(p.method))
    const ids = buildReceiptIdentity({ ticketId: selected.id, staff: user })
    settleTicket(selected.id, {
      method: result.method,
      source: `${t.navTakeaway} · ${selected.customer}`,
      staff: user?.name,
      staffUsername: ids.user,
      billNo: ids.billNo,
      orderId: ids.orderId,
      subtotal: settledBill.taxable,
      tax: settledBill.tax,
      total: payable,
      roundOff: roundOff || undefined,
      tendered: result.tendered,
      change: result.change,
      lines,
      splitPayments: paySplits.length ? paySplits : undefined,
      customerId,
      loyaltyRedeem: redeemSar || undefined,
    })
    deductRecipeStock(lines, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(result.method, payable, paySplits.length ? paySplits : undefined))
    setShowSettle(false)
    setReceipt(attachZatcaToReceipt({
      title: `${t.navTakeaway} · ${selected.customer}`,
      method: result.method,
      lines,
      subtotal: goods,
      discountAmt: settledBill.discountAmt || undefined,
      discountPct: discountPct || undefined,
      charges: chargeLines.length
        ? chargeLines.map((c) => ({ name: c.name, amount: c.amount }))
        : undefined,
      tax: settledBill.tax,
      total: payable,
      loyaltyRedeem: redeemSar || undefined,
      foodVoucherAmt: voucherSar || undefined,
      foodVoucherCode: result.foodVoucherCode,
      splitPayments: paySplits.length ? paySplits : undefined,
      staff: user?.name,
      staffUsername: ids.user,
      billNo: ids.billNo,
      orderId: ids.orderId,
      time: new Date().toLocaleString(),
      customerName: linkedCustomer?.name ?? selected.customer,
      kind: 'paid',
      orderType: selected.type,
    }))
    flash(`${t.settle} · ${result.method}`)
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
              <h1>{t.navTakeaway}</h1>
              <p>
                {takeaway.length} {t.taOpenWord} · {openCount} {t.taNeedKot} · {money(queueTotal, lang)}
                {dayIsClosed ? ` · ${t.dayClosed}` : ''}
              </p>
            </div>
          </div>
          <div className="ta-toolbar-stats" aria-hidden={false}>
            <span>
              <strong>{takeaway.length}</strong> {t.taTicketsWord}
            </span>
            <span>
              <strong>{openCount}</strong> {t.navKot}
            </span>
            <span>
              <strong>{readyCount}</strong> {t.taReadyWord}
            </span>
            {heldCount ? (
              <span className="ta-stat-held">
                <strong>{heldCount}</strong> {t.taHeldWord}
              </span>
            ) : null}
          </div>
          <div className="ta-hero-actions">
            {dayIsClosed ? <span className="ta-pill closed">{t.dayClosed}</span> : null}
            <Link to="/quick-serve" className="ta-link-btn">
              <IconBolt /> {t.tileQuickServe}
            </Link>
            <button
              type="button"
              className="btn btn-primary ta-new-btn"
              disabled={dayIsClosed}
              onClick={() => createTicket()}
            >
              <IconPlus /> {t.qsNewTicket}
            </button>
          </div>
        </header>

        <section className="ta-rail">
          <div className="ta-rail-head">
            <h2>
              <IconTicket /> {t.taQueue}
            </h2>
            <span className="ta-chip">{filtered.length}</span>
          </div>
          <div className="ta-rail-scroll">
            {filtered.map((ticket) => {
              const st = statusOf(ticket, statusLabels)
              const g = lineTotal(ticket.lines)
              const amt = calcBill(
                g,
                ticket.discountPct ?? 0,
                getTicketChargeLines(ticket.id, g),
                orderTaxBillOptions(ticket.lines, dishes, taxes, company.enableTax !== false),
              ).total
              const active = ticket.id === selectedId
              return (
                <button
                  key={ticket.id}
                  type="button"
                  className={`ta-rail-card${active ? ' selected' : ''}${ticket.held ? ' held' : ''}`}
                  onClick={() => selectTicket(ticket)}
                  title={ticket.held ? t.taResumeHeld : undefined}
                >
                  <span className="ta-ticket-no">#{ticketNo(ticket)}</span>
                  <span className="ta-rail-copy">
                    <strong>
                      {ticket.customer.replace(/^Walk-in |^زائر /, '')}
                    </strong>
                    <em className={`ta-status ${st.tone}`}>{st.label}</em>
                  </span>
                  <span className="ta-rail-amt">{money(amt, lang)}</span>
                </button>
              )
            })}
            <button
              type="button"
              className="ta-rail-add"
              disabled={dayIsClosed}
              onClick={() => createTicket()}
              title={t.qsNewTicket}
            >
              <IconPlus />
              <span>{t.taStatusNew}</span>
            </button>
            {filtered.length === 0 && takeaway.length > 0 ? (
              <div className="ta-rail-empty">{t.noMatches}</div>
            ) : null}
          </div>
        </section>

        <section className={`ta-work-panel${selected ? ' has-ticket' : ''}`}>
          {!selected ? (
            <div className="ta-empty tall">
              <IconBag />
              <strong>{t.taSelectTicket}</strong>
              <span>{t.taSelectHint}</span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={dayIsClosed}
                onClick={() => createTicket()}
              >
                <IconPlus /> {t.qsNewTicket}
              </button>
            </div>
          ) : (
            <>
              <div className="ta-work-head">
                <div>
                  <h2>
                    #{ticketNo(selected)} <em>{t.navTakeaway}</em>
                  </h2>
                  <div className="ta-work-tags">
                    <span className={`ta-status ${statusOf(selected, statusLabels).tone}`}>
                      {statusOf(selected, statusLabels).label}
                    </span>
                    <span className="ta-chip soft">{selected.customer}</span>
                    {linkedCustomer ? (
                      <span className="ta-chip soft">
                        <IconUser /> {linkedCustomer.name}
                      </span>
                    ) : null}
                    {dayIsClosed ? <span className="ta-pill closed">{t.dayClosed}</span> : null}
                  </div>
                </div>
                  <div className="ta-work-tools">
                    <button type="button" className="ta-tool" onClick={() => setShowCustomer(true)}>
                      <IconUser /> {t.tileCustomer}
                    </button>
                    <button type="button" className="ta-tool" onClick={() => setShowNote(true)}>
                      {t.taNoteLabel}
                    </button>
                    <button
                      type="button"
                      className="ta-tool hold"
                      disabled={dayIsClosed || selected.lines.length === 0 || selected.held}
                      title={t.taHoldHint}
                      onClick={holdTicket}
                    >
                      <IconHold /> {t.taHold}
                    </button>
                    <button type="button" className="ta-tool danger" onClick={requestCancel}>
                      <IconCancel /> {t.cancel}
                    </button>
                  </div>
              </div>

              {ticketNote ? (
                <p className="ta-note">
                  {t.taNoteLabel}: {ticketNote}
                </p>
              ) : null}

              <div className="ta-work-body">
                <div className="ta-menu">
                  <MenuPicker onAdd={handleMenuAdd} />
                </div>

                <div className="ta-order">
                  <div className="ta-panel-head compact">
                    <h2>{t.taOrder}</h2>
                    <span className="ta-chip">
                      {lines.length} · {pending ? `${pending} ${t.taUnsent}` : t.taAllSent}
                    </span>
                  </div>
                  <div className="ta-lines dine-order-cards">
                    {lines.length === 0 ? (
                      <div className="ta-empty inline">
                        <strong>{t.taNoItems}</strong>
                        <span>{t.taNoItemsHint}</span>
                      </div>
                    ) : (
                      lines.map((line) => {
                        const noteText = line.note?.trim() ?? ''
                        const itemName = localizedLineName(line, dishes, lang)
                        const dish = dishes.find((d) => d.id === line.itemId)
                        const opts = parseOrderLineNote(line.note, dish)
                        const hasOptBadges = Boolean(opts.size || opts.addons.length)
                        const displayName = hasOptBadges
                          ? lineNameWithoutOptions(itemName, line.note)
                          : itemName
                        const thumb = dish?.imageDataUrl
                        const thumbMark =
                          dish?.code?.trim() ||
                          (line.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3) || '•').toUpperCase()
                        const taxPct = dishTaxPercent(dish?.taxIds, taxes)
                        const lineGoods = Math.round(line.qty * line.price * 100) / 100
                        const lineShare = goods > 0 ? lineGoods / goods : 0
                        const lineNet = lineGoods - discountAmt * lineShare
                        const lineTax = !taxEnabled
                          ? 0
                          : Math.round(lineNet * (taxPct / 100) * 100) / 100
                        const hasItemTax = Boolean(normalizeTaxIds(dish?.taxIds)[0])
                        const taxRateName = (() => {
                          const id = normalizeTaxIds(dish?.taxIds)[0]
                          if (!id) return null
                          return taxes.find((tx) => tx.id === id)?.name ?? null
                        })()
                        return (
                          <article key={line.id} className="dine-order-item">
                            <div className="dine-order-item-top">
                              <span
                                className={`dine-order-item-thumb${thumb ? ' has-photo' : ''}`}
                                aria-hidden
                              >
                                {thumb ? <img src={thumb} alt="" /> : thumbMark}
                              </span>
                              <div className="dine-order-item-info">
                                <strong className="dine-order-item-name">{displayName}</strong>
                                {hasOptBadges ? (
                                  <div className="dine-order-item-opts" aria-label="Options">
                                    {opts.size ? (
                                      <span className="dine-opt-badge size">{opts.size}</span>
                                    ) : null}
                                    {opts.addons.map((addon) => (
                                      <span key={addon} className="dine-opt-badge addon">
                                        {addon}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                <span className="dine-order-item-price mesa-ltr-nums">
                                  {money(line.price, lang)}
                                </span>
                                {taxEnabled ? (
                                  <span
                                    className={`dine-order-item-tax${!hasItemTax ? ' is-default' : ''}`}
                                    title={
                                      hasItemTax
                                        ? `Item tax${taxRateName ? `: ${taxRateName}` : ''}`
                                        : 'Company default tax'
                                    }
                                  >
                                    Tax {Number.isInteger(taxPct) ? taxPct : taxPct.toFixed(2)}%
                                    {hasItemTax ? '' : ' · default'}
                                    <em className="mesa-ltr-nums"> · {money(lineTax, lang)}</em>
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="dine-order-item-mid">
                              <QtyStepper
                                className="dine-qty"
                                value={line.qty}
                                ariaLabel={displayName}
                                disabled={dayIsClosed}
                                minusDisabled={!!line.sent || dayIsClosed}
                                inputDisabled={!!line.sent || dayIsClosed}
                                onChange={(delta) => changeTicketQty(selected.id, line.id, delta)}
                              />
                              <strong className="dine-order-item-total mesa-ltr-nums">
                                {money(line.qty * line.price, lang)}
                              </strong>
                              <button
                                type="button"
                                className="dine-void-btn"
                                title={t.diVoidLine}
                                disabled={dayIsClosed}
                                onClick={() =>
                                  setVoidTarget({
                                    ticketId: selected.id,
                                    lineId: line.id,
                                    name: displayName,
                                  })
                                }
                              >
                                {t.diVoid}
                              </button>
                            </div>

                            <div className="dine-order-item-meta">
                              <span className={`dine-order-item-status${line.sent ? ' sent' : ''}`}>
                                {line.sent ? t.taStatusSent : t.taStatusNew}
                              </span>
                              <button
                                type="button"
                                className="dine-line-note-btn"
                                title={noteText ? t.diEditNote : t.diAddNote}
                                disabled={dayIsClosed}
                                onClick={() =>
                                  setNoteTarget({
                                    ticketId: selected.id,
                                    lineId: line.id,
                                    name: displayName,
                                    note: line.note ?? '',
                                  })
                                }
                              >
                                {noteText ? t.diEditNote : t.diAddNote}
                              </button>
                            </div>

                            {opts.kitchenNote ? (
                              <p className="dine-order-item-note">{opts.kitchenNote}</p>
                            ) : null}
                          </article>
                        )
                      })
                    )}
                  </div>

                  <div className="ta-totals">
                    <div>
                      <span>{t.subtotal}</span>
                      <span>{money(goods, lang)}</span>
                    </div>
                    <div>
                      <span>
                        {t.discount} ({discountPct}%)
                      </span>
                      <span>-{money(discountAmt, lang)}</span>
                    </div>
                    {chargeLines.map((c) => (
                      <div key={c.id}>
                        <span>{c.name}</span>
                        <span>{money(c.amount, lang)}</span>
                      </div>
                    ))}
                    {vatDetailRows.length > 0
                      ? vatDetailRows.map((row) => (
                          <div
                            key={`vat-${row.percent}`}
                            className="totals-vat-row"
                            title={
                              row.items.length
                                ? row.items.map((n) => `${n} · ${vatRateLabel(row.percent)}`).join('\n')
                                : vatRateLabel(row.percent)
                            }
                          >
                            <span>{vatRateLabel(row.percent)}</span>
                            <span>{money(row.tax, lang)}</span>
                          </div>
                        ))
                      : (
                          <div key="vat-fallback" className="totals-vat-row" hidden={!(tax > 0)}>
                            <span>{vatLabel}</span>
                            <span>{money(tax, lang)}</span>
                          </div>
                        )}
                    <div className="grand">
                      <span>{t.total}</span>
                      <span>{money(total, lang)}</span>
                    </div>
                  </div>

                  <div className="discount-row ta-discount-row">
                    <span className="field-label">{t.discount}</span>
                    <div className="menu-tabs">
                      {discountPicks.map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          className={discountPct === pct ? 'active' : ''}
                          disabled={dayIsClosed}
                          onClick={() => setTicketDiscount(selected.id, pct)}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                  {chargeCatalog.some((c) => c.active) ? (
                    <div className="discount-row ta-discount-row">
                      <span className="field-label">{t.diExtraCharges}</span>
                      <div className="menu-tabs">
                        {chargeCatalog
                          .filter((c) => c.active)
                          .map((c) => {
                            const on = (selected.chargeIds ?? []).includes(c.id)
                            return (
                              <button
                                key={c.id}
                                type="button"
                                className={on ? 'active' : ''}
                                disabled={dayIsClosed}
                                onClick={() => toggleTicketCharge(selected.id, c.id)}
                              >
                                {c.name}
                                {' · '}
                                {c.percent ? `${c.amount}%` : money(c.amount, lang)}
                              </button>
                            )
                          })}
                      </div>
                    </div>
                  ) : null}

                    <div className="ta-actions">
                      {perms.canSendOrders ? (
                        <button
                          type="button"
                          className="btn btn-teal"
                          disabled={dayIsClosed}
                          onClick={() => {
                            if (!pending) {
                              flash(t.taNothingToSend)
                              return
                            }
                            setShowSend(true)
                          }}
                        >
                          <IconSend /> {t.sendOrders}
                          {pending > 0 ? ` (${pending})` : ''}
                        </button>
                      ) : null}
                      {perms.canSettle ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={lines.length === 0 || dayIsClosed}
                          onClick={() => setShowSettle(true)}
                        >
                          <IconPay /> {t.settle}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={lines.length === 0}
                          onClick={() => flash(t.taSendToCashierFlash)}
                        >
                          {t.taSendToCashier}
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost ta-cancel-btn" onClick={requestCancel}>
                        <IconCancel /> {t.taCancelTicket}
                      </button>
                    </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <HubFooter backTo="/" backLabel={t.home} />

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
          computeDue={(voucherSar, loyaltySar) => {
            const next = calcBillWithFoodVoucher(
              goods,
              discountPct,
              chargeLines,
              taxOpts,
              voucherSar,
            )
            return Math.max(0, Math.round((next.total - loyaltySar) * 100) / 100)
          }}
          onClose={() => setShowSettle(false)}
          onConfirm={completeSettle}
        />
      ) : null}

      {showCustomer ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="section-head">
              <h2>{t.taSelectCustomer}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCustomer(false)}>
                {t.printClose}
              </button>
            </div>
            <div className="method-grid">
              <button type="button" className="btn btn-ghost" onClick={() => applyCustomer(null)}>
                {t.taWalkIn}
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
          title={t.taNoteLabel}
          label={t.taNoteLabel}
          initialValue={ticketNote}
          placeholder={t.taNoteLabel}
          confirmLabel={t.save}
          cancelLabel={t.printClose}
          onClose={() => setShowNote(false)}
          onConfirm={(value) => {
            const cleaned = value.trim()
            setTicketNote(cleaned)
            setShowNote(false)
            if (selected) updateTicket(selected.id, { note: cleaned || undefined })
            if (cleaned) flash(t.save)
          }}
        />
      ) : null}

      {showCancel && selected ? (
        <ConfirmModal
          title={t.taCancelTicket}
          message={`${t.taCancelTicket} · ${selected.customer}?`}
          confirmLabel={t.taCancelTicket}
          cancelLabel={t.cancel}
          danger
          onClose={() => setShowCancel(false)}
          onConfirm={confirmCancel}
        />
      ) : null}

      {voidTarget ? (
        <TextPromptModal
          title={t.diVoidTitle.replace('{name}', voidTarget.name)}
          label={t.diVoidReason}
          initialValue={t.diVoidDefault}
          placeholder={t.diReason}
          confirmLabel={t.diVoidItem}
          cancelLabel={t.cancel}
          onClose={() => setVoidTarget(null)}
          onConfirm={(reason) => {
            const target = voidTarget
            setVoidTarget(null)
            voidTicketLine(target.ticketId, target.lineId, reason || t.diVoidDefault, user?.name)
          }}
        />
      ) : null}

      {noteTarget ? (
        <TextPromptModal
          title={t.diNoteTitle.replace('{name}', noteTarget.name)}
          label={t.diItemNote}
          initialValue={noteTarget.note}
          placeholder={t.diNotePlaceholder}
          confirmLabel={t.diSaveNote}
          cancelLabel={t.cancel}
          suggestions={ITEM_NOTE_SUGGESTIONS}
          onClose={() => setNoteTarget(null)}
          onConfirm={(note) => {
            const target = noteTarget
            setNoteTarget(null)
            setTicketLineNote(target.ticketId, target.lineId, note)
            flash(t.save)
          }}
        />
      ) : null}

      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}
    </div>
  )
}
