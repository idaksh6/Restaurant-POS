import type { LedgerEntry } from '../data/ledger'
import type { ExpenseDetail } from '../data/paymentTypes'
import { loadCoaMapping } from '../data/chartOfAccounts'
import { buildGlJournal, glJournalCsv } from './glJournal'
import { toCsv } from './dataTransfer'

/** @deprecated Prefer buildGlJournal — kept for Back Office day button compatibility. */
export function buildDailyJournalRows(
  day: string,
  ledger: LedgerEntry[],
  expenses: ExpenseDetail[],
  expenseTypeName: (id: string) => string = (id) => id,
) {
  const gl = buildGlJournal({
    from: day,
    to: day,
    ledger,
    expenses,
    expenseTypeName,
    mapping: loadCoaMapping(),
    includeCogs: false,
    includeAp: false,
  })
  return gl.map((r) => ({
    day: r.date,
    at: r.date,
    type: r.source,
    source: r.description,
    method: '',
    subtotal: r.debit || r.credit,
    tax: r.taxCode ? r.credit || r.debit : 0,
    total: r.debit || r.credit,
    staff: '',
    voidReason: '',
    voidLine: '',
    account: `${r.accountCode} ${r.accountName}`,
    memo: r.journalNo,
    debit: r.debit,
    credit: r.credit,
  }))
}

export function dailyJournalCsv(
  day: string,
  ledger: LedgerEntry[],
  expenses: ExpenseDetail[],
  expenseTypeName?: (id: string) => string,
) {
  const rows = buildGlJournal({
    from: day,
    to: day,
    ledger,
    expenses,
    expenseTypeName,
    mapping: loadCoaMapping(),
    includeCogs: true,
    includeAp: false,
  })
  return glJournalCsv(rows, 'excel')
}

/** Legacy flat columns helper (tests / older callers). */
export function dailyJournalFlatCsv(
  day: string,
  ledger: LedgerEntry[],
  expenses: ExpenseDetail[],
  expenseTypeName?: (id: string) => string,
) {
  const rows = buildDailyJournalRows(day, ledger, expenses, expenseTypeName)
  return toCsv(
    [
      'day',
      'type',
      'account',
      'debit',
      'credit',
      'source',
      'memo',
    ],
    rows.map((r) => [r.day, r.type, r.account, r.debit, r.credit, r.source, r.memo]),
  )
}
