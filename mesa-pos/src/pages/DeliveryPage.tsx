import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import ConfirmModal from '../components/ConfirmModal'
import CustomerSearchPanel from '../components/CustomerSearchPanel'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import MenuPicker from '../components/MenuPicker'
import QtyStepper from '../components/QtyStepper'
import MesaSelect from '../components/MesaSelect'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import TextPromptModal from '../components/TextPromptModal'
import { seedRiders } from '../data/deliveryRiders'
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
import { resolveDeliveryColumn, type DeliveryColumn } from '../lib/deliveryBoard'
import { deliveryBill, deliveryNo, makeDeliveryOtp, settleMethodForDelivery } from '../lib/deliverySettle'
import {
  channelIsPrepaid,
  channelNeedsOwnRider,
  KSA_DELIVERY_CHANNELS,
  needsChannelAccept,
  resolveDeliveryChannel,
} from '../lib/ksaDelivery'
import { apiIngestDelivery, apiMastersReady } from '../lib/apiMasters'
import {
  apiAcceptChannelOrder,
  apiRejectChannelOrder,
  pushChannelStatusQuiet,
} from '../lib/apiDeliveryChannels'
import { notifyCustomerDelivery } from '../data/deliveryNotify'
import { lineNameWithoutOptions, parseOrderLineNote } from '../lib/orderLineOptions'
import { useI18n } from '../locale/i18n'
import { ticketFromServer } from '../sync/applyIncoming'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm, type CrmCustomer } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { attachZatcaToReceipt } from '../hardware/zatca'
import { buildReceiptIdentity } from '../lib/receiptIds'
import { useShift } from '../state/ShiftContext'
import { useSync } from '../sync/SyncContext'

type CustomerMode = 'create' | 'change'
type RiderModalMode = 'assign' | 'dispatch'

function DlIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="dl-ico"
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

function IconTruck() {
  return (
    <DlIcon>
      <path d="M3 7h11v8H3z" />
      <path d="M14 10h4l3 3v2h-7v-5Z" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17" cy="17" r="1.6" />
    </DlIcon>
  )
}
function IconPlus() {
  return (
    <DlIcon>
      <path d="M12 5v14M5 12h14" />
    </DlIcon>
  )
}
function IconSend() {
  return (
    <DlIcon>
      <path d="M4 12h12" />
      <path d="M13 7l5 5-5 5" />
      <path d="M4 7v10" />
    </DlIcon>
  )
}
function IconPay() {
  return (
    <DlIcon>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </DlIcon>
  )
}
function IconUser() {
  return (
    <DlIcon>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
    </DlIcon>
  )
}
function IconCancel() {
  return (
    <DlIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </DlIcon>
  )
}
function IconCheck() {
  return (
    <DlIcon>
      <path d="M5 12.5 9.5 17 19 7.5" />
    </DlIcon>
  )
}
function IconBack() {
  return (
    <DlIcon>
      <path d="M15 6 9 12l6 6" />
    </DlIcon>
  )
}
function IconNote() {
  return (
    <DlIcon>
      <path d="M7 4.5h7.5L17.5 7.5V19.5H7V4.5Z" />
      <path d="M14.5 4.5V7.5H17.5M9 11h6M9 14.5h4" />
    </DlIcon>
  )
}

function nextDeliveryNo() {
  return nextSeq('delivery')
}

function parseOpenedMs(openedAt: string): number | null {
  if (!openedAt) return null
  const asDate = Date.parse(openedAt)
  if (Number.isFinite(asDate)) return asDate
  const m = openedAt.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!m) return null
  const now = new Date()
  let h = Number(m[1])
  const min = Number(m[2])
  const sec = Number(m[3] || 0)
  const ap = m[4]?.toUpperCase()
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  now.setHours(h, min, sec, 0)
  return now.getTime()
}

