import { calcVat } from '../locale/saudi'
import type { AppliedCharge } from '../state/PosContext'

export type BillBreakdown = {
  goods: number
  discountAmt: number
  charges: AppliedCharge[]
  chargeTotal: number
  taxable: number
  tax: number
  /** Payable before loyalty redeem */
  total: number
}

export function calcBill(
  goods: number,
  discountPct = 0,
  charges: AppliedCharge[] = [],
): BillBreakdown {
  const discountAmt = Math.round(((goods * Math.min(100, Math.max(0, discountPct))) / 100) * 100) / 100
  const chargeTotal = Math.round(charges.reduce((s, c) => s + c.amount, 0) * 100) / 100
  const taxable = Math.round((goods - discountAmt + chargeTotal) * 100) / 100
  const tax = Math.round(calcVat(taxable) * 100) / 100
  const total = Math.round((taxable + tax) * 100) / 100
  return { goods, discountAmt, charges, chargeTotal, taxable, tax, total }
}

export function cashFromSettle(
  method: string,
  total: number,
  splitPayments?: { method: string; amount: number }[],
) {
  if (splitPayments?.length) {
    return splitPayments.filter((p) => /cash/i.test(p.method)).reduce((s, p) => s + p.amount, 0)
  }
  if (/^cash$/i.test(method) || method.toLowerCase().startsWith('cash')) return total
  return 0
}

export function recipesFromDishes(
  dishes: { id: string; recipe?: { ingredientId?: string; stockId?: string; qty: number }[] }[],
): Record<string, { ingredientId: string; qty: number }[]> {
  const map: Record<string, { ingredientId: string; qty: number }[]> = {}
  for (const d of dishes) {
    if (!d.recipe?.length) continue
    map[d.id] = d.recipe
      .map((r) => ({
        ingredientId: String(r.ingredientId || r.stockId || ''),
        qty: Number(r.qty) || 0,
      }))
      .filter((r) => r.ingredientId && r.qty > 0)
  }
  return map
}
