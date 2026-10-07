import { lineTotal, type KitchenTicket, type OpenTicket, type Table } from '../data/mock'
import { ledgerForDay, todayKey, type LedgerEntry } from '../data/ledger'
import { ticketHref } from './ticketHref'

export type SalesPoint = { hour: number; total: number }

export type DaySales = {
  total: number
  orders: number
  items: number
  customers: number
  /** Running total at the end of each hour. */
  points: SalesPoint[]
}

export type OrderKind = 'dine-in' | 'takeaway' | 'delivery' | 'online' | 'quick' | 'drive' | 'barcode'

export type OrderStatus = 'completed' | 'kitchen' | 'preparing' | 'ready' | 'billing' | 'open' | 'onTheWay'

export type RecentOrder = {
  id: string
  ref: string
  kind: OrderKind
  tableLabel?: string
  at: number
  amount: number
  status: OrderStatus
  to: string
}

/** Ledger day key `offset` days from today (noon avoids DST edges). */
export function dayKeyFromToday(offset: number) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return todayKey(d)
}

function salesOf(ledger: LedgerEntry[], day: string) {
  return ledgerForDay(ledger, day).filter((e) => e.type === 'sale' && e.source !== 'Day Close')
}

export function daySales(ledger: LedgerEntry[], day: string, isToday: boolean): DaySales {
  const sales = salesOf(ledger, day)
  const byHour = new Map<number, number>()
  let items = 0
  const customers = new Set<string>()
  for (const e of sales) {
    const hour = new Date(e.at).getHours()
    byHour.set(hour, (byHour.get(hour) ?? 0) + e.total)
    items += (e.lines ?? []).reduce((s, l) => s + l.qty, 0)
    if (e.customerId) customers.add(e.customerId)
  }
  const hours = [...byHour.keys()]
  const first = Math.min(8, ...hours)
  const lastSale = hours.length ? Math.max(...hours) : first
  const last = isToday ? Math.max(new Date().getHours(), lastSale, first + 1) : Math.max(22, lastSale)
  const points: SalesPoint[] = []
  let running = 0
  for (let h = first; h <= last; h++) {
    running += byHour.get(h) ?? 0
    points.push({ hour: h, total: running })
  }
  return {
    total: sales.reduce((s, e) => s + e.total, 0),
    orders: sales.length,
    items,
    customers: customers.size,
    points,
  }
}

/** Percent change vs the previous day, or null when there is nothing to compare against. */
export function trendVsPrevious(ledger: LedgerEntry[], day: string, total: number): number | null {
  const [y, m, d] = day.split('-').map(Number)
  const prev = new Date(y, m - 1, d, 12)
  prev.setDate(prev.getDate() - 1)
  const prevTotal = salesOf(ledger, todayKey(prev)).reduce((s, e) => s + e.total, 0)
  if (prevTotal <= 0) return null
  return Math.round(((total - prevTotal) / prevTotal) * 100)
}

/** Accepts ISO timestamps or the POS `HH:MM [AM|PM]` clock strings. */
export function parseOpenedAt(raw: string | undefined, now = Date.now()): number | null {
  if (!raw) return null
  if (raw.includes('T')) {
    const ms = Date.parse(raw)
    return Number.isFinite(ms) ? ms : null
  }
  const m = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?/)
  if (!m) return null
  let hour = Number(m[1])
  const minute = Number(m[2])
  const meridiem = m[3]?.toLowerCase()
  if (meridiem === 'p' && hour < 12) hour += 12
  if (meridiem === 'a' && hour === 12) hour = 0
  const d = new Date(now)
  d.setHours(hour, minute, 0, 0)
  if (d.getTime() > now + 60_000) d.setDate(d.getDate() - 1)
  return d.getTime()
}

export function elapsedLabel(fromMs: number, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - fromMs) / 60_000))
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

function ticketKind(ticket: OpenTicket): OrderKind {
  if (ticket.id.startsWith('qs-')) return 'quick'
  if (ticket.id.startsWith('dt-')) return 'drive'
  if (ticket.id.startsWith('bc-') || ticket.channel === 'barcode') return 'barcode'
  if (ticket.tableId || ticket.type === 'dine-in') return 'dine-in'
  return ticket.type
}

function ledgerKind(e: LedgerEntry): OrderKind {
  const src = e.source.toLowerCase()
  if (e.tableLabel || src.startsWith('table') || src.includes('dine')) return 'dine-in'
  if (src.includes('quick') || src.startsWith('qs')) return 'quick'
  if (src.includes('drive') || src.startsWith('dt')) return 'drive'
  if (src.includes('barcode')) return 'barcode'
  if (src.includes('online')) return 'online'
  if (src.includes('delivery')) return 'delivery'
  return 'takeaway'
}

function shortRef(raw: string | undefined, fallback: string) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return `#${digits ? digits.slice(-4) : fallback}`
}

function openStatus(ticket: OpenTicket, table: Table | undefined, kitchen: KitchenTicket[]): OrderStatus {
  if (ticket.deliveryStatus === 'dispatched') return 'onTheWay'
  if (ticket.deliveryStatus === 'ready') return 'ready'
  if (ticket.deliveryStatus === 'preparing') return 'preparing'
  if (table?.status === 'billing') return 'billing'
  const kot = kitchen.find(
    (k) => k.id === `kot-${ticket.id}` || (!!ticket.tableId && k.id === `kot-${ticket.tableId}`),
  )
  if (kot?.status === 'cooking') return 'preparing'
  if (kot?.status === 'queued') return 'kitchen'
  if (kot?.status === 'ready') return 'ready'
  return 'open'
}

export function recentOrders({
  ledger,
  tickets,
  tables,
  kitchen,
  limit = 6,
}: {
  ledger: LedgerEntry[]
  tickets: OpenTicket[]
  tables: Table[]
  kitchen: KitchenTicket[]
  limit?: number
}): RecentOrder[] {
  const now = Date.now()
  const open: RecentOrder[] = tickets
    .filter(
      (tk) =>
        tk.lines.length > 0 &&
        tk.checkStatus !== 'settled' &&
        tk.checkStatus !== 'merged' &&
        !tk.mergedIntoTableId,
    )
    .map((tk) => {
      const table = tk.tableId ? tables.find((tb) => tb.id === tk.tableId) : undefined
      return {
        id: tk.id,
        ref: shortRef(tk.id, '—'),
        kind: ticketKind(tk),
        tableLabel: table?.label,
        at: parseOpenedAt(tk.openedAt, now) ?? now,
        amount: typeof tk.amount === 'number' && tk.amount > 0 ? tk.amount : lineTotal(tk.lines),
        status: openStatus(tk, table, kitchen),
        to: ticketHref(tk),
      }
    })

  const today = todayKey()
  const done: RecentOrder[] = salesOf(ledger, today)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      ref: e.billNo ? `#${e.billNo}` : shortRef(e.orderId ?? e.id, '—'),
      kind: ledgerKind(e),
      tableLabel: e.tableLabel,
      at: Date.parse(e.at) || now,
      amount: e.total,
      status: 'completed' as const,
      to: '/back-office?tab=sales',
    }))

  return [...open, ...done].sort((a, b) => b.at - a.at).slice(0, limit)
}