function formatElapsed(ms: number | null, now: number): string {
  if (ms == null) return '—'
  const mins = Math.max(0, Math.floor((now - ms) / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  return `${h}h ${mins % 60}m`
}

function columnTone(col: DeliveryColumn) {
  if (col === 'new') return 'muted'
  if (col === 'preparing') return 'amber'
  if (col === 'ready') return 'teal'
  if (col === 'delivered') return 'rose'
  return 'blue'
}

export default function DeliveryPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const perms = user ? getPermissions(user.role) : getPermissions('cashier')
  const columns: Array<{ id: DeliveryColumn; label: string; hint: string }> = useMemo(
    () => [
      { id: 'new', label: t.taStatusNew, hint: t.dlColNewHint },
      { id: 'preparing', label: t.dlColPreparing, hint: t.dlColPreparingHint },
      { id: 'ready', label: t.dlReady, hint: t.dlColReadyHint },
      { id: 'dispatched', label: t.dlColOut, hint: t.dlColOutHint },
      { id: 'delivered', label: t.dlColDelivered, hint: t.dlColDeliveredHint },
    ],
    [t],
  )
  function deliverActionLabel(channel?: string) {
    return channelNeedsOwnRider(channel) ? t.dlDeliverAndSettle : t.dlHandToCourierSettle
  }
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { dishes } = useMasters()
  const { redeemGiftCard, deliveryRiders, taxes, discounts } = useCatalog()
  const { addCashIn } = useShift()
  const { activeBranchId, company } = useBranch()
  const { syncEpoch, runSync } = useSync()
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

  useEffect(() => {
    void hydrateSequencesFromApi().catch(() => undefined)
  }, [syncEpoch, activeBranchId])

  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const delivery = useMemo(() => tickets.filter((t) => t.type === 'delivery'), [tickets])

  const riders = useMemo(() => {
    const base = deliveryRiders.length ? deliveryRiders.filter((r) => r.active) : seedRiders
    return base.map((r) => {
      const busy = delivery.some(
        (t) =>
          resolveDeliveryColumn(t) === 'dispatched' &&
          t.deliveryBoyId &&
          (t.deliveryBoyId === r.id || r.id.startsWith(`${t.deliveryBoyId}__`)),
      )
      return { ...r, status: busy ? ('on-route' as const) : ('available' as const) }
    })
  }, [deliveryRiders, delivery])

  function findRider(id?: string) {
    if (!id) return undefined
    return riders.find((r) => r.id === id) ?? riders.find((r) => r.id.startsWith(`${id}__`))
  }

  const [searchParams] = useSearchParams()
  const deepTicketId = searchParams.get('ticket')
  const [search, setSearch] = useState('')
  const [orderChannel, setOrderChannel] = useState('Direct')
  const [selectedId, setSelectedId] = useState<string | null>(() => deepTicketId)
  const [deskOpen, setDeskOpen] = useState(() => Boolean(deepTicketId))
  const [ticketNote, setTicketNote] = useState('')
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null)
  const [showCustomer, setShowCustomer] = useState(false)
  const [customerMode, setCustomerMode] = useState<CustomerMode>('create')
  const [showRider, setShowRider] = useState(false)
  const [riderModalMode, setRiderModalMode] = useState<RiderModalMode>('assign')
  const [riderPick, setRiderPick] = useState('')
  const [feeDraft, setFeeDraft] = useState('15')
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [otpTicketId, setOtpTicketId] = useState<string | null>(null)
  const [otpError, setOtpError] = useState('')
  const [ingestBusy, setIngestBusy] = useState(false)
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

  const selected = delivery.find((t) => t.id === selectedId) ?? null

  useEffect(() => {
    if (deepTicketId && delivery.some((t) => t.id === deepTicketId)) {
      setSelectedId(deepTicketId)
      setDeskOpen(true)
    }
  }, [deepTicketId, delivery])

  useEffect(() => {
    setTicketNote(selected?.note?.trim() ?? '')
  }, [selected?.id, selected?.note])
  const lines = selected?.lines ?? []
  const pending = lines.filter((l) => !l.sent).length
  const goods = lineTotal(lines)
  const fee = selected?.deliveryFee ?? 0
  const discountPct = selected?.discountPct ?? 0
  const chargeIdsKey = (selected?.chargeIds ?? []).join(',')
  const taxEnabled = company.enableTax !== false
  const extraChargeLines = useMemo(
    () => (selected ? getTicketChargeLines(selected.id, goods) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected?.id, chargeIdsKey, goods, getTicketChargeLines],
  )
  const feeCharges = useMemo(
    () => (fee > 0 ? [{ id: 'delivery-fee', name: t.dlDeliveryFee, amount: fee }] : []),
    [fee, t.dlDeliveryFee],
  )
  const chargeLines = useMemo(
    () => [...extraChargeLines, ...feeCharges],
    [extraChargeLines, feeCharges],
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
  const rider = findRider(selected?.deliveryBoyId)
  const laneNo = selected ? deliveryNo(selected) : 0
  const selectedCol = selected ? resolveDeliveryColumn(selected) : null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return delivery
    return delivery.filter((t) => {
      const no = `d-${deliveryNo(t)}`
      return (
        no.includes(q) ||
        t.customer.toLowerCase().includes(q) ||
        (t.phone ?? '').toLowerCase().includes(q) ||
        (t.address ?? '').toLowerCase().includes(q) ||
        (findRider(t.deliveryBoyId)?.name ?? '').toLowerCase().includes(q)
      )
    })
    // findRider is stable enough via riders; intentionally omit to avoid churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery, search, riders])

  const byColumn = useMemo(() => {
    const map: Record<DeliveryColumn, OpenTicket[]> = {
      new: [],
      preparing: [],
      ready: [],
      dispatched: [],
      delivered: [],
    }
    for (const t of filtered) map[resolveDeliveryColumn(t)].push(t)
    return map
  }, [filtered])

  const stats = useMemo(
    () => ({
      new: delivery.filter((t) => resolveDeliveryColumn(t) === 'new').length,
      preparing: delivery.filter((t) => resolveDeliveryColumn(t) === 'preparing').length,
      ready: delivery.filter((t) => resolveDeliveryColumn(t) === 'ready').length,
      out: delivery.filter((t) => resolveDeliveryColumn(t) === 'dispatched').length,
      unpaid: delivery.filter((t) => {
        const c = resolveDeliveryColumn(t)
        return c === 'dispatched' || c === 'delivered'
      }).length,
      ridersAvail: riders.filter((r) => r.status === 'available').length,
    }),
    [delivery, riders],
  )

  function ticketAmount(t: OpenTicket) {
    const g = lineTotal(t.lines)
    const f = t.deliveryFee ?? 0
    const extras = getTicketChargeLines(t.id, g)
    return calcBill(
      g,
      t.discountPct ?? 0,
      [
        ...extras,
        ...(f > 0 ? [{ id: 'f', name: 'fee', amount: f }] : []),
      ],
      orderTaxBillOptions(t.lines, dishes, taxes, company.enableTax !== false),
    ).total
  }

  function selectTicket(ticket: OpenTicket, openDesk = true) {
    setSelectedId(ticket.id)
    setTicketNote('')
    const match = customers.find(
      (c) => c.name === ticket.customer || (ticket.phone && c.phone === ticket.phone),
    )
    setLinkedCustomerId(match?.id ?? null)
    if (openDesk) setDeskOpen(true)
  }

  function startAddDelivery() {
    if (dayIsClosed) {
      flash(t.dayClosed)
      return
    }
    setCustomerMode('create')
    setShowCustomer(true)
  }

  function createFromCustomer(c: CrmCustomer | null) {
    if (!c) {
      flash(t.dlSelectCustomerFlash)
      return
    }
    const n = nextDeliveryNo()
    const ticket: OpenTicket = {
      id: `dl-${n}-${Date.now()}`,
      type: 'delivery',
      customer: c.name,
      phone: c.phone,
      address: c.address || t.dlAddressTbd,
      deliveryFee: channelNeedsOwnRider(orderChannel) ? 15 : 0,
      deliveryStatus: 'new',
      channel: orderChannel,
      openedAt: nowTime(),
      lines: [],
    }
    addTicket(ticket)
    setShowCustomer(false)
    selectTicket(ticket, true)
    flash(`${t.navDelivery} D-${n} · ${orderChannel} · ${c.name}`)
  }

  function applyCustomerChange(c: CrmCustomer | null) {
    if (!selected) return
    if (!c) {
      flash(t.dlCustomerRequired)
      return
    }
    updateTicket(selected.id, {
      customer: c.name,
      phone: c.phone,
      address: c.address || selected.address,
    })
    setLinkedCustomerId(c.id)
    setShowCustomer(false)
    flash(`${t.dlCustomer} · ${c.name}`)
  }

  function openRiderModal(mode: RiderModalMode = 'assign', ticket?: OpenTicket) {
    const t = ticket ?? selected
    if (!t) return
    setSelectedId(t.id)
    setRiderModalMode(mode)
    setRiderPick(t.deliveryBoyId || riders.find((b) => b.status === 'available')?.id || '')
    setFeeDraft(String(t.deliveryFee ?? 15))
    setShowRider(true)
  }

  function confirmRider() {
    const tkt = delivery.find((x) => x.id === selectedId) ?? selected
    if (!tkt) return
    if (!riderPick) {
      flash(t.dlSelectRiderFlash)
      return
    }
    const feeVal = Math.max(0, Number(feeDraft) || 0)
    if (riderModalMode === 'dispatch') {
      const otp = makeDeliveryOtp()
      updateTicket(tkt.id, {
        deliveryBoyId: riderPick,
        deliveryFee: feeVal,
        deliveryStatus: 'dispatched',
        dispatchedAt: nowTime(),
        deliveryOtp: otp,
      })
      setShowRider(false)
      const n = notifyCustomerDelivery(
        { ...tkt, deliveryBoyId: riderPick, deliveryFee: feeVal, deliveryStatus: 'dispatched', deliveryOtp: otp },
        'otp',
      )
      flash(
        `${t.dlDispatched} · ${findRider(riderPick)?.name ?? t.dlRiderFallback} · ${t.dlOtp} ${otp}${
          n.sent ? ` · ${n.message}` : ''
        }`,
      )
      return
    }
    updateTicket(tkt.id, {
      deliveryBoyId: riderPick,
      deliveryFee: feeVal,
    })
    setShowRider(false)
    flash(`${t.dlRider} · ${findRider(riderPick)?.name ?? t.dlAssigned}`)
  }

  function markReady() {
    if (!selected) return
    updateTicket(selected.id, { deliveryStatus: 'ready', kitchenStatus: 'ready' })
    pushChannelStatusQuiet(selected.id, 'ready')
    flash(`${t.dlReady} · D-${laneNo}`)
  }

  async function acceptExternalOrder(ticket: OpenTicket) {
    try {
      if (apiMastersReady()) {
        await apiAcceptChannelOrder(ticket.id, 30)
        void runSync({ quiet: true }).catch(() => undefined)
      } else {
        updateTicket(ticket.id, { channelAcceptStatus: 'accepted' })
      }
      flash(`${t.dlAccepted} · ${resolveDeliveryChannel(ticket.channel).label} #${ticket.externalOrderId ?? ''}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : t.dlAcceptFailed, 'err')
    }
  }

  async function rejectExternalOrder(ticket: OpenTicket, reason?: string) {
    try {
      if (apiMastersReady()) {
        await apiRejectChannelOrder(ticket.id, reason)
        void runSync({ quiet: true }).catch(() => undefined)
      } else {
        cancelTicket(ticket.id, reason ?? 'Rejected at POS')
      }
      flash(`${t.dlRejected} · D-${deliveryNo(ticket)}`)
      if (selectedId === ticket.id) {
        setSelectedId(null)
        setDeskOpen(false)
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : t.dlRejectFailed, 'err')
    }
  }

  function markDelivered(ticket?: OpenTicket) {
    const tkt = ticket ?? selected
    if (!tkt) return
    if (!tkt.lines.length) {
      flash(t.dlAddBeforeDeliver)
      return
    }
    if (channelNeedsOwnRider(tkt.channel) && !tkt.deliveryBoyId) {
      openRiderModal('assign', tkt)
      flash(t.dlAssignOwnRider)
      return
    }
    if (channelNeedsOwnRider(tkt.channel) && tkt.deliveryOtp) {
      setOtpTicketId(tkt.id)
      setOtpError('')
      return
    }
    finishDeliverAndSettle(tkt)
  }

  function finishDeliverAndSettle(tkt: OpenTicket) {
    const no = deliveryNo(tkt)
    const bill = deliveryBill(tkt, t.dlDeliveryFee)
    const g = lineTotal(tkt.lines)
    const feeAmt = tkt.deliveryFee ?? 0
    const extras = getTicketChargeLines(tkt.id, g)
    const allCharges = [
      ...extras,
      ...(feeAmt > 0 ? [{ id: 'delivery-fee', name: t.dlDeliveryFee, amount: feeAmt }] : []),
    ]
    const method = settleMethodForDelivery(tkt)
    const ch = resolveDeliveryChannel(tkt.channel)
    const match = customers.find(
      (c) => c.name === tkt.customer || (tkt.phone && c.phone === tkt.phone),
    )
    updateTicket(tkt.id, {
      deliveryStatus: 'delivered',
      deliveredAt: nowTime(),
    })
    if (match) earnPoints(match.id, bill.total)
    const ids = buildReceiptIdentity({ ticketId: tkt.id, staff: user })
    settleTicket(tkt.id, {
      method,
      source: `${t.navDelivery} D-${no} · ${tkt.customer} · ${ch.label} · ${t.dlAutoOnDeliver}`,
      staff: user?.name,
      staffUsername: ids.user,
      billNo: ids.billNo,
      orderId: ids.orderId,
      subtotal: bill.taxable,
      tax: bill.tax,
      total: bill.total,
      lines: tkt.lines,
      customerId: match?.id,
      charges: allCharges.length ? allCharges : undefined,
    })
    deductRecipeStock(tkt.lines, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(method, bill.total))
    setReceipt(attachZatcaToReceipt({
      title: `${t.navDelivery} D-${no}`,
      method: channelIsPrepaid(tkt.channel) ? `${method} · ${t.dlPrepaidSuffix}` : `${method} · ${t.dlCod}`,
      lines: tkt.lines,
      subtotal: g,
      discountAmt: bill.discountAmt || undefined,
      discountPct: (tkt.discountPct ?? 0) || undefined,
      tax: bill.tax,
      total: bill.total,
      charges: allCharges.length
        ? allCharges.map((c) => ({ name: c.name, amount: c.amount }))
        : undefined,
      staff: user?.name,
      staffUsername: ids.user,
      billNo: ids.billNo,
      orderId: ids.orderId,
      time: nowTime(),
      customerName: tkt.customer,
      kind: 'paid',
      orderType: tkt.type,
    }))
    flash(`${t.dlDeliveredSettled} · D-${no} · ${method}`)
    pushChannelStatusQuiet(tkt.id, 'delivered')
    setOtpTicketId(null)
    if (selectedId === tkt.id) {
      setSelectedId(null)
      setLinkedCustomerId(null)
      setTicketNote('')
      setDeskOpen(false)
    }
  }

  function dispatchNow() {
    if (!selected) return
    if (channelNeedsOwnRider(selected.channel) && !selected.deliveryBoyId) {
      openRiderModal('dispatch')
      return
    }
    const otp = channelNeedsOwnRider(selected.channel) ? makeDeliveryOtp() : undefined
    updateTicket(selected.id, {
      deliveryStatus: 'dispatched',
      dispatchedAt: nowTime(),
      ...(otp ? { deliveryOtp: otp } : {}),
    })
    const n = notifyCustomerDelivery(
      { ...selected, deliveryStatus: 'dispatched', ...(otp ? { deliveryOtp: otp } : {}) },
      otp ? 'otp' : 'dispatched',
    )
    flash(
      channelNeedsOwnRider(selected.channel)
        ? `${t.dlOutForDelivery} · D-${laneNo}${otp ? ` · ${t.dlOtp} ${otp}` : ''}${n.sent ? ` · ${n.message}` : ''}`
        : `${t.dlAwaiting} ${resolveDeliveryChannel(selected.channel).label} ${t.dlCourier} · D-${laneNo}`,
    )
    pushChannelStatusQuiet(selected.id, 'dispatched')
  }

  async function simulateChannelOrder() {
    if (dayIsClosed || ingestBusy) return
    setIngestBusy(true)
    try {
      const channel = orderChannel === 'Direct' ? 'HungerStation' : orderChannel
      const externalOrderId = `SIM-${Date.now().toString().slice(-6)}`
      const sampleLines = [
        { name: 'Chicken Kabsa', qty: 1, price: 42 },
        { name: 'Fresh Lemonade', qty: 2, price: 12 },
      ]
      if (apiMastersReady()) {
        const row = await apiIngestDelivery({
          branchId: activeBranchId,
          channel,
          externalOrderId,
          customer: 'App guest',
          phone: '05' + String(Math.floor(10000000 + Math.random() * 89999999)),
          address: 'Riyadh · demo address',
          deliveryFee: 0,
          lines: sampleLines,
        })
        const mapped = ticketFromServer(row)
        if (mapped) addTicket(mapped)
        void runSync({ quiet: true }).catch(() => undefined)
        flash(`${t.dlIncoming} · ${channel} #${externalOrderId}`)
      } else {
        const n = nextDeliveryNo()
        addTicket({
          id: `dl-${n}-${Date.now()}`,
          type: 'delivery',
          customer: 'App guest',
          phone: '0555123456',
          address: 'Riyadh · demo address',
          deliveryFee: 0,
          deliveryStatus: 'new',
          channel,
          externalOrderId,
          channelAcceptStatus: 'pending',
          openedAt: nowTime(),
          lines: sampleLines.map((l, i) => ({
            id: `sim-${i}-${Date.now()}`,
            itemId: `sim-${i}`,
            name: l.name,
            qty: l.qty,
            price: l.price,
            sent: false,
          })),
          branchId: activeBranchId,
        })
        flash(`${t.dlIncomingOffline} · ${channel} #${externalOrderId}`)
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : t.dlIngestFailed)
    } finally {
      setIngestBusy(false)
    }
  }

  function openSettleFor(ticket: OpenTicket) {
    selectTicket(ticket, true)
    if (channelNeedsOwnRider(ticket.channel) && !ticket.deliveryBoyId) {
      flash(t.dlAssignRiderFirst)
      openRiderModal('assign', ticket)
      return
    }
    if (perms.canSettle) setShowSettle(true)
    else flash(t.dlAskCashier)
  }

  function requestCancel() {
    if (!selected) return
    setShowCancel(true)
  }

  function confirmCancel() {
    if (!selected) return
    const id = selected.id
    cancelTicket(id, 'Cancelled from delivery')
    setShowCancel(false)
    setSelectedId(null)
    setLinkedCustomerId(null)
    setTicketNote('')
    setDeskOpen(false)
  }

  function completeSettle(result: SettleResult) {
    if (!selected) return
    if (channelNeedsOwnRider(selected.channel) && !selected.deliveryBoyId) {
      openRiderModal('assign')
      flash(t.dlAssignRiderFirst)
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
    if (result.customerId) earnPoints(result.customerId, payable)
    const paySplits = (result.splitPayments ?? []).filter((p) => !/^Food voucher/i.test(p.method))
    const ids = buildReceiptIdentity({ ticketId: selected.id, staff: user })
    settleTicket(selected.id, {
      method: result.method,
      source: `${t.navDelivery} D-${laneNo} · ${selected.customer}`,
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
      customerId: result.customerId ?? linkedCustomerId ?? undefined,
      loyaltyRedeem: redeemSar || undefined,
      charges: chargeLines.length ? chargeLines : undefined,
    })
    deductRecipeStock(lines, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(result.method, payable, paySplits.length ? paySplits : undefined))
    setShowSettle(false)
    setReceipt(attachZatcaToReceipt({
      title: `${t.navDelivery} D-${laneNo}`,
      method: result.method,
      lines,
      subtotal: goods,
      discountAmt: settledBill.discountAmt || undefined,
      discountPct: discountPct || undefined,
      tax: settledBill.tax,
      total: payable,
      charges: chargeLines.length
        ? chargeLines.map((c) => ({ name: c.name, amount: c.amount }))
        : undefined,
      foodVoucherAmt: voucherSar || undefined,
      foodVoucherCode: result.foodVoucherCode,
      splitPayments: paySplits.length ? paySplits : undefined,
      staff: user?.name,
      staffUsername: ids.user,
      billNo: ids.billNo,
      orderId: ids.orderId,
      time: nowTime(),
      customerName: selected.customer,
      kind: 'paid',
      orderType: selected.type,
    }))
    flash(`${t.dlPaid} · D-${laneNo} · ${result.method}`)
    setSelectedId(null)
    setLinkedCustomerId(null)
    setTicketNote('')
    setDeskOpen(false)
  }

  function cardPrimaryAction(ticket: OpenTicket) {
    if (needsChannelAccept(ticket)) {
      return {
        label: t.dlAccept,
        run: () => void acceptExternalOrder(ticket),
      }
    }
    const col = resolveDeliveryColumn(ticket)
    if (col === 'new') {
      return {
        label: pendingFor(ticket) ? t.dlSendKot : t.dlBuild,
        run: () => {
          selectTicket(ticket, true)
          if (pendingFor(ticket) && perms.canSendOrders && !needsChannelAccept(ticket)) setShowSend(true)
        },
      }
    }
    if (col === 'preparing') {
      return {
        label: t.dlMarkReady,
        run: () => {
          selectTicket(ticket, false)
          updateTicket(ticket.id, { deliveryStatus: 'ready', kitchenStatus: 'ready' })
          pushChannelStatusQuiet(ticket.id, 'ready')
          flash(`${t.dlReady} · D-${deliveryNo(ticket)}`)
        },
      }
    }
    if (col === 'ready') {
      return {
        label: channelNeedsOwnRider(ticket.channel)
          ? ticket.deliveryBoyId
            ? t.dlDispatch
            : t.dlAssignAndGo
          : t.dlReleaseCourier,
        run: () => {
          selectTicket(ticket, false)
          if (channelNeedsOwnRider(ticket.channel) && !ticket.deliveryBoyId) {
            openRiderModal('dispatch', ticket)
            return
          }
          const otp = channelNeedsOwnRider(ticket.channel) ? makeDeliveryOtp() : undefined
          const platformOtp =
            !channelNeedsOwnRider(ticket.channel) ? makeDeliveryOtp() : undefined
          const handoffOtp = otp ?? platformOtp
          updateTicket(ticket.id, {
            deliveryStatus: 'dispatched',
            dispatchedAt: nowTime(),
            ...(handoffOtp ? { deliveryOtp: handoffOtp } : {}),
          })
          const n = channelNeedsOwnRider(ticket.channel)
            ? notifyCustomerDelivery(
                { ...ticket, deliveryStatus: 'dispatched', ...(otp ? { deliveryOtp: otp } : {}) },
                otp ? 'otp' : 'dispatched',
              )
            : { sent: false as const }
          flash(
            channelNeedsOwnRider(ticket.channel)
              ? `${t.dlOutForDelivery} · D-${deliveryNo(ticket)}${otp ? ` · ${t.dlOtp} ${otp}` : ''}${
                  n.sent ? ` · ${n.message}` : ''
                }`
              : `${resolveDeliveryChannel(ticket.channel).label} ${t.dlCourier} · pickup ${platformOtp ?? '—'} · D-${deliveryNo(ticket)}`,
          )
          pushChannelStatusQuiet(ticket.id, 'dispatched')
        },
      }
    }
    if (col === 'dispatched') {
      return {
        label: deliverActionLabel(ticket.channel),
        run: () => {
          selectTicket(ticket, false)
          markDelivered(ticket)
        },
      }
    }
    return {
      label: t.dlSettleUnpaid,
      run: () => openSettleFor(ticket),
    }
  }

  function pendingFor(ticket: OpenTicket) {
    return ticket.lines.some((l) => !l.sent) && ticket.lines.length > 0
  }

  return (
    <div className="zk-dl">
      <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />

      <div className="dl-page-inner">
        <header className="dl-toolbar">
          <div className="dl-toolbar-brand">
            <span className="dl-hero-mark">
              <IconTruck />
            </span>
            <div>
              <h1>{t.navDelivery}</h1>
              <p>
                {delivery.length} {t.taOpenWord} · {stats.ridersAvail} {t.dlRidersFree}
                {dayIsClosed ? ` · ${t.dayClosed}` : ''}
              </p>
            </div>
          </div>
          <div className="dl-toolbar-stats">
            <span>
              <strong>{stats.new}</strong> {t.taStatusNew.toLowerCase()}
            </span>
            <span>
              <strong>{stats.preparing}</strong> {t.dlStatPrep}
            </span>
            <span>
              <strong>{stats.ready}</strong> {t.taReadyWord}
            </span>
            <span>
              <strong>{stats.out}</strong> {t.dlStatOut}
            </span>
            <span className={stats.unpaid ? 'warn' : undefined}>
              <strong>{stats.unpaid}</strong> {t.dlStatUnpaid}
            </span>
          </div>
          <div className="dl-hero-actions">
            {dayIsClosed ? <span className="dl-pill closed">{t.dayClosed}</span> : null}
            <label className="dl-channel-pick">
              <span>{t.dlChannel}</span>
              <MesaSelect
                value={orderChannel}
                onChange={setOrderChannel}
                options={KSA_DELIVERY_CHANNELS.map((c) => ({
                  value: c.id,
                  label: c.label,
                }))}
              />
            </label>
            <button
              type="button"
              className="dl-link-btn"
              disabled={dayIsClosed || ingestBusy}
              onClick={() => void simulateChannelOrder()}
              title={t.dlSimulateTitle}
            >
              {ingestBusy ? t.dlImporting : t.dlSimulateOrder}
            </button>
            <Link to="/courier" className="dl-link-btn">
              {t.dlCourierPickup}
            </Link>
            <Link to="/settings/delivery-integrations" className="dl-link-btn">
              {t.dlApis}
            </Link>
            <Link to="/settings/delivery-riders" className="dl-link-btn">
              {t.dlRiders}
            </Link>
            <Link to="/rider" className="dl-link-btn">
              {t.dlRiderApp}
            </Link>
            <button
              type="button"
              className="btn btn-primary dl-new-btn"
              disabled={dayIsClosed}
              onClick={startAddDelivery}
            >
              <IconPlus /> {t.dlAddDelivery}
            </button>
          </div>
        </header>

        <section className="dl-rider-strip" aria-label={t.dlRiderAvailability}>
          {riders.length === 0 ? (
            <span className="dl-rider-empty">{t.dlNoRiders}</span>
          ) : (
            riders.map((r) => (
              <span key={r.id} className={`dl-rider-chip ${r.status}`}>
                <strong>{r.name}</strong>
                <em>{r.status === 'available' ? t.dlRiderFree : t.dlOnRoute}</em>
              </span>
            ))
          )}
        </section>

        {!deskOpen || !selected ? (
          <section className="dl-kanban">
            {columns.map((col) => {
              const cards = byColumn[col.id]
              return (
                <div key={col.id} className={`dl-col dl-col-${col.id}`}>
                  <header className="dl-col-head">
                    <div>
                      <h2>{col.label}</h2>
                      <p>{col.hint}</p>
                    </div>
                    <span className="dl-chip">{cards.length}</span>
                  </header>
                  <div className="dl-col-body">
                    {cards.length === 0 ? (
                      <div className="dl-col-empty">{t.dlNoOrders}</div>
                    ) : (
                      cards.map((ticket) => {
                        const no = deliveryNo(ticket)
                        const boy = findRider(ticket.deliveryBoyId)
                        const age = formatElapsed(parseOpenedMs(ticket.openedAt), nowTick)
                        const action = cardPrimaryAction(ticket)
                        const active = ticket.id === selectedId
                        const unpaid = col.id === 'dispatched' || col.id === 'delivered'
                        const ch = resolveDeliveryChannel(ticket.channel)
                        return (
                          <article
                            key={ticket.id}
                            className={`dl-order-card${active ? ' selected' : ''}${unpaid ? ' unpaid' : ''}`}
                          >
                            <button
                              type="button"
                              className="dl-order-main"
                              onClick={() => selectTicket(ticket, true)}
                            >
                              <div className="dl-order-top">
                                <strong>D-{no || '—'}</strong>
                                <em className={`dl-status ${columnTone(col.id)}`}>{col.label}</em>
                              </div>
                              <span className="dl-order-name">{ticket.customer}</span>
                              <span className="dl-order-meta">
                                {ticket.phone || t.dlNoPhone} · {age}
                              </span>
                              <span className="dl-order-addr">
                                {ticket.address || t.dlAddressTbd}
                              </span>
                              <div className="dl-order-foot">
                                <span>{money(ticketAmount(ticket), lang)}</span>
                                {unpaid ? (
                                  <span className={`dl-pay ${channelIsPrepaid(ticket.channel) ? 'prepaid' : 'unpaid'}`}>
                                    {channelIsPrepaid(ticket.channel) ? t.dlPrepaid : t.dlCod}
                                  </span>
                                ) : (
                                  <span className={`dl-channel tone-${ch.tone}`}>{ch.id}</span>
                                )}
                              </div>
                              <span className={`dl-channel tone-${ch.tone}`}>{ch.label}</span>
                              {boy ? (
                                <span className="dl-order-rider">{boy.name}</span>
                              ) : (
                                <span className="dl-order-rider muted">
                                  {channelNeedsOwnRider(ticket.channel)
                                    ? t.dlUnassigned
                                    : `${ch.label} ${t.dlCourier}`}
                                </span>
                              )}
                              {ticket.deliveryOtp && channelNeedsOwnRider(ticket.channel) ? (
                                <span className="dl-otp">{t.dlOtp} {ticket.deliveryOtp}</span>
                              ) : null}
                              {ticket.externalOrderId ? (
                                <span className="dl-ext-id">#{ticket.externalOrderId}</span>
                              ) : null}
                              {needsChannelAccept(ticket) ? (
                                <span className="dl-pending-accept">{t.dlAwaitingAccept}</span>
                              ) : null}
                            </button>
                            {needsChannelAccept(ticket) ? (
                              <div className="dl-order-actions-row">
                                <button
                                  type="button"
                                  className="dl-order-action accept"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void acceptExternalOrder(ticket)
                                  }}
                                >
                                  {t.dlAccept}
                                </button>
                                <button
                                  type="button"
                                  className="dl-order-action reject"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void rejectExternalOrder(ticket)
                                  }}
                                >
                                  {t.dlReject}
                                </button>
                              </div>
                            ) : (
                            <button
                              type="button"
                              className={`dl-order-action${col.id === 'delivered' ? ' settle' : ''}`}
                              disabled={dayIsClosed && col.id !== 'delivered' && col.id !== 'dispatched'}
                              onClick={(e) => {
                                e.stopPropagation()
                                action.run()
                              }}
                            >
                              {action.label}
                            </button>
                            )}
                          </article>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        ) : (
          <section className="dl-work-panel has-ticket">
            <div className="dl-work-head">
              <div className="dl-work-head-row">
                <button
                  type="button"
                  className="dl-back"
                  onClick={() => {
                    setDeskOpen(false)
                  }}
                >
                  <IconBack /> {t.dlBoard}
                </button>

                <div className="dl-work-title-block">
                  <h2>
                    D-{laneNo || '—'} <em>{t.navDelivery}</em>
                  </h2>
                  <div className="dl-work-tags">
                    {selectedCol ? (
                      <span className={`dl-status ${columnTone(selectedCol)}`}>
                        {columns.find((c) => c.id === selectedCol)?.label}
                      </span>
                    ) : null}
                    {selectedCol === 'dispatched' || selectedCol === 'delivered' ? (
                      <span
                        className={`dl-pay ${channelIsPrepaid(selected.channel) ? 'prepaid' : 'unpaid'}`}
                      >
                        {channelIsPrepaid(selected.channel) ? t.dlPrepaid : t.dlCod}
                      </span>
                    ) : null}
                    <span className="dl-chip soft">{selected.customer}</span>
                    {rider ? <span className="dl-chip soft">{rider.name}</span> : null}
                    {selected.deliveryOtp && channelNeedsOwnRider(selected.channel) ? (
                      <span className="dl-otp">{t.dlOtp} {selected.deliveryOtp}</span>
                    ) : null}
                    {selected.externalOrderId ? (
                      <span className="dl-chip soft">#{selected.externalOrderId}</span>
                    ) : null}
                  </div>
                </div>

                <label className="dl-channel-inline">
                  <span>{t.dlChannel}</span>
                  <MesaSelect
                    className="dl-channel-select"
                    value={selected.channel || 'Direct'}
                    onChange={(v) => updateTicket(selected.id, { channel: v })}
                    options={KSA_DELIVERY_CHANNELS.map((c) => ({
                      value: c.id,
                      label: c.label,
                    }))}
                  />
                </label>

                <div className="dl-work-tools">
                  <button
                    type="button"
                    className="dl-tool"
                    onClick={() => {
                      setCustomerMode('change')
                      setShowCustomer(true)
                    }}
                  >
                    <IconUser /> {t.tileCustomer}
                  </button>
                  <button type="button" className="dl-tool" onClick={() => setShowNote(true)}>
                    <IconNote /> {t.taNoteLabel}
                  </button>
                  <button type="button" className="dl-tool" onClick={() => openRiderModal('assign')}>
                    <IconTruck /> {t.dlRider}
                  </button>
                  <button type="button" className="dl-tool danger" onClick={requestCancel}>
                    <IconCancel /> {t.cancel}
                  </button>
                </div>
              </div>

              {selected.address ? <p className="dl-work-addr">{selected.address}</p> : null}
            </div>

            {ticketNote ? <p className="dl-note">{t.taNoteLabel}: {ticketNote}</p> : null}

            {selected && needsChannelAccept(selected) ? (
              <div className="dl-accept-banner">
                <div>
                  <strong>
                    {resolveDeliveryChannel(selected.channel).label} {t.dlAcceptBanner}
                  </strong>
                  {selected.externalOrderId ? <span>#{selected.externalOrderId}</span> : null}
                </div>
                <div className="dl-accept-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void acceptExternalOrder(selected)}
                  >
                    {t.dlAcceptOrder}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void rejectExternalOrder(selected)}
                  >
                    {t.dlReject}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="dl-work-body">
              <div className="dl-menu">
                <MenuPicker onAdd={handleMenuAdd} />
              </div>

              <div className="dl-order">
                <div className="dl-panel-head">
                  <h2>{t.taOrder}</h2>
                  <span className="dl-chip">
                    {lines.length} · {pending ? `${pending} ${t.taUnsent}` : lines.length ? t.taAllSent : t.dlEmpty}
                  </span>
                </div>

                <div className="dl-lines dine-order-cards">
                  {lines.length === 0 ? (
                    <div className="dl-empty-inline">
                      <strong>{t.taNoItems}</strong>
                      <span>{t.dlNoItemsHint}</span>
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

                <div className="dl-totals">
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
                  {extraChargeLines.map((c) => (
                    <div key={c.id}>
                      <span>{c.name}</span>
                      <span>{money(c.amount, lang)}</span>
                    </div>
                  ))}
                  <div>
                    <span>{t.dlDeliveryFee}</span>
                    <span>{money(fee, lang)}</span>
                  </div>
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

                <div className="discount-row dl-discount-row">
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
                  <div className="discount-row dl-discount-row">
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

                <div className="dl-actions-row">
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
                      <IconSend /> {t.dlSend}{pending > 0 ? ` (${pending})` : ''}
                    </button>
                  ) : null}
                  {selectedCol === 'preparing' ? (
                    <button type="button" className="btn btn-secondary" onClick={markReady}>
                      <IconCheck /> {t.dlMarkReady}
                    </button>
                  ) : null}
                  {selectedCol === 'ready' ? (
                    <button type="button" className="btn btn-secondary" onClick={dispatchNow}>
                      <IconTruck />{' '}
                      {channelNeedsOwnRider(selected.channel) ? t.dlDispatch : t.dlReleaseCourier}
                    </button>
                  ) : null}
                  {selectedCol === 'dispatched' ? (
                    <button type="button" className="btn btn-secondary" onClick={() => markDelivered()}>
                      <IconCheck /> {deliverActionLabel(selected.channel)}
                    </button>
                  ) : null}
                  {perms.canSettle ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={lines.length === 0 || dayIsClosed}
                      onClick={() => {
                        if (channelNeedsOwnRider(selected.channel) && !selected.deliveryBoyId) {
                          openRiderModal('assign')
                          flash(t.dlAssignRiderFirst)
                          return
                        }
                        setShowSettle(true)
                      }}
                    >
                      <IconPay />{' '}
                      {selectedCol === 'delivered' || selectedCol === 'dispatched'
                        ? t.dlSettleUnpaid
                        : t.settle}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={lines.length === 0}
                      onClick={() => flash(t.dlRequestPayFlash)}
                    >
                      {t.requestPayment}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost dl-cancel-btn" onClick={requestCancel}>
                    <IconCancel /> {t.taCancelTicket}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      <HubFooter backTo="/" backLabel={t.home} />

      {showSend && selected ? (
        <SendOrdersModal
          pendingCount={pending}
          onClose={() => setShowSend(false)}
          onSend={(priority) => {
            sendTicketOrders(selected.id, priority)
            pushChannelStatusQuiet(selected.id, 'preparing')
            setShowSend(false)
            flash(`${t.dlKotSent} · ${priority}`)
          }}
        />
      ) : null}

      {showSettle && selected ? (
        <SettleModal
          title={`${t.navDelivery} D-${laneNo} · ${selected.customer}`}
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
        <CustomerSearchPanel
          title={customerMode === 'create' ? t.dlCustomerSearch : t.dlChangeCustomer}
          selectedId={linkedCustomerId}
          onClose={() => setShowCustomer(false)}
          onSelect={(c) => {
            if (customerMode === 'create') createFromCustomer(c)
            else applyCustomerChange(c)
          }}
        />
      ) : null}

      {showRider ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card dl-rider-modal">
            <div className="section-head">
              <h2>{riderModalMode === 'dispatch' ? t.dlAssignDispatch : t.dlSelectDeliveryBoy}</h2>
              <Link to="/settings/delivery-riders" className="btn btn-ghost">
                {t.dlManage}
              </Link>
              <button type="button" className="btn btn-ghost" onClick={() => setShowRider(false)}>
                ✕
              </button>
            </div>
            <div className="dl-rider-list">
              {riders.length === 0 ? (
                <p className="modal-lead">{t.dlNoRidersBranch}</p>
              ) : (
                riders.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={riderPick === b.id ? 'selected' : ''}
                    onClick={() => setRiderPick(b.id)}
                  >
                    <strong>{b.name}</strong>
                    <span>
                      {b.phone} · {b.status === 'available' ? t.dlRiderFree : t.dlOnRoute}
                    </span>
                  </button>
                ))
              )}
            </div>
            <label className="dl-fee-row">
              {t.dlDeliveryFee}
              <input
                className="search"
                inputMode="decimal"
                value={feeDraft}
                onChange={(e) => setFeeDraft(e.target.value)}
              />
            </label>
            <div className="dl-rider-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowRider(false)}>
                {t.cancel}
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmRider}>
                {riderModalMode === 'dispatch' ? t.dlDispatch : t.ok}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showNote ? (
        <TextPromptModal
          title={t.dlTicketNote}
          label={t.taNoteLabel}
          initialValue={ticketNote}
          placeholder={t.dlNotePlaceholder}
          confirmLabel={t.save}
          cancelLabel={t.printClose}
          onClose={() => setShowNote(false)}
          onConfirm={(value) => {
            const cleaned = value.trim()
            setTicketNote(cleaned)
            setShowNote(false)
            if (selected) updateTicket(selected.id, { note: cleaned || undefined })
            if (cleaned) flash(t.dlNoteSaved)
          }}
        />
      ) : null}

      {otpTicketId ? (
        <TextPromptModal
          title={t.dlCustomerOtp}
          label={otpError || t.dlOtpPrompt}
          initialValue=""
          placeholder="••••"
          confirmLabel={t.dlVerifySettle}
          cancelLabel={t.dlBack}
          onClose={() => {
            setOtpTicketId(null)
            setOtpError('')
          }}
          onConfirm={(value) => {
            const tkt = delivery.find((x) => x.id === otpTicketId)
            if (!tkt) {
              setOtpTicketId(null)
              return
            }
            if (value.replace(/\D/g, '') !== String(tkt.deliveryOtp ?? '')) {
              setOtpError(t.dlWrongOtp)
              flash(t.dlWrongOtpFlash)
              return
            }
            finishDeliverAndSettle(tkt)
          }}
        />
      ) : null}

      {showCancel && selected ? (
        <ConfirmModal
          title={t.dlCancelDelivery}
          message={
            selected.lines.some((l) => l.sent)
              ? `${t.cancel} D-${laneNo} · ${selected.customer}? ${t.dlCancelKitchenWarn}`
              : `${t.cancel} D-${laneNo} · ${selected.customer}? ${t.dlCancelRemoveWarn}`
          }
          confirmLabel={t.taCancelTicket}
          cancelLabel={t.dlKeepTicket}
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
