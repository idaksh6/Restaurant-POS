import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import MenuPicker from '../components/MenuPicker'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import { lineTotal, money, nowTime, type OpenTicket } from '../data/mock'
import { cashFromSettle, calcBill, recipesFromDishes } from '../lib/bill'
import { resolveDeliveryColumn, type DeliveryColumn } from '../lib/deliveryBoard'
import {
  apiAcceptChannelOrder,
  apiRejectChannelOrder,
  pushChannelStatusQuiet,
} from '../lib/apiDeliveryChannels'
import {
  channelDeliverActionLabel,
  channelIsPrepaid,
  isExternalChannelOrder,
  KSA_DELIVERY_CHANNELS,
  needsChannelAccept,
  resolveDeliveryChannel,
} from '../lib/ksaDelivery'
import { apiIngestDelivery, apiMastersReady } from '../lib/apiMasters'
import { onlineChannels } from '../locale/saudi'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { useSync } from '../sync/SyncContext'
import { ticketFromServer } from '../sync/applyIncoming'

type ChannelFilter = 'all' | (typeof onlineChannels)[number]

const ONLINE_CHANNEL_META = KSA_DELIVERY_CHANNELS.filter((c) =>
  (onlineChannels as readonly string[]).includes(c.id),
)

const COLUMNS: Array<{ id: DeliveryColumn; label: string; hint: string }> = [
  { id: 'new', label: 'New', hint: 'Accept & send KOT' },
  { id: 'preparing', label: 'Kitchen', hint: 'In progress' },
  { id: 'ready', label: 'Ready', hint: 'Hand to courier' },
  { id: 'dispatched', label: 'Out', hint: 'Platform pickup' },
  { id: 'delivered', label: 'Settle', hint: 'Close prepaid' },
]

function OlIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="ol-ico"
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

function IconGlobe() {
  return (
    <OlIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </OlIcon>
  )
}

function IconPlus() {
  return (
    <OlIcon>
      <path d="M12 5v14M5 12h14" />
    </OlIcon>
  )
}

function IconBag() {
  return (
    <OlIcon>
      <path d="M7 7h10l-1 13H8L7 7Z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </OlIcon>
  )
}

function IconClock() {
  return (
    <OlIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </OlIcon>
  )
}

function IconSend() {
  return (
    <OlIcon>
      <path d="M4 12h12" />
      <path d="M13 7l5 5-5 5" />
    </OlIcon>
  )
}

function IconPay() {
  return (
    <OlIcon>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </OlIcon>
  )
}

function IconBack() {
  return (
    <OlIcon>
      <path d="M15 6 9 12l6 6" />
    </OlIcon>
  )
}

