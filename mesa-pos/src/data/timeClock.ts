import { getActiveBranchId } from './company'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type TimePunch = {
  id: string
  userId: string
  userName: string
  branchId: string
  clockInAt: string
  clockOutAt?: string
  note?: string
}

const KEY = 'mesa-time-punches'

export function loadTimePunches(): TimePunch[] {
  try {
    const raw = tenantGetItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TimePunch[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTimePunches(rows: TimePunch[]) {
  tenantSetItem(KEY, JSON.stringify(rows))
}

export function punchesForBranch(rows: TimePunch[], branchId = getActiveBranchId()) {
  return rows.filter((p) => !p.branchId || p.branchId === branchId)
}

export function openPunchForUser(rows: TimePunch[], userId: string, branchId = getActiveBranchId()) {
  return punchesForBranch(rows, branchId).find((p) => p.userId === userId && !p.clockOutAt)
}

export function punchHours(p: TimePunch) {
  const start = new Date(p.clockInAt).getTime()
  const end = p.clockOutAt ? new Date(p.clockOutAt).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
  return Math.round(((end - start) / 3600000) * 100) / 100
}

export function hoursByEmployee(rows: TimePunch[]) {
  const map = new Map<string, { userId: string; userName: string; hours: number; punches: number }>()
  for (const p of rows) {
    const prev = map.get(p.userId) ?? {
      userId: p.userId,
      userName: p.userName,
      hours: 0,
      punches: 0,
    }
    prev.hours += punchHours(p)
    prev.punches += 1
    map.set(p.userId, prev)
  }
  return [...map.values()]
    .map((r) => ({ ...r, hours: Math.round(r.hours * 100) / 100 }))
    .sort((a, b) => b.hours - a.hours)
}
