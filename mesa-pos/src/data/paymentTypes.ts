import { tenantGetItem, tenantSetItem } from './repos/db'

export type PaymentParent = 'cash' | 'card' | 'voucher' | 'online' | 'other'

export type PaymentType = {
  id: string
  name: string
  parent: PaymentParent
  active: boolean
  sort: number
}

export const paymentParents: { id: PaymentParent; label: string; labelKey: 'cash' | 'card' | 'voucher' | 'online' | 'other' }[] = [
  { id: 'cash', label: 'Cash', labelKey: 'cash' },
  { id: 'card', label: 'Card', labelKey: 'card' },
  { id: 'voucher', label: 'Voucher', labelKey: 'voucher' },
  { id: 'online', label: 'Online', labelKey: 'online' },
  { id: 'other', label: 'Other', labelKey: 'other' },
]

const KEY = 'mesa-payment-types'
const DEMO_PAY_IDS = new Set([
  'pay-cash',
  'pay-card',
  'pay-mada',
  'pay-visa',
  'pay-voucher',
  'pay-food-voucher',
  'pay-customer-card',
  'pay-points',
  'pay-comp',
  'pay-hungerstation',
  'pay-jahez',
  'pay-keeta',
])

export function isDemoPaymentType(id: string) {
  return DEMO_PAY_IDS.has(id)
}

/** Standard KSA tender types used when none are configured yet. */
export function defaultKsaPaymentTypes(): PaymentType[] {
  return [
    { id: 'ksa-pay-cash', name: 'Cash', parent: 'cash', active: true, sort: 1 },
    { id: 'ksa-pay-mada', name: 'mada', parent: 'card', active: true, sort: 2 },
    { id: 'ksa-pay-visa', name: 'Visa / Mastercard', parent: 'card', active: true, sort: 3 },
    { id: 'ksa-pay-apple', name: 'Apple Pay', parent: 'card', active: true, sort: 4 },
    { id: 'ksa-pay-stc', name: 'STC Pay', parent: 'online', active: true, sort: 5 },
    { id: 'ksa-pay-hungerstation', name: 'HungerStation', parent: 'online', active: true, sort: 6 },
    { id: 'ksa-pay-jahez', name: 'Jahez', parent: 'online', active: true, sort: 7 },
    { id: 'ksa-pay-keeta', name: 'Keeta', parent: 'online', active: true, sort: 8 },
    { id: 'ksa-pay-chefz', name: 'The Chefz', parent: 'online', active: true, sort: 9 },
    { id: 'ksa-pay-mrsool', name: 'Mrsool', parent: 'online', active: true, sort: 10 },
    { id: 'ksa-pay-talabat', name: 'Talabat', parent: 'online', active: true, sort: 11 },
    { id: 'ksa-pay-noon', name: 'Noon Food', parent: 'online', active: true, sort: 12 },
  ]
}

/** Return rows when configured; otherwise seed KSA defaults (empty catalog only). */
export function ensurePaymentTypes(rows: PaymentType[] = []): PaymentType[] {
  const usable = rows.filter((p) => p.active && p.name.trim())
  if (usable.length > 0) return rows
  if (rows.length > 0) return rows
  return defaultKsaPaymentTypes()
}

export function loadPaymentTypes(): PaymentType[] {
  try {
    const raw = tenantGetItem(KEY)
    if (!raw) {
      const seeded = defaultKsaPaymentTypes()
      savePaymentTypes(seeded)
      return seeded
    }
    const parsed = JSON.parse(raw) as PaymentType[]
    if (!Array.isArray(parsed)) {
      const seeded = defaultKsaPaymentTypes()
      savePaymentTypes(seeded)
      return seeded
    }
    const stored = parsed.filter((p) => !isDemoPaymentType(p.id))
    const ensured = ensurePaymentTypes(stored)
    if (stored.length === 0 && ensured.length > 0) savePaymentTypes(ensured)
    return ensured
  } catch {
    const seeded = defaultKsaPaymentTypes()
    savePaymentTypes(seeded)
    return seeded
  }
}

export function savePaymentTypes(rows: PaymentType[]) {
  tenantSetItem(KEY, JSON.stringify(rows.filter((p) => !isDemoPaymentType(p.id))))
}

export function fromApiPaymentType(row: Record<string, unknown>): PaymentType {
  const parent = String(row.parent ?? 'other') as PaymentParent
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    parent: ['cash', 'card', 'voucher', 'online', 'other'].includes(parent) ? parent : 'other',
    active: row.active !== false,
    sort: Number(row.sort ?? 0),
  }
}

export type ExpenseType = {
  id: string
  name: string
  description?: string
  active: boolean
  sort: number
}

export type ExpenseDetail = {
  id: string
  branchId?: string
  expenseTypeId: string
  description: string
  invoiceNo?: string
  amount: number
  date: string
  paymentTypeId?: string
  notes?: string
}

const EXP_TYPE_KEY = 'mesa-expense-types'
const EXP_DETAIL_KEY = 'mesa-expense-details'
const DEMO_EXP_TYPE_IDS = new Set([
  'et-rent',
  'et-utilities',
  'et-supplies',
  'et-payroll',
  'et-vehicle',
  'et-misc',
])
const DEMO_EXP_DETAIL_IDS = new Set(['ed-1'])

export function isDemoExpenseType(id: string) {
  return DEMO_EXP_TYPE_IDS.has(id)
}

export function isDemoExpenseDetail(id: string) {
  return DEMO_EXP_DETAIL_IDS.has(id)
}

export function loadExpenseTypes(): ExpenseType[] {
  try {
    const raw = tenantGetItem(EXP_TYPE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ExpenseType[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e) => !isDemoExpenseType(e.id))
  } catch {
    return []
  }
}

export function saveExpenseTypes(rows: ExpenseType[]) {
  tenantSetItem(EXP_TYPE_KEY, JSON.stringify(rows.filter((e) => !isDemoExpenseType(e.id))))
}

export function loadExpenseDetails(): ExpenseDetail[] {
  try {
    const raw = tenantGetItem(EXP_DETAIL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ExpenseDetail[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e) => !isDemoExpenseDetail(e.id) && !isDemoExpenseType(e.expenseTypeId))
  } catch {
    return []
  }
}

export function saveExpenseDetails(rows: ExpenseDetail[]) {
  tenantSetItem(
    EXP_DETAIL_KEY,
    JSON.stringify(
      rows
        .filter((e) => !isDemoExpenseDetail(e.id) && !isDemoExpenseType(e.expenseTypeId))
        .slice(0, 500),
    ),
  )
}

export function fromApiExpenseType(row: Record<string, unknown>): ExpenseType {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: row.description ? String(row.description) : undefined,
    active: row.active !== false,
    sort: Number(row.sort ?? 0),
  }
}

export function fromApiExpenseDetail(row: Record<string, unknown>): ExpenseDetail {
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    expenseTypeId: String(row.expenseTypeId ?? ''),
    description: String(row.description ?? ''),
    invoiceNo: row.invoiceNo ? String(row.invoiceNo) : undefined,
    amount: Number(row.amount ?? 0),
    date: String(row.date ?? ''),
    paymentTypeId: row.paymentTypeId ? String(row.paymentTypeId) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
  }
}
