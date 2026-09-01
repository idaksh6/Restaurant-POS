import { getActiveBranchId } from './company'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type ExtraCharge = {
  id: string
  branchId?: string
  name: string
  /** fixed SAR amount, or percent of goods subtotal if percent=true */
  amount: number
  percent?: boolean
  active: boolean
  sort?: number
}

export const CHARGES_KEY = 'mesa-extra-charges'

export const seedCharges: ExtraCharge[] = [
  { id: 'ch-svc', name: 'Service charge', amount: 10, percent: true, active: true, sort: 1 },
  { id: 'ch-pack', name: 'Packaging', amount: 5, active: true, sort: 2 },
  { id: 'ch-cov', name: 'Cover charge', amount: 10, active: true, sort: 3 },
]

const DEMO_CHARGE_IDS = new Set(seedCharges.map((c) => c.id))

export function isDemoCharge(id: string) {
  return DEMO_CHARGE_IDS.has(id)
}

export function fromApiCharge(row: Record<string, unknown>): ExtraCharge {
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    name: String(row.name ?? ''),
    amount: Number(row.amount ?? 0),
    percent: row.percent === true,
    active: row.active !== false,
    sort: Number(row.sort ?? 0),
  }
}

export function loadAllCharges(): ExtraCharge[] {
  try {
    const raw = tenantGetItem(CHARGES_KEY)
    const parsed = raw ? (JSON.parse(raw) as ExtraCharge[]) : []
    if (!Array.isArray(parsed)) return []
    const branchId = getActiveBranchId()
    return parsed
      .filter((c) => !isDemoCharge(c.id))
      .map((c) => (c.branchId ? c : { ...c, branchId }))
  } catch {
    return []
  }
}

export function saveAllCharges(rows: ExtraCharge[]) {
  tenantSetItem(CHARGES_KEY, JSON.stringify(rows.filter((c) => !isDemoCharge(c.id))))
}

export function chargesForBranch(rows: ExtraCharge[], branchId = getActiveBranchId()) {
  return rows.filter((c) => !c.branchId || c.branchId === branchId)
}

export function starterChargesForBranch(branchId = getActiveBranchId()): ExtraCharge[] {
  return seedCharges.map((c) => ({
    ...c,
    id: `${c.id}__${branchId}`,
    branchId,
  }))
}

export function calcChargeAmount(charge: ExtraCharge, goodsSubtotal: number) {
  if (charge.percent) return Math.round(((goodsSubtotal * charge.amount) / 100) * 100) / 100
  return charge.amount
}
