import { SAUDI } from '../locale/saudi'
import type { AppliedCharge } from '../state/PosContext'
import {
  calcBill,
  formatTaxPercent,
  type BillLineTaxInput,
  type TaxRateBreakdown,
} from '../lib/bill'
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

/** Keep at most one tax id (Menu Master is single-select). */
export function normalizeTaxIds(taxIds: string[] | undefined | null): string[] {
  if (!taxIds?.length) return []
  const first = String(taxIds[0] ?? '').trim()
  return first ? [first] : []
}

/** Default tax rate ids from Tax master (company default). Prefer a single default. */
export function defaultTaxIds(rows: TaxRate[] = loadTaxes()) {
  const defs = rows.filter((t) => t.active && t.isDefault)
  if (defs.length) return [defs[0].id]
  const vat = rows.find((t) => t.active && t.percent > 0)
  return vat ? [vat.id] : []
}

/** Company Settings / Tax master default percent (e.g. 15). */
export function companyDefaultTaxPercent(rows: TaxRate[] = loadTaxes()): number {
  const id = defaultTaxIds(rows)[0]
  if (id) {
    const t = rows.find((x) => x.id === id)
    if (t) return t.percent
  }
  return SAUDI.vatRate * 100
}

/**
 * Item-level tax if set; otherwise company default from Tax master.
 * Uses only the first tax id when legacy multi-select data exists.
 */
export function dishTaxPercent(
  taxIds: string[] | undefined,
  rows: TaxRate[] = loadTaxes(),
): number {
  const id = normalizeTaxIds(taxIds)[0]
  if (id) {
    const t = rows.find((x) => x.id === id && x.active)
    if (t) return t.percent
  }
  return companyDefaultTaxPercent(rows)
}

/** Legacy helper: percent for selected ids (single rate after normalize). */
export function taxPercentTotal(taxIds: string[] | undefined, rows: TaxRate[] = loadTaxes()) {
  return dishTaxPercent(taxIds, rows)
}

export function billLinesFromOrder(
  lines: { itemId: string; qty: number; price: number; name?: string }[],
  dishes: { id: string; taxIds?: string[]; name?: string }[],
  taxes: TaxRate[] = loadTaxes(),
): BillLineTaxInput[] {
  return lines.map((line) => {
    const dish = dishes.find((d) => d.id === line.itemId)
    return {
      amount: Math.round(line.qty * line.price * 100) / 100,
      taxPercent: dishTaxPercent(dish?.taxIds, taxes),
      name: line.name || dish?.name || line.itemId,
    }
  })
}

/** Options for calcBill so Total VAT = Σ item taxes (with company default fallback). */
export function orderTaxBillOptions(
  lines: { itemId: string; qty: number; price: number; name?: string }[],
  dishes: { id: string; taxIds?: string[]; name?: string }[],
  taxes: TaxRate[] = loadTaxes(),
  enableTax = true,
) {
  return {
    lines: billLinesFromOrder(lines, dishes, taxes),
    defaultTaxPercent: companyDefaultTaxPercent(taxes),
    enableTax,
  }
}

export function vatDisplayLabel(defaultPercent: number, mixedRates?: boolean) {
  if (mixedRates) return 'VAT'
  const p = Number.isFinite(defaultPercent) ? defaultPercent : SAUDI.vatRate * 100
  return `VAT ${formatTaxPercent(p)}%`
}

/** Label for one rate row: VAT 15% */
export function vatRateLabel(percent: number) {
  return `VAT ${formatTaxPercent(percent)}%`
}

export type TaxBreakdownRow = TaxRateBreakdown & {
  /** Item names at this rate (for hover tooltip) */
  items: string[]
}

/**
 * Per-rate VAT rows + which items fall under each rate.
 * Prefer `bill.taxByRate` amounts when provided so UI matches settled totals.
 */
export function taxBreakdownForOrder(args: {
  lines: { itemId: string; qty: number; price: number; name?: string }[]
  dishes: { id: string; name?: string; taxIds?: string[] }[]
  taxes?: TaxRate[]
  discountPct?: number
  charges?: AppliedCharge[]
  extraDiscountAmt?: number
  enableTax?: boolean
  /** When set, use these tax amounts (from settled bill) and only attach item names */
  taxByRate?: TaxRateBreakdown[]
}): TaxBreakdownRow[] {
  const taxes = args.taxes ?? loadTaxes()
  const billLines = billLinesFromOrder(args.lines, args.dishes, taxes)
  const itemsByPct = new Map<number, string[]>()
  for (const line of billLines) {
    const key = Math.round(line.taxPercent * 100) / 100
    const list = itemsByPct.get(key) ?? []
    const label = (line.name || '').trim()
    if (label && !list.includes(label)) list.push(label)
    itemsByPct.set(key, list)
  }
  for (const charge of args.charges ?? []) {
    const pct =
      charge.taxPercent != null && Number.isFinite(charge.taxPercent)
        ? charge.taxPercent
        : companyDefaultTaxPercent(taxes)
    const key = Math.round(pct * 100) / 100
    const list = itemsByPct.get(key) ?? []
    const label = (charge.name || '').trim()
    if (label && !list.includes(label)) list.push(label)
    itemsByPct.set(key, list)
  }

  const rates =
    args.taxByRate?.length && args.enableTax !== false
      ? args.taxByRate
      : calcBill(args.lines.reduce((s, l) => s + l.qty * l.price, 0), args.discountPct ?? 0, args.charges ?? [], {
          lines: billLines,
          defaultTaxPercent: companyDefaultTaxPercent(taxes),
          enableTax: args.enableTax !== false,
          extraDiscountAmt: args.extraDiscountAmt,
        }).taxByRate

  return rates.map((r) => ({
    ...r,
    items: itemsByPct.get(Math.round(r.percent * 100) / 100) ?? [],
  }))
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
