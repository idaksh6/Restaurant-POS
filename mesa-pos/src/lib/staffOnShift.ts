import type { RoleKey } from '../auth/roles'
import type { LedgerEntry } from '../data/ledger'
import type { ManagedUser } from '../data/staffUsers'
import type { ShiftRecord } from '../data/shifts'

export type StaffOnShiftRow = {
  id: string
  name: string
  nameAr?: string
  role: RoleKey
  shift: string
  sales: number
  posShiftOpen: boolean
}

function normName(name: string) {
  return name.trim().toLowerCase()
}

function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatShiftRange(
  firstAt: string | undefined,
  lastAt: string | undefined,
  open: boolean,
  locale: string,
  nowLabel: string,
) {
  if (!firstAt) return '—'
  const start = formatTime(firstAt, locale)
  if (open) return `${start}–${nowLabel}`
  if (lastAt && lastAt !== firstAt) return `${start}–${formatTime(lastAt, locale)}`
  return start
}

/** Staff with sales today and/or an open POS shift — derived from ledger + users. */
export function buildStaffOnShift(opts: {
  users: ManagedUser[]
  sales: LedgerEntry[]
  activeShift: ShiftRecord | null
  locale: string
  nowLabel: string
}): StaffOnShiftRow[] {
  const { users, sales, activeShift, locale, nowLabel } = opts

  type Bucket = {
    id: string
    name: string
    nameAr?: string
    role: RoleKey
    sales: number
    firstAt?: string
    lastAt?: string
    posShiftOpen: boolean
  }

  const buckets = new Map<string, Bucket>()

  function touch(staffName: string, mutate: (b: Bucket) => void) {
    const key = normName(staffName)
    const user = users.find((u) => normName(u.name) === key)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        id: user?.id ?? key,
        name: user?.name ?? staffName,
        nameAr: user?.nameAr,
        role: user?.role ?? 'custom',
        sales: 0,
        posShiftOpen: false,
      }
      buckets.set(key, bucket)
    }
    mutate(bucket)
  }

  for (const entry of sales) {
    const staffName = entry.staff?.trim()
    if (!staffName) continue
    touch(staffName, (b) => {
      b.sales += entry.total
      if (!b.firstAt || entry.at < b.firstAt) b.firstAt = entry.at
      if (!b.lastAt || entry.at > b.lastAt) b.lastAt = entry.at
    })
  }

  if (activeShift?.open) {
    const shiftUser =
      users.find((u) => u.id === activeShift.userId) ??
      users.find((u) => normName(u.name) === normName(activeShift.userName))
    const staffName = shiftUser?.name ?? activeShift.userName.trim()
    if (staffName) {
      touch(staffName, (b) => {
        if (shiftUser) {
          b.id = shiftUser.id
          b.name = shiftUser.name
          b.nameAr = shiftUser.nameAr
          b.role = shiftUser.role
        }
        b.posShiftOpen = true
        if (!b.firstAt || activeShift.openedAt < b.firstAt) b.firstAt = activeShift.openedAt
        b.lastAt = new Date().toISOString()
      })
    }
  }

  return [...buckets.values()]
    .filter((b) => b.sales > 0 || b.posShiftOpen)
    .map((b) => ({
      id: b.id,
      name: b.name,
      nameAr: b.nameAr,
      role: b.role,
      sales: Math.round(b.sales * 100) / 100,
      posShiftOpen: b.posShiftOpen,
      shift: formatShiftRange(b.firstAt, b.lastAt, b.posShiftOpen, locale, nowLabel),
    }))
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))
}

export function resolveStaffDisplayName(
  staffKey: string,
  users: ManagedUser[],
  lang: 'en' | 'ar',
  personDisplayName: (row: { name: string; nameAr?: string | null }, lang: 'en' | 'ar') => string,
) {
  const user = users.find((u) => normName(u.name) === normName(staffKey))
  return personDisplayName(user ?? { name: staffKey }, lang)
}
