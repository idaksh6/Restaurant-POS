import type { StockItem } from './mock'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type StockLocationType = 'cold' | 'dry' | 'station' | 'other'

export type StockLocation = {
  id: string
  label: string
  hint?: string
  type: StockLocationType
  active: boolean
  sortOrder: number
}

export type StockLocationBalances = Record<string, number>

export const STOCK_LOCATIONS_KEY = 'mesa-stock-locations'
export const STOCK_LOCATIONS_CHANGED = 'mesa:stock-locations-changed'

const LEGACY_STORE_KEY = 'store'

/** Default seed — used until admin customizes in Storage locations master. */
export const SEED_STOCK_LOCATIONS: StockLocation[] = [
  {
    id: 'cold_store',
    label: 'Walk-in refrigerator',
    hint: 'Main cold room',
    type: 'cold',
    active: true,
    sortOrder: 10,
  },
  {
    id: 'dry_store',
    label: 'Central dry store',
    hint: 'Dry goods & bulk storage',
    type: 'dry',
    active: true,
    sortOrder: 20,
  },
  {
    id: 'bar',
    label: 'Beverage / bar counter',
    hint: 'Bar station & coffee service',
    type: 'station',
    active: true,
    sortOrder: 30,
  },
  {
    id: 'kitchen',
    label: 'Kitchen line',
    hint: 'Prep & cooking station',
    type: 'station',
    active: true,
    sortOrder: 40,
  },
  {
    id: 'pastry',
    label: 'Bakery / pastry line',
    hint: 'Dessert & bakery station',
    type: 'station',
    active: true,
    sortOrder: 50,
  },
]

/** @deprecated Use loadStockLocations() — kept for type compatibility in imports. */
export const STOCK_LOCATIONS = SEED_STOCK_LOCATIONS

export type StockLocationId = string

export function loadStockLocations(): StockLocation[] {
  try {
    const raw = tenantGetItem(STOCK_LOCATIONS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StockLocation[]
      if (Array.isArray(parsed) && parsed.length) {
        return parsed
          .map(normalizeLocationRow)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      }
    }
  } catch {
    /* fall through */
  }
  return SEED_STOCK_LOCATIONS.map((r) => ({ ...r }))
}

export function activeStockLocations(): StockLocation[] {
  return loadStockLocations().filter((l) => l.active)
}

export function saveStockLocations(rows: StockLocation[]) {
  const sorted = [...rows]
    .map(normalizeLocationRow)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  tenantSetItem(STOCK_LOCATIONS_KEY, JSON.stringify(sorted))
  window.dispatchEvent(new Event(STOCK_LOCATIONS_CHANGED))
}

export function stockLocationLabel(id: string): string {
  return loadStockLocations().find((l) => l.id === id)?.label ?? id
}

export function stockLocationById(id: string): StockLocation | undefined {
  return loadStockLocations().find((l) => l.id === id)
}

export function defaultReceiveLocationId(): string {
  const active = activeStockLocations()
  return (
    active.find((l) => l.id === 'dry_store')?.id ??
    active.find((l) => l.type === 'dry')?.id ??
    active[0]?.id ??
    'dry_store'
  )
}

/** Prefer ingredient home location when it still exists in the master. */
export function resolveReceiveLocationId(preferred?: string | null): string {
  const id = preferred?.trim()
  if (id && activeStockLocations().some((l) => l.id === id)) return id
  return defaultReceiveLocationId()
}

/**
 * Best "From" location for a stock move: location with qty (prefer home),
 * else home / receive default even at 0 so staff know where the item lives.
 */
export function preferFromLocationId(
  item: Pick<StockItem, 'onHand' | 'locationBalances'>,
  preferred?: string | null,
): string {
  const balances = normalizeLocationBalances(item)
  const home = resolveReceiveLocationId(preferred)
  const withQty = activeStockLocations()
    .map((l) => l.id)
    .filter((id) => (balances[id] ?? 0) > 0)
  if (withQty.includes(home)) return home
  if (withQty.length) return withQty[0]
  return home
}

export function defaultDeductPreferOrder(): string[] {
  const active = activeStockLocations()
  const stations = active.filter((l) => l.type === 'station').map((l) => l.id)
  const dry = active.filter((l) => l.type === 'dry').map((l) => l.id)
  const cold = active.filter((l) => l.type === 'cold').map((l) => l.id)
  const other = active.filter((l) => l.type === 'other').map((l) => l.id)
  return [...stations, ...dry, ...cold, ...other]
}

export function locationHasStock(stock: StockItem[], locationId: string): boolean {
  return stock.some((item) => {
    const bal = normalizeLocationBalances(item)[locationId] ?? 0
    return bal > 0
  })
}

