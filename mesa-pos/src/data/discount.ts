import { tenantGetItem, tenantSetItem } from './repos/db'

export type DiscountRate = {
  id: string
  name: string
  /** Percent off (0–100) */
  percent: number
  active: boolean
  /** Shown first / preferred quick-pick on floor */
  isDefault?: boolean
  sort?: number
}

const KEY = 'mesa-discount-rates'

export function loadDiscounts(): DiscountRate[] {
  try {
    const raw = tenantGetItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DiscountRate[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

export function saveDiscounts(rows: DiscountRate[]) {
  tenantSetItem(KEY, JSON.stringify(rows))
}

export function activeDiscounts(rows: DiscountRate[] = loadDiscounts()) {
  return rows.filter((d) => d.active).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.percent - b.percent)
}

/** Floor quick-pick percents: 0% + active master rates (fallback 5/10/15). */
export function floorDiscountPercents(rows: DiscountRate[] = loadDiscounts()) {
  const active = activeDiscounts(rows).map((d) => d.percent)
  const uniq = [...new Set(active.filter((p) => p > 0 && p <= 100))].sort((a, b) => a - b)
  if (!uniq.length) return [0, 5, 10, 15]
  return [0, ...uniq]
}

export function starterDiscounts(): DiscountRate[] {
  return [
    { id: 'disc-5', name: '5% off', percent: 5, active: true, sort: 1 },
    { id: 'disc-10', name: '10% off', percent: 10, active: true, isDefault: true, sort: 2 },
    { id: 'disc-15', name: '15% off', percent: 15, active: true, sort: 3 },
  ]
}

export function fromApiDiscount(row: Record<string, unknown>): DiscountRate {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    percent: Number(row.percent ?? 0),
    active: row.active !== false,
    isDefault: row.isDefault === true,
    sort: row.sort != null ? Number(row.sort) : undefined,
  }
}
