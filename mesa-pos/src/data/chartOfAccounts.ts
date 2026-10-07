import { getActiveBranchId } from './company'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type CoaAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'cogs' | 'expense'

export type CoaAccount = {
  code: string
  name: string
  nameAr: string
  type: CoaAccountType
}

/** Default KSA restaurant chart — codes are overridable in mapping. */
export const DEFAULT_COA: CoaAccount[] = [
  { code: '1000', name: 'Cash on hand', nameAr: 'نقدية بالصندوق', type: 'asset' },
  { code: '1010', name: 'Bank / Card clearing', nameAr: 'بنك / بطاقات', type: 'asset' },
  { code: '1020', name: 'Delivery clearing', nameAr: 'مقاصة التوصيل', type: 'asset' },
  { code: '1200', name: 'Inventory', nameAr: 'المخزون', type: 'asset' },
  { code: '2000', name: 'Accounts payable', nameAr: 'ذمم دائنة', type: 'liability' },
  { code: '2100', name: 'VAT output (15%)', nameAr: 'ضريبة القيمة المضافة', type: 'liability' },
  { code: '2200', name: 'Gift card liability', nameAr: 'التزام بطاقات الهدايا', type: 'liability' },
  { code: '4000', name: 'Food & beverage sales', nameAr: 'مبيعات أغذية ومشروبات', type: 'income' },
  { code: '4100', name: 'Sales discounts', nameAr: 'خصومات المبيعات', type: 'income' },
  { code: '4200', name: 'Voids / comps', nameAr: 'إلغاءات', type: 'income' },
  { code: '5000', name: 'Cost of goods sold', nameAr: 'تكلفة البضاعة المباعة', type: 'cogs' },
  { code: '6000', name: 'Operating expenses', nameAr: 'مصروفات تشغيل', type: 'expense' },
  { code: '6100', name: 'Rent', nameAr: 'إيجار', type: 'expense' },
  { code: '6200', name: 'Utilities', nameAr: 'مرافق', type: 'expense' },
  { code: '6300', name: 'Salaries', nameAr: 'رواتب', type: 'expense' },
  { code: '6400', name: 'Marketing', nameAr: 'تسويق', type: 'expense' },
]

export type CoaMapping = {
  sales: string
  vatOutput: string
  discounts: string
  voids: string
  cogs: string
  inventory: string
  ap: string
  cash: string
  card: string
  delivery: string
  giftLiability: string
  defaultExpense: string
  /** expenseTypeId → account code */
  expenseByType: Record<string, string>
  /** paymentTypeId or tender keyword → account code */
  tenderByMethod: Record<string, string>
}

const MAPPING_KEY = 'mesa-coa-mapping'

export function defaultCoaMapping(): CoaMapping {
  return {
    sales: '4000',
    vatOutput: '2100',
    discounts: '4100',
    voids: '4200',
    cogs: '5000',
    inventory: '1200',
    ap: '2000',
    cash: '1000',
    card: '1010',
    delivery: '1020',
    giftLiability: '2200',
    defaultExpense: '6000',
    expenseByType: {},
    tenderByMethod: {},
  }
}

export function loadCoaMapping(_branchId = getActiveBranchId()): CoaMapping {
  try {
    const raw = tenantGetItem(MAPPING_KEY)
    if (!raw) return defaultCoaMapping()
    const parsed = JSON.parse(raw) as Partial<CoaMapping>
    return { ...defaultCoaMapping(), ...parsed, expenseByType: parsed.expenseByType ?? {}, tenderByMethod: parsed.tenderByMethod ?? {} }
  } catch {
    return defaultCoaMapping()
  }
}

export function saveCoaMapping(mapping: CoaMapping) {
  tenantSetItem(MAPPING_KEY, JSON.stringify(mapping))
}

export function accountByCode(code: string, accounts: CoaAccount[] = DEFAULT_COA): CoaAccount {
  return (
    accounts.find((a) => a.code === code) ?? {
      code,
      name: code,
      nameAr: code,
      type: 'expense',
    }
  )
}

/** Resolve tender/payment method string to a COA asset/liability code. */
export function resolveTenderAccount(method: string, mapping: CoaMapping): string {
  const key = method.trim().toLowerCase()
  if (!key) return mapping.cash
  const byId = mapping.tenderByMethod[key] || mapping.tenderByMethod[method]
  if (byId) return byId
  if (/gift|voucher|قسيمة|هدية/.test(key)) return mapping.giftLiability
  if (/deliver|hunger|jahez|keeta|talabat|توصيل/.test(key)) return mapping.delivery
  if (/card|mada|visa|master|pos|بطاقة|مدى/.test(key)) return mapping.card
  if (/cash|نقد/.test(key)) return mapping.cash
  if (/split/.test(key)) return mapping.cash
  return mapping.cash
}

export function resolveExpenseAccount(expenseTypeId: string, mapping: CoaMapping): string {
  return mapping.expenseByType[expenseTypeId] || mapping.defaultExpense
}
