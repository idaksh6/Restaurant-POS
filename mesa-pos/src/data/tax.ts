import { tenantGetItem, tenantSetItem } from './repos/db'

export type TaxRate = {
  id: string
  name: string
  percent: number
  active: boolean
  isDefault?: boolean
}

const KEY = 'mesa-tax-rates'
const DEMO_IDS = new Set(['tax-vat', 'tax-zero'])

export function isDemoTax(id: string) {
  return DEMO_IDS.has(id)
}

export function loadTaxes(): TaxRate[] {
  try {
    const raw = tenantGetItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TaxRate[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t) => !isDemoTax(t.id))
  } catch {
    return []
  }
}

export function saveTaxes(rows: TaxRate[]) {
  tenantSetItem(KEY, JSON.stringify(rows.filter((t) => !isDemoTax(t.id))))
}

export function activeTaxes(rows: TaxRate[] = loadTaxes()) {
  return rows.filter((t) => t.active)
}

export function defaultTaxIds(rows: TaxRate[] = loadTaxes()) {
  const defs = rows.filter((t) => t.active && t.isDefault)
  if (defs.length) return defs.map((t) => t.id)
  const vat = rows.find((t) => t.active && t.percent > 0)
  return vat ? [vat.id] : []
}

export function taxPercentTotal(taxIds: string[] | undefined, rows: TaxRate[] = loadTaxes()) {
  if (!taxIds?.length) return 0
  return taxIds.reduce((sum, id) => {
    const t = rows.find((x) => x.id === id && x.active)
    return sum + (t?.percent ?? 0)
  }, 0)
}

export function fromApiTax(row: Record<string, unknown>): TaxRate {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    percent: Number(row.percent ?? 0),
    active: row.active !== false,
    isDefault: row.isDefault === true,
  }
}
