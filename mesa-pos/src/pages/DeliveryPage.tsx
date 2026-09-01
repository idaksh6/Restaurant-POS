import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import ConfirmModal from '../components/ConfirmModal'
import CustomerSearchPanel from '../components/CustomerSearchPanel'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import MenuPicker from '../components/MenuPicker'
import MesaSelect from '../components/MesaSelect'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import TextPromptModal from '../components/TextPromptModal'
import { seedRiders } from '../data/deliveryRiders'
import { redeemFoodVoucher } from '../data/foodVouchers'
import { lineTotal, money, nowTime, type OpenTicket } from '../data/mock'
import { hydrateSequencesFromApi, nextSeq } from '../data/sequences'
import { calcBill, cashFromSettle, recipesFromDishes } from '../lib/bill'
import { resolveDeliveryColumn, type DeliveryColumn } from '../lib/deliveryBoard'
import { deliveryBill, deliveryNo, makeDeliveryOtp, settleMethodForDelivery } from '../lib/deliverySettle'
import {
  channelDeliverActionLabel,
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
import { ticketFromServer } from '../sync/applyIncoming'
import { SAUDI } from '../locale/saudi'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm, type CrmCustomer } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { attachZatcaToReceipt } from '../hardware/zatca'
import { useShift } from '../state/ShiftContext'
import { useSync } from '../sync/SyncContext'

type CustomerMode = 'create' | 'change'
type RiderModalMode = 'assign' | 'dispatch'

