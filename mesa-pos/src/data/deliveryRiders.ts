import { getActiveBranchId } from './company'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type DeliveryRider = {
  id: string
  branchId?: string
  name: string
  phone: string
  active: boolean
  sort?: number
}

export const RIDERS_KEY = 'mesa-delivery-riders'

export const seedRiders: DeliveryRider[] = [
  { id: 'd1', name: 'Arun', phone: '+966 50 111 2233', active: true, sort: 1 },
  { id: 'd2', name: 'John', phone: '+966 55 222 3344', active: true, sort: 2 },
  { id: 'd3', name: 'Basil', phone: '+966 54 333 4455', active: true, sort: 3 },
]

const DEMO_RIDER_IDS = new Set(seedRiders.map((r) => r.id))

export function isDemoRider(id: string) {
  return DEMO_RIDER_IDS.has(id)
}

export function fromApiRider(row: Record<string, unknown>): DeliveryRider {
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    active: row.active !== false,
    sort: Number(row.sort ?? 0),
  }
}

export function loadAllRiders(): DeliveryRider[] {
  try {
    const raw = tenantGetItem(RIDERS_KEY)
    const parsed = raw ? (JSON.parse(raw) as DeliveryRider[]) : []
    if (!Array.isArray(parsed)) return []
    const branchId = getActiveBranchId()
    return parsed
      .filter((r) => !isDemoRider(r.id))
      .map((r) => (r.branchId ? r : { ...r, branchId }))
  } catch {
    return []
  }
}

export function saveAllRiders(rows: DeliveryRider[]) {
  tenantSetItem(RIDERS_KEY, JSON.stringify(rows.filter((r) => !isDemoRider(r.id))))
}

export function starterRidersForBranch(branchId = getActiveBranchId()): DeliveryRider[] {
  return seedRiders.map((r) => ({
    ...r,
    id: `${r.id}__${branchId}`,
    branchId,
  }))
}
