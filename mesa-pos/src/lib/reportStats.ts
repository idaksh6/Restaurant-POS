import type { LedgerEntry } from '../data/ledger'
import { tenderTotals } from '../data/ledger'
import type { ExpenseDetail } from '../data/paymentTypes'

export type ReportPeriod = 'today' | '7d' | '30d' | 'month' | 'custom'

export type ReportRange = { from: string; to: string }

function padDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function todayIso() {
  return padDay(new Date())
}

export function daysAgoIso(days: number) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return padDay(d)
}

export function monthStartIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function resolveReportRange(
  period: ReportPeriod,
  customFrom: string,
  customTo: string,
): ReportRange {
  const to = todayIso()
  if (period === 'today') return { from: to, to }
  if (period === '7d') return { from: daysAgoIso(6), to }
  if (period === '30d') return { from: daysAgoIso(29), to }
  if (period === 'month') return { from: monthStartIso(), to }
  const from = customFrom || daysAgoIso(29)
  const end = customTo || to
  return from <= end ? { from, to: end } : { from: end, to: from }
}

function inRange(day: string, range: ReportRange) {
  return day >= range.from && day <= range.to
}

/** Sales only — skip day-close summary rows. */
export function isReportSale(e: LedgerEntry) {
  return e.type === 'sale' && e.source !== 'Day Close'
}

export function salesInRange(ledger: LedgerEntry[], range: ReportRange) {
  return ledger.filter((e) => isReportSale(e) && inRange(e.day, range))
}

export function voidsInRange(ledger: LedgerEntry[], range: ReportRange) {
  return ledger.filter((e) => e.type === 'void' && inRange(e.day, range))
}

export function discountsInRange(ledger: LedgerEntry[], range: ReportRange) {
  return ledger.filter((e) => e.type === 'discount' && inRange(e.day, range))
}

export function expensesInRange(rows: ExpenseDetail[], range: ReportRange) {
  return rows.filter((r) => inRange(r.date, range))
}

export type ReportOverview = {
  salesTotal: number
  salesNet: number
  taxTotal: number
  discountTotal: number
  voidTotal: number
  ticketCount: number
  expenseTotal: number
  profitLite: number
  avgTicket: number
}

export function buildOverview(
  sales: LedgerEntry[],
  voids: LedgerEntry[],
  discounts: LedgerEntry[],
  expenses: ExpenseDetail[],
): ReportOverview {
  const salesTotal = sales.reduce((s, e) => s + e.total, 0)
  const salesNet = sales.reduce((s, e) => s + e.subtotal, 0)
  const taxTotal = sales.reduce((s, e) => s + e.tax, 0)
  const discountTotal =
    sales.reduce((s, e) => s + (e.discountAmt ?? 0), 0) +
    discounts.reduce((s, e) => s + Math.abs(e.total || e.discountAmt || 0), 0)
  const voidTotal = voids.reduce((s, e) => s + Math.abs(e.total), 0)
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const ticketCount = sales.length
  return {
    salesTotal,
    salesNet,
    taxTotal,
    discountTotal,
    voidTotal,
    ticketCount,
    expenseTotal,
    profitLite: salesTotal - expenseTotal,
    avgTicket: ticketCount ? salesTotal / ticketCount : 0,
  }
}

export type NamedAmount = { name: string; amount: number; count?: number; qty?: number }

