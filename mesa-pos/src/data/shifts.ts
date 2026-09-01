import { getActiveBranchId } from './company'
import { tenantGetItem, tenantSetItem } from './repos/db'

export const SHIFTS_KEY = 'mesa-shifts'

export type ShiftRecord = {
  id: string
  branchId?: string
  userId: string
  userName: string
  openedAt: string
  closedAt?: string
  floatAmount: number
  cashIn: number
  countedCash?: number
  variance?: number
  open: boolean
}

function iso(value: unknown, fallback?: string) {
  if (!value) return fallback
  if (typeof value === 'string') return value
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString()
}

export function fromApiShift(row: Record<string, unknown>): ShiftRecord {
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    userId: String(row.userId ?? ''),
    userName: String(row.userName ?? ''),
    openedAt: iso(row.openedAt, new Date().toISOString()) ?? new Date().toISOString(),
    closedAt: iso(row.closedAt) || undefined,
    floatAmount: Number(row.floatAmount ?? 0),
    cashIn: Number(row.cashIn ?? 0),
    countedCash: row.countedCash != null ? Number(row.countedCash) : undefined,
    variance: row.variance != null ? Number(row.variance) : undefined,
    open: row.open !== false,
  }
}

export function loadAllShifts(): ShiftRecord[] {
  try {
    const raw = tenantGetItem(SHIFTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as ShiftRecord[]) : []
    if (!Array.isArray(parsed)) return []
    const branchId = getActiveBranchId()
    return parsed.map((s) => (s.branchId ? s : { ...s, branchId }))
  } catch {
    return []
  }
}

export function saveAllShifts(rows: ShiftRecord[]) {
  tenantSetItem(SHIFTS_KEY, JSON.stringify(rows.slice(0, 200)))
}

export function shiftsForBranch(rows: ShiftRecord[], branchId = getActiveBranchId()) {
  return rows.filter((s) => !s.branchId || s.branchId === branchId)
}

export function mergeRemoteShifts(
  all: ShiftRecord[],
  remote: ShiftRecord[],
  branchId: string,
  pending: ShiftRecord[] = [],
): ShiftRecord[] {
  const others = all.filter((s) => s.branchId && s.branchId !== branchId)
  const localBranch = all.filter((s) => !s.branchId || s.branchId === branchId)
  const byId = new Map<string, ShiftRecord>()
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
  return [...others, ...byId.values()].sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(0, 200)
}
