import {
  accountByCode,
  loadCoaMapping,
  resolveExpenseAccount,
  resolveTenderAccount,
  type CoaMapping,
  DEFAULT_COA,
} from '../data/chartOfAccounts'
import type { LedgerEntry } from '../data/ledger'
import type { ExpenseDetail } from '../data/paymentTypes'
import type { VendorLedgerEntry } from '../data/purchasing'
import { estimateCogs } from './reportStats'
import { toCsv } from './dataTransfer'

export type GlExportFormat = 'excel' | 'quickbooks' | 'zoho'

export type GlJournalLine = {
  date: string
  journalNo: string
  accountCode: string
  accountName: string
  debit: number
  credit: number
  description: string
  source: string
  branchId?: string
  taxCode: string
}

export type GlBuildInput = {
  from: string
  to: string
  ledger: LedgerEntry[]
  expenses: ExpenseDetail[]
  vendorLedger?: VendorLedgerEntry[]
  dishes?: { name: string; alias?: string | null; cost?: number }[]
  expenseTypeName?: (id: string) => string
  supplierName?: (id: string) => string
  mapping?: CoaMapping
  branchId?: string
  includeCogs?: boolean
  includeAp?: boolean
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function inRange(day: string, from: string, to: string) {
  return day >= from && day <= to
}

function line(
  partial: Omit<GlJournalLine, 'accountName' | 'taxCode'> & { taxCode?: string },
  mapping: CoaMapping,
): GlJournalLine {
  const acct = accountByCode(partial.accountCode)
  return {
    ...partial,
    accountName: acct.name,
    debit: round2(partial.debit),
    credit: round2(partial.credit),
    taxCode: partial.taxCode ?? (partial.accountCode === mapping.vatOutput ? 'VAT15' : ''),
  }
}

function pushBalanced(
  rows: GlJournalLine[],
  mapping: CoaMapping,
  parts: Array<Omit<GlJournalLine, 'accountName' | 'taxCode'> & { taxCode?: string }>,
) {
  for (const p of parts) {
    if (p.debit === 0 && p.credit === 0) continue
    rows.push(line(p, mapping))
  }
}

export function buildGlJournal(input: GlBuildInput): GlJournalLine[] {
  const mapping = input.mapping ?? loadCoaMapping()
  const expenseTypeName = input.expenseTypeName ?? ((id) => id)
  const supplierName = input.supplierName ?? ((id) => id)
  const includeCogs = input.includeCogs !== false
  const includeAp = input.includeAp !== false
  const rows: GlJournalLine[] = []

  const sales = input.ledger.filter(
    (e) =>
      inRange(e.day, input.from, input.to) &&
      e.source !== 'Day Close' &&
      (!input.branchId || !e.branchId || e.branchId === input.branchId),
  )

  for (const e of sales) {
    const jn = `JE-${e.day.replace(/-/g, '')}-${e.type}-${e.id.slice(-8)}`
    const desc = `${e.source} · ${e.method || e.type}`
    const tax = round2(e.tax || 0)

    if (e.type === 'sale') {
      const total = round2(e.total || 0)
      const discount = round2(e.discountAmt || 0)
      const netSales = round2(Math.max(0, (e.subtotal || total - tax) - discount))
      const splits =
        e.splitPayments && e.splitPayments.length
          ? e.splitPayments
          : [{ method: e.method || 'Cash', amount: total }]

      const tenderParts = splits.map((p) => ({
        date: e.day,
        journalNo: jn,
        accountCode: resolveTenderAccount(p.method, mapping),
        debit: round2(p.amount),
        credit: 0,
        description: desc,
        source: 'sale',
        branchId: e.branchId,
      }))

      const creditParts = [
        {
          date: e.day,
          journalNo: jn,
          accountCode: mapping.sales,
          debit: 0,
          credit: netSales,
          description: desc,
          source: 'sale',
          branchId: e.branchId,
        },
        {
          date: e.day,
          journalNo: jn,
          accountCode: mapping.vatOutput,
          debit: 0,
          credit: tax,
          description: desc,
          source: 'sale',
          branchId: e.branchId,
          taxCode: 'VAT15',
        },
      ]
      if (discount > 0) {
        creditParts.push({
          date: e.day,
          journalNo: jn,
          accountCode: mapping.discounts,
          debit: discount,
          credit: 0,
          description: `Discount · ${desc}`,
          source: 'sale',
          branchId: e.branchId,
        } as never)
      }
      // Balance residual into sales (rounding / charges)
      const dr = tenderParts.reduce((s, p) => s + p.debit, 0) + (discount > 0 ? discount : 0)
      const cr = netSales + tax
      const gap = round2(dr - cr)
      if (Math.abs(gap) >= 0.01) {
        if (gap > 0) {
          creditParts[0].credit = round2(creditParts[0].credit + gap)
        } else {
          tenderParts[0].debit = round2(tenderParts[0].debit - gap)
        }
      }
      pushBalanced(rows, mapping, [...tenderParts, ...creditParts])
    } else if (e.type === 'void') {
      const total = round2(Math.abs(e.total || 0))
      pushBalanced(rows, mapping, [
        {
          date: e.day,
          journalNo: jn,
          accountCode: mapping.voids,
          debit: total,
          credit: 0,
          description: e.voidReason || desc,
          source: 'void',
          branchId: e.branchId,
        },
        {
          date: e.day,
          journalNo: jn,
          accountCode: resolveTenderAccount(e.method || 'Cash', mapping),
          debit: 0,
          credit: total,
          description: e.voidReason || desc,
          source: 'void',
          branchId: e.branchId,
        },
      ])
    } else if (e.type === 'discount') {
      const total = round2(Math.abs(e.total || e.discountAmt || 0))
      pushBalanced(rows, mapping, [
        {
          date: e.day,
          journalNo: jn,
          accountCode: mapping.discounts,
          debit: total,
          credit: 0,
          description: desc,
          source: 'discount',
          branchId: e.branchId,
        },
        {
          date: e.day,
          journalNo: jn,
          accountCode: mapping.sales,
          debit: 0,
          credit: total,
          description: desc,
          source: 'discount',
          branchId: e.branchId,
        },
      ])
    } else if (e.type === 'charge') {
      const total = round2(e.total || 0)
      pushBalanced(rows, mapping, [
        {
          date: e.day,
          journalNo: jn,
          accountCode: resolveTenderAccount(e.method || 'Cash', mapping),
          debit: total,
          credit: 0,
          description: desc,
          source: 'charge',
          branchId: e.branchId,
        },
        {
          date: e.day,
          journalNo: jn,
          accountCode: mapping.sales,
          debit: 0,
          credit: total,
          description: desc,
          source: 'charge',
          branchId: e.branchId,
        },
      ])
    }
  }

  for (const x of input.expenses.filter((e) => inRange(e.date, input.from, input.to))) {
    const jn = `JE-${x.date.replace(/-/g, '')}-exp-${x.id.slice(-8)}`
    const amt = round2(x.amount || 0)
    const typeLabel = expenseTypeName(x.expenseTypeId)
    const desc = x.notes || x.description || typeLabel
    pushBalanced(rows, mapping, [
      {
        date: x.date,
        journalNo: jn,
        accountCode: resolveExpenseAccount(x.expenseTypeId, mapping),
        debit: amt,
        credit: 0,
        description: desc,
        source: 'expense',
      },
      {
        date: x.date,
        journalNo: jn,
        accountCode: resolveTenderAccount(x.paymentTypeId || 'Cash', mapping),
        debit: 0,
        credit: amt,
        description: desc,
        source: 'expense',
      },
    ])
  }

  if (includeAp && input.vendorLedger?.length) {
    for (const v of input.vendorLedger.filter((e) => inRange(e.date, input.from, input.to))) {
      const jn = `JE-${v.date.replace(/-/g, '')}-ap-${v.id.slice(-8)}`
      const name = supplierName(v.supplierId)
      const desc = v.description || `${v.kind} · ${name}`
      if (v.kind === 'invoice' || (v.debit > 0 && v.credit === 0 && v.kind !== 'cash' && v.kind !== 'card')) {
        const amt = round2(v.debit)
        if (amt <= 0) continue
        pushBalanced(rows, mapping, [
          {
            date: v.date,
            journalNo: jn,
            accountCode: mapping.inventory,
            debit: amt,
            credit: 0,
            description: desc,
            source: 'ap',
          },
          {
            date: v.date,
            journalNo: jn,
            accountCode: mapping.ap,
            debit: 0,
            credit: amt,
            description: desc,
            source: 'ap',
          },
        ])
      } else if (v.credit > 0 && (v.kind === 'cash' || v.kind === 'card' || v.kind === 'adjust')) {
        const amt = round2(v.credit)
        pushBalanced(rows, mapping, [
          {
            date: v.date,
            journalNo: jn,
            accountCode: mapping.ap,
            debit: amt,
            credit: 0,
            description: desc,
            source: 'ap',
          },
          {
            date: v.date,
            journalNo: jn,
            accountCode: resolveTenderAccount(v.kind === 'card' ? 'Card' : 'Cash', mapping),
            debit: 0,
            credit: amt,
            description: desc,
            source: 'ap',
          },
        ])
      }
    }
  }

  if (includeCogs && input.dishes?.length) {
    const saleOnly = sales.filter((e) => e.type === 'sale')
    const byDay = new Map<string, LedgerEntry[]>()
    for (const e of saleOnly) {
      const list = byDay.get(e.day) ?? []
      list.push(e)
      byDay.set(e.day, list)
    }
    for (const [day, daySales] of byDay) {
      const { cogs } = estimateCogs(daySales, input.dishes)
      if (cogs <= 0) continue
      const jn = `JE-${day.replace(/-/g, '')}-cogs`
      pushBalanced(rows, mapping, [
        {
          date: day,
          journalNo: jn,
          accountCode: mapping.cogs,
          debit: cogs,
          credit: 0,
          description: 'Estimated COGS from recipe/dish cost',
          source: 'cogs',
        },
        {
          date: day,
          journalNo: jn,
          accountCode: mapping.inventory,
          debit: 0,
          credit: cogs,
          description: 'Estimated COGS from recipe/dish cost',
          source: 'cogs',
        },
      ])
    }
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.journalNo.localeCompare(b.journalNo))
}

export function glJournalTotals(rows: GlJournalLine[]) {
  const debit = round2(rows.reduce((s, r) => s + r.debit, 0))
  const credit = round2(rows.reduce((s, r) => s + r.credit, 0))
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.02 }
}

