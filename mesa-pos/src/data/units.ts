import { tenantGetItem, tenantSetItem } from './repos/db'

export type MeasureUnit = {
  id: string
  code: string
  name: string
  quantity: number
  kind: 'count' | 'weight' | 'volume' | 'generic'
}

const KEY = 'mesa-units'
const DEMO_IDS = new Set(['u-unit', 'u-kg', 'u-pcs', 'u-g', 'u-ml', 'u-l'])

export function isDemoUnit(id: string) {
  return DEMO_IDS.has(id)
}

export function loadUnits(): MeasureUnit[] {
  try {
    const raw = tenantGetItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as MeasureUnit[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((u) => !isDemoUnit(u.id))
  } catch {
    return []
  }
}

export function saveUnits(rows: MeasureUnit[]) {
  tenantSetItem(KEY, JSON.stringify(rows.filter((u) => !isDemoUnit(u.id))))
}

export function nextUnitCode(rows: MeasureUnit[]) {
  const nums = rows.map((u) => Number(u.code)).filter((n) => !Number.isNaN(n))
  const max = nums.length ? Math.max(...nums) : 1000
  return String(max + 1)
}

export function fromApiUnit(row: Record<string, unknown>): MeasureUnit {
  const kind = String(row.kind ?? 'generic')
  return {
    id: String(row.id),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    quantity: Number(row.quantity ?? 1),
    kind:
      kind === 'count' || kind === 'weight' || kind === 'volume' || kind === 'generic'
        ? kind
        : 'generic',
  }
}