function channelAbbr(id: string) {
  if (id === 'HungerStation') return 'HS'
  if (id === 'The Chefz') return 'TC'
  return id.slice(0, 2).toUpperCase()
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
  if (mins < 60) return `${mins}m ago`
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

function onlineNo(ticket: OpenTicket, list: OpenTicket[]) {
  const idx = list.findIndex((t) => t.id === ticket.id)
  return idx >= 0 ? idx + 1 : 0
}

function ticketAmount(ticket: OpenTicket) {
  const goods = lineTotal(ticket.lines)
  const fee = ticket.deliveryFee ?? 0
  return calcBill(goods, 0, fee > 0 ? [{ id: 'fee', name: 'Delivery fee', amount: fee }] : []).total
}

export default function OnlinePage() {
  const { user } = useAuth()
  const perms = user ? getPermissions(user.role) : getPermissions('cashier')
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { dishes } = useMasters()
  const { addCashIn } = useShift()
  const { activeBranchId } = useBranch()
  const { runSync } = useSync()
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

  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const online = useMemo(
    () =>
      tickets.filter(
        (t) =>
          t.type === 'online' ||
          (t.type === 'delivery' && isExternalChannelOrder(t)),
      ),
    [tickets],
  )

  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deskOpen, setDeskOpen] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [ingestBusy, setIngestBusy] = useState(false)
  const [importChannel, setImportChannel] = useState<(typeof onlineChannels)[number]>('HungerStation')

  const filtered = useMemo(() => {
    let rows = online
    if (channelFilter !== 'all') {
      rows = rows.filter((t) => (t.channel || 'HungerStation') === channelFilter)
    }
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((t) => {
      const no = `ol-${onlineNo(t, online)}`
      return (
        no.includes(q) ||
        t.customer.toLowerCase().includes(q) ||
        (t.phone ?? '').toLowerCase().includes(q) ||
        (t.address ?? '').toLowerCase().includes(q) ||
        (t.channel ?? '').toLowerCase().includes(q) ||
        (t.externalOrderId ?? '').toLowerCase().includes(q)
      )
    })
  }, [online, channelFilter, search])

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
      total: online.length,
      accept: online.filter((t) => needsChannelAccept(t)).length,
      kot: online.filter((t) => t.lines.some((l) => !l.sent) && t.lines.length > 0).length,
      ready: online.filter((t) => resolveDeliveryColumn(t) === 'ready').length,
      revenue: online.reduce((sum, t) => sum + ticketAmount(t), 0),
    }),
    [online],
  )

  const channelCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const ch of onlineChannels) map.set(ch, 0)
    for (const t of online) {
      const ch = t.channel || 'HungerStation'
      if (map.has(ch)) map.set(ch, (map.get(ch) ?? 0) + 1)
    }
    return map
  }, [online])

  const selected = online.find((t) => t.id === selectedId) ?? null
  const lines = selected?.lines ?? []
  const pending = lines.filter((l) => !l.sent).length
  const goods = lineTotal(lines)
  const fee = selected?.deliveryFee ?? 0
  const bill = useMemo(
    () => calcBill(goods, 0, fee > 0 ? [{ id: 'delivery-fee', name: 'Delivery fee', amount: fee }] : []),
    [goods, fee],
  )
  const { total, taxable } = bill
  const selectedCol = selected ? resolveDeliveryColumn(selected) : null
  const laneNo = selected ? onlineNo(selected, online) : 0

  function selectTicket(ticket: OpenTicket, openDesk = true) {
    setSelectedId(ticket.id)
    if (openDesk) setDeskOpen(true)
  }

  function pendingFor(ticket: OpenTicket) {
    return ticket.lines.some((l) => !l.sent) && ticket.lines.length > 0
  }

  async function acceptExternalOrder(ticket: OpenTicket) {
    try {
      if (apiMastersReady()) {
        await apiAcceptChannelOrder(ticket.id, 30)
        updateTicket(ticket.id, { channelAcceptStatus: 'accepted', deliveryStatus: 'new' })
        void runSync({ quiet: true }).catch(() => undefined)
      } else {
        updateTicket(ticket.id, { channelAcceptStatus: 'accepted', deliveryStatus: 'new' })
      }
      flash(`Accepted · ${resolveDeliveryChannel(ticket.channel).label}`)
    } catch (err) {
      if (apiMastersReady()) {
        updateTicket(ticket.id, { channelAcceptStatus: 'accepted', deliveryStatus: 'new' })
        flash(`Accepted locally · ${resolveDeliveryChannel(ticket.channel).label}`)
        return
      }
      flash(err instanceof Error ? err.message : 'Accept failed')
    }
  }

  async function rejectExternalOrder(ticket: OpenTicket) {
    try {
      if (apiMastersReady()) {
        await apiRejectChannelOrder(ticket.id, 'Rejected at POS')
        void runSync({ quiet: true }).catch(() => undefined)
      } else {
        cancelTicket(ticket.id, 'Rejected at POS')
      }
      flash(`Rejected · OL-${onlineNo(ticket, online)}`)
      if (selectedId === ticket.id) {
        setSelectedId(null)
        setDeskOpen(false)
      }
    } catch (err) {
      if (apiMastersReady()) {
        cancelTicket(ticket.id, 'Rejected at POS')
        flash(`Rejected locally · OL-${onlineNo(ticket, online)}`)
        if (selectedId === ticket.id) {
          setSelectedId(null)
          setDeskOpen(false)
        }
        return
      }
      flash(err instanceof Error ? err.message : 'Reject failed')
    }
  }

  function completeSettle(result: SettleResult) {
    if (!selected) return
    const redeemSar = result.loyaltyRedeemSar ?? 0
    if (result.customerId && (result.loyaltyRedeemPts ?? 0) > 0) {
      redeemPoints(result.customerId, result.loyaltyRedeemPts!)
    }
    const payable = Math.max(0, Math.round((total - redeemSar) * 100) / 100)
    if (result.customerId) earnPoints(result.customerId, payable)
    settleTicket(selected.id, {
      method: result.method,
      source: `Online · ${selected.channel ?? 'App'}`,
      staff: user?.name,
      subtotal: taxable,
      tax: total - taxable,
      total: payable,
      lines,
      splitPayments: result.splitPayments,
      customerId: result.customerId,
      loyaltyRedeem: redeemSar || undefined,
    })
    deductRecipeStock(lines, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(result.method, payable, result.splitPayments))
    pushChannelStatusQuiet(selected.id, 'delivered')
    setShowSettle(false)
    flash(`Settled · OL-${laneNo}`)
    setSelectedId(null)
    setDeskOpen(false)
  }

  async function importOrder() {
    if (dayIsClosed || ingestBusy) return
    setIngestBusy(true)
    const channel = importChannel
    const externalOrderId = `OL-${Date.now().toString().slice(-6)}`
    const sampleLines = [
      { name: 'Chicken Kabsa', qty: 1, price: 42 },
      { name: 'House Lemonade', qty: 2, price: 14 },
    ]
    try {
      if (apiMastersReady()) {
        const row = await apiIngestDelivery({
          branchId: activeBranchId,
          channel,
          externalOrderId,
          customer: `${channel} Guest`,
          phone: '05' + String(Math.floor(10000000 + Math.random() * 89999999)),
          address: 'Riyadh · delivery zone',
          deliveryFee: 12,
          lines: sampleLines,
        })
        const mapped = ticketFromServer(row)
        if (mapped) {
          addTicket({ ...mapped, type: 'online' })
        }
        void runSync({ quiet: true }).catch(() => undefined)
      } else {
        addTicket({
          id: `ol-${Date.now()}`,
          type: 'online',
          customer: `${channel} Guest`,
          phone: '+966 50 700 8000',
          address: 'Riyadh · delivery zone',
          channel,
          externalOrderId,
          channelAcceptStatus: 'pending',
          deliveryStatus: 'new',
          deliveryFee: 12,
          openedAt: nowTime(),
          branchId: activeBranchId,
          lines: sampleLines.map((l, i) => ({
            id: `ol-line-${i}-${Date.now()}`,
            itemId: `ol-item-${i}`,
            name: l.name,
            qty: l.qty,
            price: l.price,
            sent: false,
          })),
        })
      }
      flash(`${channel} order imported · #${externalOrderId}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIngestBusy(false)
    }
  }

  function cardPrimaryAction(ticket: OpenTicket) {
    if (needsChannelAccept(ticket)) {
      return { label: 'Accept order', run: () => void acceptExternalOrder(ticket) }
    }
    const col = resolveDeliveryColumn(ticket)
    if (col === 'new') {
      return {
        label: pendingFor(ticket) ? 'Send KOT' : 'Open order',
        run: () => {
          selectTicket(ticket, true)
          if (pendingFor(ticket) && perms.canSendOrders) setShowSend(true)
        },
      }
    }
    if (col === 'preparing') {
      return {
        label: 'Mark ready',
        run: () => {
          updateTicket(ticket.id, { deliveryStatus: 'ready', kitchenStatus: 'ready' })
          pushChannelStatusQuiet(ticket.id, 'ready')
          flash(`Ready · OL-${onlineNo(ticket, online)}`)
        },
      }
    }
    if (col === 'ready') {
      return {
        label: 'Release to courier',
        run: () => {
          updateTicket(ticket.id, { deliveryStatus: 'dispatched', dispatchedAt: nowTime() })
          pushChannelStatusQuiet(ticket.id, 'dispatched')
          flash(`${resolveDeliveryChannel(ticket.channel).label} courier notified`)
        },
      }
    }
    if (col === 'dispatched') {
      return {
        label: channelDeliverActionLabel(ticket.channel),
        run: () => {
          selectTicket(ticket, true)
          if (perms.canSettle) setShowSettle(true)
        },
      }
    }
    return {
      label: 'Settle',
      run: () => {
        selectTicket(ticket, true)
        if (perms.canSettle) setShowSettle(true)
      },
    }
  }

  return (
    <div className="zk-dl zk-online">
      <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />

      <div className="dl-page-inner">
        <header className="ol-toolbar">
          <div className="ol-toolbar-brand">
            <span className="ol-hero-mark">
              <IconGlobe />
            </span>
            <div>
              <h1>Online orders</h1>
              <p>
                KSA aggregators · {stats.total} open
                {dayIsClosed ? ' · day closed' : ''}
              </p>
            </div>
          </div>
          <div className="ol-toolbar-stats">
            <span className="ol-stat-pill">
              <IconBag />
              <strong>{stats.total}</strong> active
            </span>
            <span className={`ol-stat-pill${stats.accept ? ' warn' : ''}`}>
              <IconClock />
              <strong>{stats.accept}</strong> accept
            </span>
            <span className={`ol-stat-pill${stats.kot ? ' accent' : ''}`}>
              <IconSend />
              <strong>{stats.kot}</strong> KOT
            </span>
            <span className="ol-stat-pill">
              <IconPay />
              <strong>{money(stats.revenue)}</strong>
            </span>
          </div>
          <div className="ol-toolbar-actions">
            {dayIsClosed ? <span className="dl-pill closed">Day closed</span> : null}
            <Link to="/settings/delivery-integrations" className="ol-link-btn">
              Channel APIs
            </Link>
            <Link to="/courier" className="ol-link-btn">
              Courier pickup
            </Link>
            <button
              type="button"
              className="ol-import-btn"
              disabled={dayIsClosed || ingestBusy}
              onClick={() => void importOrder()}
            >
              <IconPlus />
              {ingestBusy ? 'Importing…' : 'Import order'}
            </button>
          </div>
        </header>

        <section className="ol-channel-strip" aria-label="Filter by channel">
          <button
            type="button"
            className={`ol-channel-tab all${channelFilter === 'all' ? ' active' : ''}`}
            onClick={() => setChannelFilter('all')}
          >
            <span className="ol-channel-glyph all">∗</span>
            <span className="ol-channel-label">All</span>
            <em>{online.length}</em>
          </button>
          {ONLINE_CHANNEL_META.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className={`ol-channel-tab tone-${ch.tone}${channelFilter === ch.id ? ' active' : ''}`}
              onClick={() => setChannelFilter(ch.id as ChannelFilter)}
            >
              <span className={`ol-channel-glyph tone-${ch.tone}`}>{channelAbbr(ch.id)}</span>
              <span className="ol-channel-label">{ch.label}</span>
              <em>{channelCounts.get(ch.id) ?? 0}</em>
            </button>
          ))}
        </section>

        {!deskOpen || !selected ? (
          <section className="dl-kanban ol-kanban">
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
                      <div className="ol-col-empty">
                        <span className="ol-empty-icon">
                          <IconBag />
                        </span>
                        <strong>No {col.label.toLowerCase()} orders</strong>
                        <p>
                          {channelFilter === 'all'
                            ? 'Import or wait for channel webhook'
                            : `No ${channelFilter} orders in this lane`}
                        </p>
                      </div>
                    ) : (
                      cards.map((ticket) => {
                        const no = onlineNo(ticket, online)
                        const age = formatElapsed(parseOpenedMs(ticket.openedAt), nowTick)
                        const action = cardPrimaryAction(ticket)
                        const active = ticket.id === selectedId
                        const ch = resolveDeliveryChannel(ticket.channel)
                        return (
                          <article
                            key={ticket.id}
                            className={`dl-order-card ol-order-card${active ? ' selected' : ''}`}
                          >
                            <button
                              type="button"
                              className="dl-order-main"
                              onClick={() => selectTicket(ticket, true)}
                            >
                              <div className="dl-order-top">
                                <strong>OL-{no || '—'}</strong>
                                <em className={`dl-status ${columnTone(col.id)}`}>{col.label}</em>
                              </div>
                              <span className="dl-order-name">{ticket.customer}</span>
                              <span className="dl-order-meta">
                                {ticket.phone || 'No phone'} · {age}
                              </span>
                              <span className="dl-order-addr">{ticket.address || 'Address TBD'}</span>
                              <div className="dl-order-foot">
                                <span>{money(ticketAmount(ticket))}</span>
                                <span className={`dl-pay ${channelIsPrepaid(ticket.channel) ? 'prepaid' : 'unpaid'}`}>
                                  {channelIsPrepaid(ticket.channel) ? 'Prepaid' : 'COD'}
                                </span>
                              </div>
                              <span className={`ol-channel-badge tone-${ch.tone}`}>
                                <span className={`ol-channel-glyph sm tone-${ch.tone}`}>{channelAbbr(ch.id)}</span>
                                {ch.label}
                              </span>
                              {ticket.externalOrderId ? (
                                <span className="dl-ext-id">#{ticket.externalOrderId}</span>
                              ) : null}
                              {needsChannelAccept(ticket) ? (
                                <span className="dl-pending-accept">Awaiting accept</span>
                              ) : null}
                              {pendingFor(ticket) ? (
                                <span className="ol-kot-pill">KOT pending</span>
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
                                className={`dl-order-action${col.id === 'delivered' || col.id === 'dispatched' ? ' settle' : ''}`}
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
          <section className="dl-work-panel has-ticket ol-work-panel">
            <div className="dl-work-head">
              <div>
                <button
                  type="button"
                  className="dl-back"
                  onClick={() => setDeskOpen(false)}
                >
                  <IconBack /> Board
                </button>
                <h2>
                  OL-{laneNo || '—'}{' '}
                  <em>{resolveDeliveryChannel(selected.channel).label}</em>
                </h2>
                <div className="dl-work-tags">
                  {selectedCol ? (
                    <span className={`dl-status ${columnTone(selectedCol)}`}>
                      {COLUMNS.find((c) => c.id === selectedCol)?.label}
                    </span>
                  ) : null}
                  <span className={`ol-channel-badge tone-${resolveDeliveryChannel(selected.channel).tone}`}>
                    {resolveDeliveryChannel(selected.channel).label}
                  </span>
                  <span className={`dl-pay ${channelIsPrepaid(selected.channel) ? 'prepaid' : 'unpaid'}`}>
                    {channelIsPrepaid(selected.channel) ? 'Prepaid' : 'COD'}
                  </span>
                  {selected.externalOrderId ? (
                    <span className="dl-chip soft">#{selected.externalOrderId}</span>
                  ) : null}
                </div>
                <p className="dl-work-addr">
                  {selected.address} · {selected.phone}
                </p>
              </div>
              <div className="ol-import-channel">
                <span>Import as</span>
                <div className="ol-channel-mini">
                  {onlineChannels.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      className={`ol-mini-tab tone-${resolveDeliveryChannel(ch).tone}${importChannel === ch ? ' active' : ''}`}
                      onClick={() => setImportChannel(ch)}
                    >
                      {channelAbbr(ch)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {needsChannelAccept(selected) ? (
              <div className="ol-accept-banner">
                <div>
                  <strong>Incoming app order</strong>
                  <p>Accept within 30 minutes to start kitchen prep.</p>
                </div>
                <div className="ol-accept-actions">
                  <button type="button" className="btn btn-primary" onClick={() => void acceptExternalOrder(selected)}>
                    Accept
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => void rejectExternalOrder(selected)}>
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
              <div className="dl-bill">
                <div className="order-list">
                  {lines.length === 0 ? (
                    <div className="ol-lines-empty">
                      <IconBag />
                      <p>Add items from the menu or import a channel order</p>
                    </div>
                  ) : (
                    lines.map((line) => (
                      <div key={line.id} className="order-line">
                        <div className="name">{line.name}</div>
                        <strong>{money(line.qty * line.price)}</strong>
                        <div className="sub">{line.sent ? 'KOT sent' : 'Not sent'}</div>
                        <div className="qty-controls">
                          <button type="button" onClick={() => changeTicketQty(selected.id, line.id, -1)}>
                            −
                          </button>
                          <span>{line.qty}</span>
                          <button type="button" onClick={() => changeTicketQty(selected.id, line.id, 1)}>
                            +
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="ticket-footer">
                  <div className="totals">
                    {fee > 0 ? (
                      <div>
                        <span>Delivery fee</span>
                        <span>{money(fee)}</span>
                      </div>
                    ) : null}
                    <div className="grand">
                      <span>Total incl. VAT</span>
                      <span>{money(total)}</span>
                    </div>
                  </div>
                  <div className="action-row">
                    <button
                      type="button"
                      className="btn btn-teal"
                      disabled={!pending || dayIsClosed}
                      onClick={() => {
                        if (!pending) return flash('Nothing new to send')
                        setShowSend(true)
                      }}
                    >
                      Send KOT {pending ? `(${pending})` : ''}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={dayIsClosed || !lines.length}
                      onClick={() => setShowSettle(true)}
                    >
                      Settle
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      <HubFooter backTo="/" trailing={null} />

      {showSend && selected ? (
        <SendOrdersModal
          pendingCount={pending}
          onClose={() => setShowSend(false)}
          onSend={(priority) => {
            sendTicketOrders(selected.id, priority)
            setShowSend(false)
            flash(`KOT sent · OL-${laneNo}`)
          }}
        />
      ) : null}

      {showSettle && selected ? (
        <SettleModal
          title={selected.customer}
          total={total}
          customers={customers}
          onClose={() => setShowSettle(false)}
          onConfirm={completeSettle}
        />
      ) : null}
    </div>
  )
}