export function salesByDay(sales: LedgerEntry[], range: ReportRange): NamedAmount[] {
  const map = new Map<string, number>()
  for (let d = new Date(`${range.from}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
    const key = padDay(d)
    map.set(key, 0)
    if (key >= range.to) break
  }
  for (const e of sales) {
    map.set(e.day, (map.get(e.day) ?? 0) + e.total)
  }
  return [...map.entries()].map(([name, amount]) => ({ name, amount }))
}

/** Hour buckets HH:00 within the selected range (local time). */
export function salesByHour(sales: LedgerEntry[]): NamedAmount[] {
  const map = new Map<string, { amount: number; count: number }>()
  for (let h = 0; h < 24; h += 1) {
    const name = `${String(h).padStart(2, '0')}:00`
    map.set(name, { amount: 0, count: 0 })
  }
  for (const e of sales) {
    const d = new Date(e.at)
    if (Number.isNaN(d.getTime())) continue
    const name = `${String(d.getHours()).padStart(2, '0')}:00`
    const prev = map.get(name) ?? { amount: 0, count: 0 }
    prev.amount += e.total
    prev.count += 1
    map.set(name, prev)
  }
  return [...map.entries()].map(([name, v]) => ({
    name,
    amount: Math.round(v.amount * 100) / 100,
    count: v.count,
  }))
}

export type VoidAuditRow = {
  at: string
  day: string
  source: string
  item: string
  amount: number
  reason: string
  staff: string
}

export function voidAuditRows(voids: LedgerEntry[]): VoidAuditRow[] {
  return voids
    .map((e) => ({
      at: e.at,
      day: e.day || e.at.slice(0, 10),
      source: e.source,
      item: e.voidLineName || (e.lines?.[0] ? `${e.lines[0].qty}× ${e.lines[0].name}` : '—'),
      amount: Math.abs(e.total),
      reason: e.voidReason?.trim() || '—',
      staff: e.staff?.trim() || '—',
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
}

export type FoodCostRow = {
  name: string
  qty: number
  revenue: number
  menuCost: number
  recipeCost: number
  variance: number
}

/** Compare dish.cost (menu) vs recipe×stock cost for sold lines. */
export function foodCostVariance(
  sales: LedgerEntry[],
  dishes: {
    name: string
    alias?: string | null
    cost?: number
    recipe?: { stockId?: string; ingredientId?: string; qty: number }[]
  }[],
  stock: { id: string; name: string; cost: number }[],
): { rows: FoodCostRow[]; menuCogs: number; recipeCogs: number; variance: number } {
  const stockCost = new Map(stock.map((s) => [s.id, s.cost]))
  const byName = new Map<string, (typeof dishes)[0]>()
  for (const d of dishes) {
    byName.set(d.name.trim().toLowerCase(), d)
    if (d.alias?.trim()) byName.set(d.alias.trim().toLowerCase(), d)
  }

  const agg = new Map<string, FoodCostRow>()
  let menuCogs = 0
  let recipeCogs = 0

  for (const e of sales) {
    for (const line of e.lines ?? []) {
      const label = line.name.trim().toLowerCase()
      const dish =
        byName.get(label) ||
        [...byName.entries()].find(([n]) => label.startsWith(n))?.[1]
      const qty = line.qty
      const revenue = Math.round(line.price * qty * 100) / 100
      const menuUnit = dish && typeof dish.cost === 'number' ? Number(dish.cost) || 0 : 0
      let recipeUnit = 0
      if (dish?.recipe?.length) {
        for (const r of dish.recipe) {
          const sid = String(r.ingredientId || r.stockId || '')
          recipeUnit += (stockCost.get(sid) ?? 0) * (Number(r.qty) || 0)
        }
      }
      const menu = Math.round(menuUnit * qty * 100) / 100
      const recipe = Math.round(recipeUnit * qty * 100) / 100
      menuCogs += menu
      recipeCogs += recipe
      const key = dish?.name ?? line.name
      const prev = agg.get(key) ?? {
        name: key,
        qty: 0,
        revenue: 0,
        menuCost: 0,
        recipeCost: 0,
        variance: 0,
      }
      prev.qty += qty
      prev.revenue += revenue
      prev.menuCost += menu
      prev.recipeCost += recipe
      prev.variance = Math.round((prev.menuCost - prev.recipeCost) * 100) / 100
      agg.set(key, prev)
    }
  }

  const rows = [...agg.values()].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
  return {
    rows,
    menuCogs: Math.round(menuCogs * 100) / 100,
    recipeCogs: Math.round(recipeCogs * 100) / 100,
    variance: Math.round((menuCogs - recipeCogs) * 100) / 100,
  }
}

export function paymentBreakdown(sales: LedgerEntry[]): NamedAmount[] {
  const map = tenderTotals(sales)
  return Object.entries(map)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export function channelBreakdown(sales: LedgerEntry[], limit = 12): NamedAmount[] {
  const map = new Map<string, { amount: number; count: number }>()
  for (const e of sales) {
    const name = e.source?.trim() || '—'
    const prev = map.get(name) ?? { amount: 0, count: 0 }
    prev.amount += e.total
    prev.count += 1
    map.set(name, prev)
  }
  const rows = [...map.entries()]
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
  if (rows.length <= limit) return rows
  const top = rows.slice(0, limit - 1)
  const rest = rows.slice(limit - 1)
  return [
    ...top,
    {
      name: 'Other',
      amount: rest.reduce((s, r) => s + r.amount, 0),
      count: rest.reduce((s, r) => s + (r.count ?? 0), 0),
    },
  ]
}

export function topItems(sales: LedgerEntry[], limit = 20): NamedAmount[] {
  const map = new Map<string, { amount: number; qty: number }>()
  for (const e of sales) {
    for (const line of e.lines ?? []) {
      const name = line.name?.trim() || '—'
      const prev = map.get(name) ?? { amount: 0, qty: 0 }
      const lineAmt = Math.round(line.price * line.qty * 100) / 100
      prev.amount += lineAmt
      prev.qty += line.qty
      map.set(name, prev)
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, amount: v.amount, qty: v.qty }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
}

export function expensesByType(
  expenses: ExpenseDetail[],
  typeName: (id: string) => string,
): NamedAmount[] {
  const map = new Map<string, { amount: number; count: number }>()
  for (const e of expenses) {
    const name = typeName(e.expenseTypeId)
    const prev = map.get(name) ?? { amount: 0, count: 0 }
    prev.amount += e.amount
    prev.count += 1
    map.set(name, prev)
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
}

export function staffBreakdown(sales: LedgerEntry[]): NamedAmount[] {
  const map = new Map<string, { amount: number; count: number }>()
  for (const e of sales) {
    const name = e.staff?.trim() || '—'
    const prev = map.get(name) ?? { amount: 0, count: 0 }
    prev.amount += e.total
    prev.count += 1
    map.set(name, prev)
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
}

/** Match ledger line name to menu cost (exact, then longest prefix). */
export function estimateCogs(
  sales: LedgerEntry[],
  dishes: { name: string; alias?: string | null; cost?: number }[],
): { cogs: number; matchedRevenue: number; unmatchedLines: number } {
  const catalog = dishes
    .filter((d) => typeof d.cost === 'number' && d.cost! >= 0)
    .map((d) => ({
      name: d.name.trim().toLowerCase(),
      alias: (d.alias ?? '').trim().toLowerCase(),
      cost: Number(d.cost) || 0,
    }))
    .sort((a, b) => b.name.length - a.name.length)

  let cogs = 0
  let matchedRevenue = 0
  let unmatchedLines = 0

  for (const e of sales) {
    for (const line of e.lines ?? []) {
      const label = line.name.trim().toLowerCase()
      const revenue = Math.round(line.price * line.qty * 100) / 100
      const hit =
        catalog.find((d) => d.name === label || (d.alias && d.alias === label)) ||
        catalog.find(
          (d) =>
            label.startsWith(d.name) ||
            (d.alias && label.startsWith(d.alias)),
        )
      if (hit) {
        cogs += Math.round(hit.cost * line.qty * 100) / 100
        matchedRevenue += revenue
      } else {
        unmatchedLines += 1
      }
    }
  }

  return {
    cogs: Math.round(cogs * 100) / 100,
    matchedRevenue: Math.round(matchedRevenue * 100) / 100,
    unmatchedLines,
  }
}
