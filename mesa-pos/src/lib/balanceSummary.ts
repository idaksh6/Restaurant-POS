import type { CoaMapping } from '../data/chartOfAccounts'
import { giftBalance, loadGiftCards } from '../data/giftCards'
import type { LedgerEntry } from '../data/ledger'
import type { StockItem } from '../data/mock'
import type { ExpenseDetail } from '../data/paymentTypes'
import type { VendorLedgerEntry } from '../data/purchasing'
import { estimateCogs } from './reportStats'
import { cashFromLedger, tenderTotals } from '../data/ledger'

export type BalanceSummary = {
  asOf: string
  from: string
  to: string
  salesTotal: number
  vatCollected: number
  cashTender: number
  cardTender: number
  expensesPaid: number
  estimatedCogs: number
  apOutstanding: number
  inventoryValue: number
  giftLiability: number
  netCashPosition: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function buildBalanceSummary(input: {
  from: string
  to: string
  asOf?: string
  ledger: LedgerEntry[]
  expenses: ExpenseDetail[]
  vendorLedger: VendorLedgerEntry[]
  stock: StockItem[]
  dishes: { name: string; alias?: string | null; cost?: number }[]
  mapping?: CoaMapping
}): BalanceSummary {
  const asOf = input.asOf || input.to
  const periodLedger = input.ledger.filter(
    (e) => e.day >= input.from && e.day <= input.to && e.source !== 'Day Close',
  )
  const sales = periodLedger.filter((e) => e.type === 'sale')
  const salesTotal = round2(sales.reduce((s, e) => s + (e.total || 0), 0))
  const vatCollected = round2(sales.reduce((s, e) => s + (e.tax || 0), 0))
  const tenders = tenderTotals(sales)
  let cashTender = 0
  let cardTender = 0
  for (const [method, amt] of Object.entries(tenders)) {
    if (/cash|نقد/i.test(method)) cashTender += amt
    else if (/card|mada|visa|master|بطاقة|مدى/i.test(method)) cardTender += amt
  }
  cashTender = round2(cashTender || cashFromLedger(sales))
  cardTender = round2(cardTender)

  const expensesPaid = round2(
    input.expenses
      .filter((e) => e.date >= input.from && e.date <= input.to)
      .reduce((s, e) => s + (e.amount || 0), 0),
  )

  const { cogs } = estimateCogs(sales, input.dishes)

  const apOutstanding = round2(
    input.vendorLedger.reduce((s, e) => s + (e.debit || 0) - (e.credit || 0), 0),
  )

  const inventoryValue = round2(
    input.stock.reduce((s, i) => s + (Number(i.onHand) || 0) * (Number(i.cost) || 0), 0),
  )

  const giftLiability = round2(
    loadGiftCards().reduce((s, g) => s + giftBalance(g), 0),
  )

  return {
    asOf,
    from: input.from,
    to: input.to,
    salesTotal,
    vatCollected,
    cashTender,
    cardTender,
    expensesPaid,
    estimatedCogs: cogs,
    apOutstanding: Math.max(0, apOutstanding),
    inventoryValue,
    giftLiability,
    netCashPosition: round2(cashTender + cardTender - expensesPaid),
  }
}

export type ApBillRow = {
  id: string
  date: string
  supplierId: string
  description: string
  amount: number
  paid: number
  balance: number
}

/** Unpaid AP from vendor ledger invoices vs payments (FIFO-lite per supplier). */
export function buildApBills(
  vendorLedger: VendorLedgerEntry[],
  supplierName: (id: string) => string = (id) => id,
): ApBillRow[] {
  const bySupplier = new Map<string, VendorLedgerEntry[]>()
  for (const e of vendorLedger) {
    const list = bySupplier.get(e.supplierId) ?? []
    list.push(e)
    bySupplier.set(e.supplierId, list)
  }
  const bills: ApBillRow[] = []
  for (const [supplierId, entries] of bySupplier) {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
    let credits = sorted.reduce((s, e) => s + (e.credit || 0), 0)
    for (const e of sorted) {
      if (e.debit <= 0) continue
      if (e.kind !== 'invoice' && e.kind !== 'opening' && e.kind !== 'adjust') continue
      const take = Math.min(e.debit, credits)
      credits -= take
      const balance = round2(e.debit - take)
      bills.push({
        id: e.id,
        date: e.date,
        supplierId,
        description: e.description || `${e.kind} · ${supplierName(supplierId)}`,
        amount: round2(e.debit),
        paid: round2(take),
        balance,
      })
    }
  }
  return bills.sort((a, b) => a.date.localeCompare(b.date))
}