export function glJournalCsv(rows: GlJournalLine[], format: GlExportFormat = 'excel') {
  if (format === 'quickbooks') {
    return toCsv(
      ['JournalNo', 'JournalDate', 'Account', 'Debits', 'Credits', 'Memo', 'Name'],
      rows.map((r) => [
        r.journalNo,
        r.date,
        r.accountCode,
        r.debit || '',
        r.credit || '',
        r.description,
        r.accountName,
      ]),
    )
  }
  if (format === 'zoho') {
    return toCsv(
      ['Date', 'Reference Number', 'Account', 'Debit', 'Credit', 'Description', 'Tax Name'],
      rows.map((r) => [
        r.date,
        r.journalNo,
        `${r.accountCode} ${r.accountName}`,
        r.debit || '',
        r.credit || '',
        r.description,
        r.taxCode || '',
      ]),
    )
  }
  return toCsv(
    [
      'Date',
      'Journal No',
      'Account Code',
      'Account Name',
      'Debit',
      'Credit',
      'Description',
      'Source',
      'Tax Code',
      'Branch',
    ],
    rows.map((r) => [
      r.date,
      r.journalNo,
      r.accountCode,
      r.accountName,
      r.debit || '',
      r.credit || '',
      r.description,
      r.source,
      r.taxCode,
      r.branchId ?? '',
    ]),
  )
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export { DEFAULT_COA }