const COLUMNS: Array<{ id: DeliveryColumn; label: string; hint: string }> = [
  { id: 'new', label: 'New', hint: 'Build & send KOT' },
  { id: 'preparing', label: 'Preparing', hint: 'Kitchen in progress' },
  { id: 'ready', label: 'Ready', hint: 'Assign & dispatch' },
  { id: 'dispatched', label: 'Out', hint: 'Deliver & auto-settle' },
  { id: 'delivered', label: 'Delivered', hint: 'Rare · settle if stuck' },
]

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
  const perms = user ? getPermissions(user.role) : getPermissions('cashier')
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { dishes } = useMasters()
  const { redeemGiftCard, deliveryRiders } = useCatalog()
  const { addCashIn } = useShift()
  const { activeBranchId } = useBranch()
  const { syncEpoch, runSync } = useSync()
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

  const [search, setSearch] = useState('')
  const [orderChannel, setOrderChannel] = useState('Direct')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deskOpen, setDeskOpen] = useState(false)
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

  const selected = delivery.find((t) => t.id === selectedId) ?? null
  const lines = selected?.lines ?? []
  const pending = lines.filter((l) => !l.sent).length
  const goods = lineTotal(lines)
  const fee = selected?.deliveryFee ?? 0
  const bill = useMemo(
    () =>
      calcBill(goods, 0, fee > 0 ? [{ id: 'delivery-fee', name: 'Delivery fee', amount: fee }] : []),
    [goods, fee],
  )
  const { tax, total, taxable } = bill
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
    return calcBill(g, 0, f > 0 ? [{ id: 'f', name: 'fee', amount: f }] : []).total
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
      flash('Day is closed')
      return
    }
    setCustomerMode('create')
    setShowCustomer(true)
  }

  function createFromCustomer(c: CrmCustomer | null) {
    if (!c) {
      flash('Select a customer for delivery')
      return
    }
    const n = nextDeliveryNo()
    const ticket: OpenTicket = {
      id: `dl-${n}-${Date.now()}`,
      type: 'delivery',
      customer: c.name,
      phone: c.phone,
      address: c.address || 'Address TBD',
      deliveryFee: channelNeedsOwnRider(orderChannel) ? 15 : 0,
      deliveryStatus: 'new',
      channel: orderChannel,
      openedAt: nowTime(),
      lines: [],
    }
    addTicket(ticket)
    setShowCustomer(false)
    selectTicket(ticket, true)
    flash(`Delivery D-${n} · ${orderChannel} · ${c.name}`)
  }

  function applyCustomerChange(c: CrmCustomer | null) {
    if (!selected) return
    if (!c) {
      flash('Customer required for delivery')
      return
    }
    updateTicket(selected.id, {
      customer: c.name,
      phone: c.phone,
      address: c.address || selected.address,
    })
    setLinkedCustomerId(c.id)
    setShowCustomer(false)
    flash(`Customer · ${c.name}`)
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
    const t = delivery.find((x) => x.id === selectedId) ?? selected
    if (!t) return
    if (!riderPick) {
      flash('Select a delivery boy')
      return
    }
    const feeVal = Math.max(0, Number(feeDraft) || 0)
    if (riderModalMode === 'dispatch') {
      const otp = makeDeliveryOtp()
      updateTicket(t.id, {
        deliveryBoyId: riderPick,
        deliveryFee: feeVal,
        deliveryStatus: 'dispatched',
        dispatchedAt: nowTime(),
        deliveryOtp: otp,
      })
      setShowRider(false)
      const n = notifyCustomerDelivery(
        { ...t, deliveryBoyId: riderPick, deliveryFee: feeVal, deliveryStatus: 'dispatched', deliveryOtp: otp },
        'otp',
      )
      flash(
        `Dispatched · ${findRider(riderPick)?.name ?? 'Rider'} · OTP ${otp}${
          n.sent ? ` · ${n.message}` : ''
        }`,
      )
      return
    }
    updateTicket(t.id, {
      deliveryBoyId: riderPick,
      deliveryFee: feeVal,
    })
    setShowRider(false)
    flash(`Rider · ${findRider(riderPick)?.name ?? 'Assigned'}`)
  }

  function markReady() {
    if (!selected) return
    updateTicket(selected.id, { deliveryStatus: 'ready', kitchenStatus: 'ready' })
    pushChannelStatusQuiet(selected.id, 'ready')
    flash(`Ready · D-${laneNo}`)
  }

  async function acceptExternalOrder(ticket: OpenTicket) {
    try {
      if (apiMastersReady()) {
        await apiAcceptChannelOrder(ticket.id, 30)
        void runSync({ quiet: true }).catch(() => undefined)
      } else {
        updateTicket(ticket.id, { channelAcceptStatus: 'accepted' })
      }
      flash(`Accepted · ${resolveDeliveryChannel(ticket.channel).label} #${ticket.externalOrderId ?? ''}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Accept failed', 'err')
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
      flash(`Rejected · D-${deliveryNo(ticket)}`)
      if (selectedId === ticket.id) {
        setSelectedId(null)
        setDeskOpen(false)
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Reject failed', 'err')
    }
  }

  function markDelivered(ticket?: OpenTicket) {
    const t = ticket ?? selected
    if (!t) return
    if (!t.lines.length) {
      flash('Add items before deliver & settle')
      return
    }
    if (channelNeedsOwnRider(t.channel) && !t.deliveryBoyId) {
      openRiderModal('assign', t)
      flash('Assign own-fleet rider first')
      return
    }
    if (channelNeedsOwnRider(t.channel) && t.deliveryOtp) {
      setOtpTicketId(t.id)
      setOtpError('')
      return
    }
    finishDeliverAndSettle(t)
  }

  function finishDeliverAndSettle(t: OpenTicket) {
    const no = deliveryNo(t)
    const bill = deliveryBill(t)
    const feeAmt = t.deliveryFee ?? 0
    const method = settleMethodForDelivery(t)
    const ch = resolveDeliveryChannel(t.channel)
    const match = customers.find(
      (c) => c.name === t.customer || (t.phone && c.phone === t.phone),
    )
    updateTicket(t.id, {
      deliveryStatus: 'delivered',
      deliveredAt: nowTime(),
    })
    if (match) earnPoints(match.id, bill.total)
    settleTicket(t.id, {
      method,
      source: `Delivery D-${no} · ${t.customer} · ${ch.label} · auto on deliver`,
      staff: user?.name,
      subtotal: bill.taxable,
      tax: bill.tax,
      total: bill.total,
      lines: t.lines,
      customerId: match?.id,
      charges:
        feeAmt > 0 ? [{ id: 'delivery-fee', name: 'Delivery fee', amount: feeAmt }] : undefined,
    })
    deductRecipeStock(t.lines, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(method, bill.total))
    setReceipt(attachZatcaToReceipt({
      title: `Delivery D-${no}`,
      method: channelIsPrepaid(t.channel) ? `${method} · prepaid` : `${method} · COD`,
      lines: t.lines,
      subtotal: bill.taxable,
      tax: bill.tax,
      total: bill.total,
      charges: feeAmt > 0 ? [{ name: 'Delivery fee', amount: feeAmt }] : undefined,
      staff: user?.name,
      time: nowTime(),
      customerName: t.customer,
      kind: 'paid',
    }))
    flash(`Delivered & settled · D-${no} · ${method}`)
    pushChannelStatusQuiet(t.id, 'delivered')
    setOtpTicketId(null)
    if (selectedId === t.id) {
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
        ? `Out for delivery · D-${laneNo}${otp ? ` · OTP ${otp}` : ''}${n.sent ? ` · ${n.message}` : ''}`
        : `Awaiting ${resolveDeliveryChannel(selected.channel).label} courier · D-${laneNo}`,
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
        flash(`Incoming · ${channel} #${externalOrderId}`)
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
        flash(`Incoming (offline) · ${channel} #${externalOrderId}`)
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Ingest failed')
    } finally {
      setIngestBusy(false)
    }
  }

  function openSettleFor(ticket: OpenTicket) {
    selectTicket(ticket, true)
    if (channelNeedsOwnRider(ticket.channel) && !ticket.deliveryBoyId) {
      flash('Assign delivery boy first')
      openRiderModal('assign', ticket)
      return
    }
    if (perms.canSettle) setShowSettle(true)
    else flash('Ask cashier to settle')
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
      flash('Assign delivery boy first')
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
    if (result.customerId) earnPoints(result.customerId, payable)
    settleTicket(selected.id, {
      method: result.method,
      source: `Delivery D-${laneNo} · ${selected.customer}`,
      staff: user?.name,
      subtotal: taxable,
      tax,
      total: payable,
      lines,
      splitPayments: result.splitPayments,
      customerId: result.customerId ?? linkedCustomerId ?? undefined,
      loyaltyRedeem: redeemSar || undefined,
      charges: fee > 0 ? [{ id: 'delivery-fee', name: 'Delivery fee', amount: fee }] : undefined,
    })
    deductRecipeStock(lines, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(result.method, payable, result.splitPayments))
    setShowSettle(false)
    setReceipt(attachZatcaToReceipt({
      title: `Delivery D-${laneNo}`,
      method: result.method,
      lines,
      subtotal: taxable,
      tax,
      total: payable,
      charges: fee > 0 ? [{ name: 'Delivery fee', amount: fee }] : undefined,
      staff: user?.name,
      time: nowTime(),
      customerName: selected.customer,
      kind: 'paid',
    }))
    flash(`Paid · D-${laneNo} · ${result.method}`)
    setSelectedId(null)
    setLinkedCustomerId(null)
    setTicketNote('')
    setDeskOpen(false)
  }

  function cardPrimaryAction(ticket: OpenTicket) {
    if (needsChannelAccept(ticket)) {
      return {
        label: 'Accept',
        run: () => void acceptExternalOrder(ticket),
      }
    }
    const col = resolveDeliveryColumn(ticket)
    if (col === 'new') {
      return {
        label: pendingFor(ticket) ? 'Send KOT' : 'Build',
        run: () => {
          selectTicket(ticket, true)
          if (pendingFor(ticket) && perms.canSendOrders && !needsChannelAccept(ticket)) setShowSend(true)
        },
      }
    }
    if (col === 'preparing') {
      return {
        label: 'Mark ready',
        run: () => {
          selectTicket(ticket, false)
          updateTicket(ticket.id, { deliveryStatus: 'ready', kitchenStatus: 'ready' })
          pushChannelStatusQuiet(ticket.id, 'ready')
          flash(`Ready · D-${deliveryNo(ticket)}`)
        },
      }
    }
    if (col === 'ready') {
      return {
        label: channelNeedsOwnRider(ticket.channel)
          ? ticket.deliveryBoyId
            ? 'Dispatch'
            : 'Assign & go'
          : 'Release to courier',
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
              ? `Out for delivery · D-${deliveryNo(ticket)}${otp ? ` · OTP ${otp}` : ''}${
                  n.sent ? ` · ${n.message}` : ''
                }`
              : `${resolveDeliveryChannel(ticket.channel).label} courier · pickup ${platformOtp ?? '—'} · D-${deliveryNo(ticket)}`,
          )
          pushChannelStatusQuiet(ticket.id, 'dispatched')
        },
      }
    }
    if (col === 'dispatched') {
      return {
        label: channelDeliverActionLabel(ticket.channel),
        run: () => {
          selectTicket(ticket, false)
          markDelivered(ticket)
        },
      }
    }
    return {
      label: 'Settle unpaid',
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
              <h1>Delivery</h1>
              <p>
                {delivery.length} open · {stats.ridersAvail} riders free
                {dayIsClosed ? ' · day closed' : ''}
              </p>
            </div>
          </div>
          <div className="dl-toolbar-stats">
            <span>
              <strong>{stats.new}</strong> new
            </span>
            <span>
              <strong>{stats.preparing}</strong> prep
            </span>
            <span>
              <strong>{stats.ready}</strong> ready
            </span>
            <span>
              <strong>{stats.out}</strong> out
            </span>
            <span className={stats.unpaid ? 'warn' : undefined}>
              <strong>{stats.unpaid}</strong> unpaid
            </span>
          </div>
          <div className="dl-hero-actions">
            {dayIsClosed ? <span className="dl-pill closed">Day closed</span> : null}
            <label className="dl-channel-pick">
              <span>Channel</span>
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
              title="Simulate HungerStation / Jahez style incoming order"
            >
              {ingestBusy ? 'Importing…' : 'Simulate app order'}
            </button>
            <Link to="/courier" className="dl-link-btn">
              Courier pickup
            </Link>
            <Link to="/settings/delivery-integrations" className="dl-link-btn">
              APIs
            </Link>
            <Link to="/settings/delivery-riders" className="dl-link-btn">
              Riders
            </Link>
            <Link to="/rider" className="dl-link-btn">
              Rider app
            </Link>
            <button
              type="button"
              className="btn btn-primary dl-new-btn"
              disabled={dayIsClosed}
              onClick={startAddDelivery}
            >
              <IconPlus /> Add Delivery
            </button>
          </div>
        </header>

        <section className="dl-rider-strip" aria-label="Rider availability">
          {riders.length === 0 ? (
            <span className="dl-rider-empty">No riders — add them in Settings.</span>
          ) : (
            riders.map((r) => (
              <span key={r.id} className={`dl-rider-chip ${r.status}`}>
                <strong>{r.name}</strong>
                <em>{r.status === 'available' ? 'Free' : 'On route'}</em>
              </span>
            ))
          )}
        </section>

        {!deskOpen || !selected ? (
          <section className="dl-kanban">
            {COLUMNS.map((col) => {
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
                      <div className="dl-col-empty">No orders</div>
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
                                {ticket.phone || 'No phone'} · {age}
                              </span>
                              <span className="dl-order-addr">
                                {ticket.address || 'Address TBD'}
                              </span>
                              <div className="dl-order-foot">
                                <span>{money(ticketAmount(ticket))}</span>
                                {unpaid ? (
                                  <span className={`dl-pay ${channelIsPrepaid(ticket.channel) ? 'prepaid' : 'unpaid'}`}>
                                    {channelIsPrepaid(ticket.channel) ? 'Prepaid' : 'COD'}
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
                                    ? 'Unassigned'
                                    : `${ch.label} courier`}
                                </span>
                              )}
                              {ticket.deliveryOtp && channelNeedsOwnRider(ticket.channel) ? (
                                <span className="dl-otp">OTP {ticket.deliveryOtp}</span>
                              ) : null}
                              {ticket.externalOrderId ? (
                                <span className="dl-ext-id">#{ticket.externalOrderId}</span>
                              ) : null}
                              {needsChannelAccept(ticket) ? (
                                <span className="dl-pending-accept">Awaiting accept</span>
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
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  className="dl-order-action reject"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void rejectExternalOrder(ticket)
                                  }}
                                >
                                  Reject
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
              <div>
                <button
                  type="button"
                  className="dl-back"
                  onClick={() => {
                    setDeskOpen(false)
                  }}
                >
                  <IconBack /> Board
                </button>
                <h2>
                  D-{laneNo || '—'} <em>Delivery</em>
                </h2>
                <div className="dl-work-tags">
                  {selectedCol ? (
                    <span className={`dl-status ${columnTone(selectedCol)}`}>
                      {COLUMNS.find((c) => c.id === selectedCol)?.label}
                    </span>
                  ) : null}
                  {selectedCol === 'dispatched' || selectedCol === 'delivered' ? (
                    <span
                      className={`dl-pay ${channelIsPrepaid(selected.channel) ? 'prepaid' : 'unpaid'}`}
                    >
                      {channelIsPrepaid(selected.channel) ? 'Prepaid' : 'COD'}
                    </span>
                  ) : null}
                  <span className="dl-chip soft">{selected.customer}</span>
                  {rider ? <span className="dl-chip soft">{rider.name}</span> : null}
                  {selected.deliveryOtp && channelNeedsOwnRider(selected.channel) ? (
                    <span className="dl-otp">OTP {selected.deliveryOtp}</span>
                  ) : null}
                  {selected.externalOrderId ? (
                    <span className="dl-chip soft">#{selected.externalOrderId}</span>
                  ) : null}
                  <label className="dl-channel-inline">
                    Channel
                    <MesaSelect
                      value={selected.channel || 'Direct'}
                      onChange={(v) => updateTicket(selected.id, { channel: v })}
                      options={KSA_DELIVERY_CHANNELS.map((c) => ({
                        value: c.id,
                        label: c.label,
                      }))}
                    />
                  </label>
                </div>
                {selected.address ? <p className="dl-work-addr">{selected.address}</p> : null}
              </div>
              <div className="dl-work-tools">
                <button
                  type="button"
                  className="dl-tool"
                  onClick={() => {
                    setCustomerMode('change')
                    setShowCustomer(true)
                  }}
                >
                  <IconUser /> Customer
                </button>
                <button type="button" className="dl-tool" onClick={() => setShowNote(true)}>
                  Note
                </button>
                <button type="button" className="dl-tool" onClick={() => openRiderModal('assign')}>
                  <IconTruck /> Rider
                </button>
                <button type="button" className="dl-tool danger" onClick={requestCancel}>
                  <IconCancel /> Cancel
                </button>
              </div>
            </div>

            {ticketNote ? <p className="dl-note">Note: {ticketNote}</p> : null}

            {selected && needsChannelAccept(selected) ? (
              <div className="dl-accept-banner">
                <div>
                  <strong>
                    {resolveDeliveryChannel(selected.channel).label} order · accept to start kitchen
                  </strong>
                  {selected.externalOrderId ? <span>#{selected.externalOrderId}</span> : null}
                </div>
                <div className="dl-accept-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void acceptExternalOrder(selected)}
                  >
                    Accept order
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void rejectExternalOrder(selected)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}

            <div className="dl-work-body">
              <div className="dl-menu">
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

              <div className="dl-order">
                <div className="dl-panel-head">
                  <h2>Order</h2>
                  <span className="dl-chip">
                    {lines.length} · {pending ? `${pending} unsent` : lines.length ? 'all sent' : 'empty'}
                  </span>
                </div>

                <div className="dl-lines">
                  {lines.length === 0 ? (
                    <div className="dl-empty-inline">
                      <strong>No items yet</strong>
                      <span>Tap products to build the delivery ticket.</span>
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

                <div className="dl-totals">
                  <div>
                    <span>Subtotal</span>
                    <span>{money(taxable)}</span>
                  </div>
                  <div>
                    <span>Delivery fee</span>
                    <span>{money(fee)}</span>
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

                <div className="dl-actions-row">
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
                      <IconSend /> Send{pending > 0 ? ` (${pending})` : ''}
                    </button>
                  ) : null}
                  {selectedCol === 'preparing' ? (
                    <button type="button" className="btn btn-secondary" onClick={markReady}>
                      <IconCheck /> Mark ready
                    </button>
                  ) : null}
                  {selectedCol === 'ready' ? (
                    <button type="button" className="btn btn-secondary" onClick={dispatchNow}>
                      <IconTruck />{' '}
                      {channelNeedsOwnRider(selected.channel) ? 'Dispatch' : 'Release to courier'}
                    </button>
                  ) : null}
                  {selectedCol === 'dispatched' ? (
                    <button type="button" className="btn btn-secondary" onClick={() => markDelivered()}>
                      <IconCheck /> {channelDeliverActionLabel(selected.channel)}
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
                          flash('Assign delivery boy first')
                          return
                        }
                        setShowSettle(true)
                      }}
                    >
                      <IconPay />{' '}
                      {selectedCol === 'delivered' || selectedCol === 'dispatched'
                        ? 'Settle unpaid'
                        : 'Settle'}
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
                  <button type="button" className="btn btn-ghost dl-cancel-btn" onClick={requestCancel}>
                    <IconCancel /> Cancel ticket
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      <HubFooter backTo="/" backLabel="Home" />

      {showSend && selected ? (
        <SendOrdersModal
          pendingCount={pending}
          onClose={() => setShowSend(false)}
          onSend={(priority) => {
            sendTicketOrders(selected.id, priority)
            pushChannelStatusQuiet(selected.id, 'preparing')
            setShowSend(false)
            flash(`KOT sent · ${priority}`)
          }}
        />
      ) : null}

      {showSettle && selected ? (
        <SettleModal
          title={`Delivery D-${laneNo} · ${selected.customer}`}
          total={total}
          customers={customers}
          preselectCustomerId={linkedCustomerId ?? undefined}
          onClose={() => setShowSettle(false)}
          onConfirm={completeSettle}
        />
      ) : null}

      {showCustomer ? (
        <CustomerSearchPanel
          title={customerMode === 'create' ? 'Customer Search · Delivery' : 'Change customer'}
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
              <h2>{riderModalMode === 'dispatch' ? 'Assign & dispatch' : 'Select delivery boy'}</h2>
              <Link to="/settings/delivery-riders" className="btn btn-ghost">
                Manage
              </Link>
              <button type="button" className="btn btn-ghost" onClick={() => setShowRider(false)}>
                ✕
              </button>
            </div>
            <div className="dl-rider-list">
              {riders.length === 0 ? (
                <p className="modal-lead">No riders for this branch. Add them in Settings.</p>
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
                      {b.phone} · {b.status}
                    </span>
                  </button>
                ))
              )}
            </div>
            <label className="dl-fee-row">
              Delivery fee
              <input
                className="search"
                inputMode="decimal"
                value={feeDraft}
                onChange={(e) => setFeeDraft(e.target.value)}
              />
            </label>
            <div className="dl-rider-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowRider(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmRider}>
                {riderModalMode === 'dispatch' ? 'Dispatch' : 'Ok'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showNote ? (
        <TextPromptModal
          title="Ticket note"
          label="Note"
          initialValue={ticketNote}
          placeholder="Gate code, landmark, call on arrival…"
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

      {otpTicketId ? (
        <TextPromptModal
          title="Customer OTP"
          label={otpError || 'Enter the 4-digit code from the customer'}
          initialValue=""
          placeholder="••••"
          confirmLabel="Verify & settle"
          cancelLabel="Back"
          onClose={() => {
            setOtpTicketId(null)
            setOtpError('')
          }}
          onConfirm={(value) => {
            const t = delivery.find((x) => x.id === otpTicketId)
            if (!t) {
              setOtpTicketId(null)
              return
            }
            if (value.replace(/\D/g, '') !== String(t.deliveryOtp ?? '')) {
              setOtpError('Wrong OTP — ask customer again')
              flash('Wrong OTP')
              return
            }
            finishDeliverAndSettle(t)
          }}
        />
      ) : null}

      {showCancel && selected ? (
        <ConfirmModal
          title="Cancel delivery"
          message={
            selected.lines.some((l) => l.sent)
              ? `Cancel D-${laneNo} · ${selected.customer}? Kitchen may already have items.`
              : `Cancel D-${laneNo} · ${selected.customer}? This removes it from the board.`
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
