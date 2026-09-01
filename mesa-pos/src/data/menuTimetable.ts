import { getActiveBranchId } from './company'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type MenuTimetable = {
  id: string
  name: string
  validFrom: string
  validTo: string
  timeFrom: string
  timeTo: string
  departmentIds: string[]
  productIds: string[]
  active: boolean
  createdAt: string
  branchId?: string
}

const KEY = 'mesa-menu-timetables'
const DEMO_IDS = new Set(['mt-1'])

function today() {
  return new Date().toISOString().slice(0, 10)
}

function plusDays(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function isDemoTimetable(id: string) {
  return DEMO_IDS.has(id)
}

export function loadTimetables(): MenuTimetable[] {
  try {
    const raw = tenantGetItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as MenuTimetable[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t) => !isDemoTimetable(t.id))
  } catch {
    return []
  }
}

export function saveTimetables(rows: MenuTimetable[]) {
  tenantSetItem(KEY, JSON.stringify(rows.filter((t) => !isDemoTimetable(t.id)).slice(0, 200)))
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v))
}

export function fromApiTimetable(row: Record<string, unknown>): MenuTimetable {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    validFrom: String(row.validFrom ?? ''),
    validTo: String(row.validTo ?? ''),
    timeFrom: String(row.timeFrom ?? ''),
    timeTo: String(row.timeTo ?? ''),
    departmentIds: asIdList(row.departmentIds),
    productIds: asIdList(row.productIds),
    active: row.active !== false,
    createdAt: row.createdAt ? String(row.createdAt) : new Date().toISOString(),
    branchId: row.branchId ? String(row.branchId) : undefined,
  }
}

export function blankTimetable(branchId = getActiveBranchId()): MenuTimetable {
  return {
    id: `mt-${Date.now()}`,
    name: '',
    validFrom: today(),
    validTo: plusDays(7),
    timeFrom: '09:00',
    timeTo: '17:00',
    departmentIds: [],
    productIds: [],
    active: true,
    createdAt: new Date().toISOString(),
    branchId,
  }
}

/** Sample schedules for a new branch — not demo IDs, so they persist and sync. */
export function starterTimetablesForBranch(branchId = getActiveBranchId()): MenuTimetable[] {
  const from = today()
  const to = plusDays(90)
  const stamp = Date.now()
  return [
    {
      id: `mt-starter-breakfast-${branchId}-${stamp}`,
      name: 'Breakfast',
      validFrom: from,
      validTo: to,
      timeFrom: '06:00',
      timeTo: '11:00',
      departmentIds: [],
      productIds: [],
      active: true,
      createdAt: new Date().toISOString(),
      branchId,
    },
    {
      id: `mt-starter-lunch-${branchId}-${stamp + 1}`,
      name: 'Lunch',
      validFrom: from,
      validTo: to,
      timeFrom: '11:00',
      timeTo: '16:00',
      departmentIds: [],
      productIds: [],
      active: true,
      createdAt: new Date().toISOString(),
      branchId,
    },
    {
      id: `mt-starter-dinner-${branchId}-${stamp + 2}`,
      name: 'Dinner',
      validFrom: from,
      validTo: to,
      timeFrom: '16:00',
      timeTo: '23:00',
      departmentIds: [],
      productIds: [],
      active: true,
      createdAt: new Date().toISOString(),
      branchId,
    },
  ]
}

function expandScopedIds(ids: string[], branchId: string) {
  const suffix = `__${branchId}`
  const out = new Set<string>()
  for (const id of ids) {
    const base = id.endsWith(suffix) ? id.slice(0, -suffix.length) : id
    out.add(id)
    out.add(base)
    out.add(`${base}__${branchId}`)
  }
  return out
}

/** Normalize HH:mm or HH:mm:ss → minutes from midnight */
function toMinutes(t: string) {
  const parts = t.split(':').map(Number)
  const h = parts[0] || 0
  const m = parts[1] || 0
  return h * 60 + m
}

export function isTimetableActiveNow(t: MenuTimetable, at = new Date()) {
  if (!t.active) return false
  const day = at.toISOString().slice(0, 10)
  if (day < t.validFrom || day > t.validTo) return false
  const mins = at.getHours() * 60 + at.getMinutes()
  const from = toMinutes(t.timeFrom)
  const to = toMinutes(t.timeTo)
  if (from <= to) return mins >= from && mins <= to
  // overnight window
  return mins >= from || mins <= to
}

/** If any active timetable matches now and has selections, filter to those. Else allow all. */
export function filterByActiveTimetables(
  categoryIds: string[],
  productIds: string[],
  timetables: MenuTimetable[] = loadTimetables(),
  at = new Date(),
  branchId = getActiveBranchId(),
) {
  const live = timetables.filter(
    (t) => isTimetableActiveNow(t, at) && (!t.branchId || t.branchId === branchId),
  )
  const scoped = live.filter((t) => t.departmentIds.length > 0 || t.productIds.length > 0)
  if (!scoped.length) {
    return { restricted: false as const, categoryIds, productIds }
  }
  const cats = expandScopedIds(
    scoped.flatMap((t) => t.departmentIds),
    branchId,
  )
  const prods = expandScopedIds(
    scoped.flatMap((t) => t.productIds),
    branchId,
  )
  return {
    restricted: true as const,
    categoryIds: cats.size ? [...cats] : categoryIds,
    productIds: [...prods],
  }
}
