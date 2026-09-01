import { getActiveBranchId } from './company'
import { tenantGetItem, tenantRemoveItem, tenantSetItem } from './repos/db'
import type { OrderLine } from './mock'

export type LedgerType = 'sale' | 'void' | 'discount' | 'charge'

export type LedgerEntry = {
  id: string
  branchId?: string
  at: string
  day: string
  type: LedgerType
  source: string
  method: string
  subtotal: number
  tax: number
  total: number
  discountAmt?: number
  staff?: string
  lines?: { name: string; qty: number; price: number }[]
  splitPayments?: { method: string; amount: number }[]
  customerId?: string
  loyaltyRedeem?: number
  charges?: { id: string; name: string; amount: number }[]
  voidReason?: string
  voidLineName?: string
}

export type SettleMeta = {
  method: string
  source: string
  staff?: string
  subtotal: number
  tax: number
  total: number
  discountAmt?: number
  lines: OrderLine[]
  splitPayments?: { method: string; amount: number }[]
  customerId?: string
  loyaltyRedeem?: number
  charges?: { id: string; name: string; amount: number }[]
}

export const LEDGER_KEY = 'mesa-sales-ledger'
export const DAY_CLOSED_KEY = 'mesa-day-closed'

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export function loadAllLedger(): LedgerEntry[] {
  try {
    const raw = tenantGetItem(LEDGER_KEY)
    return raw ? (JSON.parse(raw) as LedgerEntry[]) : []
  } catch {
    return []
  }
}

export function loadLedger(branchId = getActiveBranchId()): LedgerEntry[] {
  return loadAllLedger().filter((e) => !e.branchId || e.branchId === branchId)
}

export function saveLedger(entries: LedgerEntry[]) {
  tenantSetItem(LEDGER_KEY, JSON.stringify(entries.slice(0, 2000)))
}

const LEDGER_TYPES: LedgerType[] = ['sale', 'void', 'discount', 'charge']

function iso(value: unknown, fallback?: string) {
  if (!value) return fallback
  if (typeof value === 'string' && value.includes('T')) return value
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString()
}

function asLedgerType(value: unknown): LedgerType {
  const t = String(value ?? 'sale')
  return LEDGER_TYPES.includes(t as LedgerType) ? (t as LedgerType) : 'sale'
}

export function fromApiLedgerEntry(row: Record<string, unknown>): LedgerEntry {
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    at: iso(row.at, new Date().toISOString()) ?? new Date().toISOString(),
    day: String(row.day ?? (iso(row.at) ?? '').slice(0, 10)),
    type: asLedgerType(row.type),
    source: String(row.source ?? ''),
    method: String(row.method ?? ''),
    subtotal: Number(row.subtotal ?? 0),
    tax: Number(row.tax ?? 0),
    total: Number(row.total ?? 0),
    discountAmt: row.discountAmt != null ? Number(row.discountAmt) : undefined,
    staff: row.staff ? String(row.staff) : undefined,
    lines: Array.isArray(row.lines) ? (row.lines as LedgerEntry['lines']) : undefined,
    splitPayments: Array.isArray(row.splitPayments)
      ? (row.splitPayments as LedgerEntry['splitPayments'])
      : undefined,
    customerId: row.customerId ? String(row.customerId) : undefined,
    loyaltyRedeem: row.loyaltyRedeem != null ? Number(row.loyaltyRedeem) : undefined,
    charges: Array.isArray(row.charges) ? (row.charges as LedgerEntry['charges']) : undefined,
    voidReason: row.voidReason ? String(row.voidReason) : undefined,
    voidLineName: row.voidLineName ? String(row.voidLineName) : undefined,
  }
}

export function mergeRemoteLedger(
  all: LedgerEntry[],
  remote: LedgerEntry[],
  branchId: string,
  pending: LedgerEntry[] = [],
): LedgerEntry[] {
  const others = all.filter((e) => e.branchId && e.branchId !== branchId)
  const localBranch = all.filter((e) => !e.branchId || e.branchId === branchId)
  const byId = new Map<string, LedgerEntry>()
  const source = remote.length ? remote : localBranch
  for (const row of source) {
    byId.set(row.id, { ...row, branchId: row.branchId ?? branchId })
  }
  if (remote.length) {
    for (const local of localBranch) {
      if (!byId.has(local.id)) byId.set(local.id, { ...local, branchId: local.branchId ?? branchId })
    }
  }
  for (const payload of pending) {
    if (!payload?.id) continue
    if (payload.branchId && payload.branchId !== branchId) continue
    byId.set(payload.id, { ...payload, branchId: payload.branchId ?? branchId })
  }
  return [...others, ...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 2000)
}

function dayClosedKey(branchId: string) {
  return `${DAY_CLOSED_KEY}:${branchId}`
}

export function loadDayClosed(branchId = getActiveBranchId()): string | null {
  try {
    const scoped = tenantGetItem(dayClosedKey(branchId))
    if (scoped) return scoped
    const legacy = tenantGetItem(DAY_CLOSED_KEY)
    if (legacy) {
      tenantSetItem(dayClosedKey(branchId), legacy)
      tenantRemoveItem(DAY_CLOSED_KEY)
      return legacy
    }
    return null
  } catch {
    return null
  }
}

export function saveDayClosed(day: string | null, branchId = getActiveBranchId()) {
  if (day) tenantSetItem(dayClosedKey(branchId), day)
  else tenantRemoveItem(dayClosedKey(branchId))
}

export function makeSaleEntry(meta: SettleMeta, branchId = getActiveBranchId()): LedgerEntry {
  const day = todayKey()
  return {
    id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    branchId,
    at: new Date().toISOString(),
    day,
    type: 'sale',
    source: meta.source,
    method: meta.method,
    subtotal: meta.subtotal,
    tax: meta.tax,
    total: meta.total,
    discountAmt: meta.discountAmt,
    staff: meta.staff,
    lines: meta.lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
    splitPayments: meta.splitPayments,
    customerId: meta.customerId,
    loyaltyRedeem: meta.loyaltyRedeem,
    charges: meta.charges,
  }
}

export function ledgerForDay(entries: LedgerEntry[], day = todayKey()) {
  return entries.filter((e) => e.day === day)
}

export function tenderTotals(entries: LedgerEntry[]) {
  const map: Record<string, number> = {}
  for (const e of entries.filter((x) => x.type === 'sale')) {
    if (e.splitPayments?.length) {
      for (const p of e.splitPayments) {
        const key = p.method.toLowerCase().includes('equal') ? 'Split' : p.method
        map[key] = (map[key] ?? 0) + p.amount
      }
    } else {
      const key = e.method.startsWith('Split') ? 'Split' : e.method
      map[key] = (map[key] ?? 0) + e.total
    }
  }
  return map
}

export function cashFromLedger(entries: LedgerEntry[]) {
  let cash = 0
  for (const e of entries.filter((x) => x.type === 'sale')) {
    if (e.splitPayments?.length) {
      for (const p of e.splitPayments) {
        if (/cash/i.test(p.method)) cash += p.amount
      }
    } else if (/^cash$/i.test(e.method) || e.method.toLowerCase().startsWith('cash')) {
      cash += e.total
    }
  }
  return cash
}
