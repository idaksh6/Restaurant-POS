import { SAUDI } from '../locale/saudi'
import type { AppliedCharge } from '../state/PosContext'

export type TaxRateBreakdown = {
  percent: number
  tax: number
}

export type BillBreakdown = {
  goods: number
  discountAmt: number
  charges: AppliedCharge[]
  chargeTotal: number
  taxable: number
  tax: number
  /** VAT split by rate (e.g. 15% and 10%). Sum equals `tax`. */
  taxByRate: TaxRateBreakdown[]
  /** Payable before loyalty redeem */
  total: number
}

/** One cart line’s goods amount with its resolved tax percent. */
export type BillLineTaxInput = {
  amount: number
  taxPercent: number
  /** Optional label for tooltips / receipt detail */
  name?: string
}

export type CalcBillOptions = {
  /**
   * When set, VAT is Σ(line net × line rate) + Σ(charge × charge rate).
   * Discount is allocated proportionally across line amounts (not charges).
   */
  lines?: BillLineTaxInput[]
  /** Company / tax-master default % used for charges without taxPercent and goods-only bills */
  defaultTaxPercent?: number
  /** When false, tax is 0 (company enableTax off) */
  enableTax?: boolean
  /** Extra SAR discount (e.g. food voucher) applied after %-discount, before VAT. */
  extraDiscountAmt?: number
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

function addRate(map: Map<number, number>, percent: number, tax: number) {
  if (tax <= 0) return
  const key = roundMoney(percent)
  map.set(key, roundMoney((map.get(key) ?? 0) + tax))
}

function mapToBreakdown(map: Map<number, number>): TaxRateBreakdown[] {
  return [...map.entries()]
    .map(([percent, tax]) => ({ percent, tax: roundMoney(tax) }))
    .filter((r) => r.tax > 0)
    .sort((a, b) => b.percent - a.percent)
}

export function calcBill(
  goods: number,
  discountPct = 0,
  charges: AppliedCharge[] = [],
  options?: CalcBillOptions,
): BillBreakdown {
  const pctDiscount = roundMoney((goods * Math.min(100, Math.max(0, discountPct))) / 100)
  const extra = Math.max(0, roundMoney(options?.extraDiscountAmt ?? 0))
  const chargeTotal = roundMoney(charges.reduce((s, c) => s + c.amount, 0))
  // Cap combined discounts so taxable cannot go below 0.
  const maxDiscount = roundMoney(Math.max(0, goods + chargeTotal))
  const discountAmt = pctDiscount // %-discount only (voucher shown separately on receipt)
  const totalDiscount = roundMoney(Math.min(maxDiscount, pctDiscount + extra))
  const taxable = roundMoney(Math.max(0, goods - totalDiscount + chargeTotal))
  const enableTax = options?.enableTax !== false
  const defaultPct = options?.defaultTaxPercent ?? SAUDI.vatRate * 100

  let tax = 0
  const rateMap = new Map<number, number>()
  if (enableTax) {
    const lines = options?.lines
    if (lines?.length) {
      const lineGoods = lines.reduce((s, l) => s + l.amount, 0)
      const denom = lineGoods > 0 ? lineGoods : 1
      for (const line of lines) {
        const share = line.amount / denom
        const lineNet = Math.max(0, line.amount - totalDiscount * share)
        const lineTax = lineNet * (Math.max(0, line.taxPercent) / 100)
        tax += lineTax
        addRate(rateMap, line.taxPercent, lineTax)
      }
      for (const charge of charges) {
        const pct =
          charge.taxPercent != null && Number.isFinite(charge.taxPercent)
            ? Math.max(0, charge.taxPercent)
            : Math.max(0, defaultPct)
        const chargeTax = charge.amount * (pct / 100)
        tax += chargeTax
        if (chargeTax > 0) addRate(rateMap, pct, chargeTax)
      }
    } else {
      tax = taxable * (Math.max(0, defaultPct) / 100)
      addRate(rateMap, defaultPct, tax)
    }
  }

  tax = roundMoney(tax)
  let taxByRate = mapToBreakdown(rateMap)
  if (!taxByRate.length && tax > 0) {
    taxByRate = [{ percent: defaultPct, tax }]
  }
  const sumRates = roundMoney(taxByRate.reduce((s, r) => s + r.tax, 0))
  if (taxByRate.length && Math.abs(sumRates - tax) >= 0.01) {
    const diff = roundMoney(tax - sumRates)
    taxByRate = taxByRate.map((r, i) => (i === 0 ? { ...r, tax: roundMoney(r.tax + diff) } : r))
  }
  const total = roundMoney(taxable + tax)
  return { goods, discountAmt, charges, chargeTotal, taxable, tax, taxByRate, total }
}

/** Bill after applying a food voucher as a pre-VAT discount. */
export function calcBillWithFoodVoucher(
  goods: number,
  discountPct: number,
  charges: AppliedCharge[],
  taxOptions: CalcBillOptions | undefined,
  foodVoucherSar: number,
): BillBreakdown {
  return calcBill(goods, discountPct, charges, {
    ...taxOptions,
    extraDiscountAmt: Math.max(0, foodVoucherSar),
  })
}

/** Payable + tax after food voucher (pre-VAT) and loyalty (post-VAT). */
export function settleAfterFoodVoucher(args: {
  goods: number
  discountPct?: number
  charges?: AppliedCharge[]
  taxOptions?: CalcBillOptions
  /** Precomputed bill when no voucher — avoids double calc. */
  baseBill?: BillBreakdown
  foodVoucherSar?: number
  loyaltySar?: number
  roundOff?: number
}): { bill: BillBreakdown; payable: number; voucherSar: number } {
  const voucherSar = Math.max(0, roundMoney(args.foodVoucherSar ?? 0))
  const loyaltySar = Math.max(0, roundMoney(args.loyaltySar ?? 0))
  const roundOff = roundMoney(args.roundOff ?? 0)
  const bill =
    voucherSar > 0
      ? calcBillWithFoodVoucher(
          args.goods,
          args.discountPct ?? 0,
          args.charges ?? [],
          args.taxOptions,
          voucherSar,
        )
      : args.baseBill ??
        calcBill(args.goods, args.discountPct ?? 0, args.charges ?? [], args.taxOptions)
  const payable = roundMoney(Math.max(0, bill.total - loyaltySar + roundOff))
  return { bill, payable, voucherSar }
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

/** Format percent for labels: 15 → "15", 10.5 → "10.5" */
export function formatTaxPercent(p: number) {
  const n = Number(p) || 0
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}