export function nextLocationSortOrder(rows: StockLocation[]): number {
  if (!rows.length) return 10
  return Math.max(...rows.map((r) => r.sortOrder)) + 10
}

export function slugLocationId(label: string, rows: StockLocation[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 32) || 'location'
  let id = base
  let n = 2
  while (rows.some((r) => r.id === id)) {
    id = `${base}_${n}`
    n += 1
  }
  return id
}

/** Quick-add a storage location. Fails when the label already exists (case-insensitive). */
export function addStockLocationQuick(
  label: string,
  type: StockLocationType = 'other',
):
  | { ok: true; location: StockLocation }
  | { ok: false; error: string; existing?: StockLocation } {
  const trimmed = label.trim()
  if (!trimmed) return { ok: false, error: 'Location name is required' }
  const rows = loadStockLocations()
  const existing = rows.find((r) => r.label.toLowerCase() === trimmed.toLowerCase())
  if (existing) {
    return {
      ok: false,
      error: `Location “${existing.label}” already exists`,
      existing,
    }
  }
  const location: StockLocation = {
    id: slugLocationId(trimmed, rows),
    label: trimmed,
    type,
    active: true,
    sortOrder: nextLocationSortOrder(rows),
  }
  saveStockLocations([...rows, location])
  return { ok: true, location }
}

function normalizeLocationRow(row: StockLocation): StockLocation {
  return {
    id: String(row.id ?? '').trim() || slugLocationId(String(row.label ?? 'location'), []),
    label: String(row.label ?? '').trim(),
    hint: row.hint?.trim() || undefined,
    type:
      row.type === 'cold' || row.type === 'dry' || row.type === 'station' || row.type === 'other'
        ? row.type
        : 'other',
    active: row.active !== false,
    sortOrder: Number.isFinite(row.sortOrder) ? Number(row.sortOrder) : 100,
  }
}

export function roundStockQty(n: number) {
  return Math.round(n * 100) / 100
}

export function emptyLocationBalances(): StockLocationBalances {
  const base: StockLocationBalances = {}
  for (const loc of activeStockLocations()) base[loc.id] = 0
  return base
}

function readLegacyBalances(raw: Record<string, unknown>): StockLocationBalances {
  const out: StockLocationBalances = {}
  for (const loc of loadStockLocations()) {
    const v = raw[loc.id]
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[loc.id] = roundStockQty(Math.max(0, v))
    }
  }
  const legacyStore = raw[LEGACY_STORE_KEY]
  if (typeof legacyStore === 'number' && Number.isFinite(legacyStore) && legacyStore > 0) {
    const dryId = defaultReceiveLocationId()
    out[dryId] = roundStockQty((out[dryId] ?? 0) + legacyStore)
  }
  return out
}

export function normalizeLocationBalances(
  item: Pick<StockItem, 'onHand' | 'locationBalances'>,
): StockLocationBalances {
  const base = emptyLocationBalances()
  if (item.locationBalances && typeof item.locationBalances === 'object') {
    const parsed = readLegacyBalances(item.locationBalances as Record<string, unknown>)
    for (const loc of loadStockLocations()) {
      if (parsed[loc.id] != null) base[loc.id] = parsed[loc.id]!
    }
    if (totalOnHand(base) > 0) return base
  }
  const recv = defaultReceiveLocationId()
  if (recv) base[recv] = roundStockQty(Math.max(0, item.onHand ?? 0))
  return base
}

export function totalOnHand(balances: StockLocationBalances | Record<string, number>) {
  const ids = activeStockLocations().map((l) => l.id)
  const keys = ids.length ? ids : Object.keys(balances)
  return roundStockQty(keys.reduce((sum, id) => sum + (Number(balances[id]) || 0), 0))
}

export function migrateStockItem(item: StockItem): StockItem {
  const locationBalances = normalizeLocationBalances(item)
  return { ...item, locationBalances, onHand: totalOnHand(locationBalances) }
}

export function locationBalance(
  item: Pick<StockItem, 'onHand' | 'locationBalances'>,
  locationId: string,
) {
  return normalizeLocationBalances(item)[locationId] ?? 0
}

export function deductFromLocations(
  balances: StockLocationBalances,
  qty: number,
  prefer: string[] = defaultDeductPreferOrder(),
) {
  let remaining = roundStockQty(qty)
  const next = { ...balances }
  for (const loc of prefer) {
    if (remaining <= 0) break
    const have = next[loc] ?? 0
    const take = Math.min(have, remaining)
    next[loc] = roundStockQty(have - take)
    remaining = roundStockQty(remaining - take)
  }
  return { balances: next, remaining }
}

export const LOCATION_TYPE_LABELS: Record<StockLocationType, string> = {
  cold: 'Cold storage',
  dry: 'Dry storage',
  station: 'Work station',
  other: 'Other',
}
