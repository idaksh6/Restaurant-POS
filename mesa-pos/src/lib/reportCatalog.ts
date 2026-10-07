import type { I18nKey } from '../locale/i18n'

export type ReportId =
  | 'overview'
  | 'hourly'
  | 'voids'
  | 'foodCost'
  | 'payments'
  | 'channels'
  | 'items'
  | 'pnl'
  | 'stock'
  | 'stockLogs'
  | 'poLogs'

export type ReportCategoryId =
  | 'all'
  | 'favorites'
  | 'business'
  | 'sales'
  | 'inventory'
  | 'purchases'
  | 'payments'

export type ReportDef = {
  id: ReportId
  category: Exclude<ReportCategoryId, 'all' | 'favorites'>
  nameKey: I18nKey
  hintKey: I18nKey
}

export const REPORT_CATEGORY_ORDER: ReportCategoryId[] = [
  'all',
  'favorites',
  'business',
  'sales',
  'inventory',
  'purchases',
  'payments',
]

export const REPORT_CATEGORY_LABEL: Record<ReportCategoryId, I18nKey> = {
  all: 'rptCatAll',
  favorites: 'rptCatFavorites',
  business: 'rptCatBusiness',
  sales: 'rptCatSales',
  inventory: 'rptCatInventory',
  purchases: 'rptCatPurchases',
  payments: 'rptCatPayments',
}

export const REPORT_DEFS: ReportDef[] = [
  {
    id: 'pnl',
    category: 'business',
    nameKey: 'rptNamePnL',
    hintKey: 'rptHintPnL',
  },
  {
    id: 'overview',
    category: 'sales',
    nameKey: 'rptNameSalesSummary',
    hintKey: 'rptHintSalesSummary',
  },
  {
    id: 'hourly',
    category: 'sales',
    nameKey: 'rptNameHourlySales',
    hintKey: 'rptHintHourlySales',
  },
  {
    id: 'voids',
    category: 'sales',
    nameKey: 'rptNameVoidAudit',
    hintKey: 'rptHintVoidAudit',
  },
  {
    id: 'foodCost',
    category: 'business',
    nameKey: 'rptNameFoodCost',
    hintKey: 'rptHintFoodCost',
  },
  {
    id: 'channels',
    category: 'sales',
    nameKey: 'rptNameSalesByChannel',
    hintKey: 'rptHintSalesByChannel',
  },
  {
    id: 'items',
    category: 'sales',
    nameKey: 'rptNameSalesByItem',
    hintKey: 'rptHintSalesByItem',
  },
  {
    id: 'payments',
    category: 'payments',
    nameKey: 'rptNamePaymentsReceived',
    hintKey: 'rptHintPaymentsReceived',
  },
  {
    id: 'stock',
    category: 'inventory',
    nameKey: 'rptNameStockSummary',
    hintKey: 'rptHintStockSummary',
  },
  {
    id: 'stockLogs',
    category: 'inventory',
    nameKey: 'rptNameStockSummaryLog',
    hintKey: 'rptHintStockSummaryLog',
  },
  {
    id: 'poLogs',
    category: 'purchases',
    nameKey: 'rptNamePurchaseOrders',
    hintKey: 'rptHintPurchaseOrders',
  },
]

const FAV_KEY = 'mesa-report-favorites'
const VISIT_KEY = 'mesa-report-visits'

export function loadReportFavorites(): Set<ReportId> {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(arr.filter((id): id is ReportId => REPORT_DEFS.some((d) => d.id === id)))
  } catch {
    return new Set()
  }
}

export function saveReportFavorites(ids: Set<ReportId>) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...ids]))
}

export function loadReportVisits(): Record<string, string> {
  try {
    const raw = localStorage.getItem(VISIT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function markReportVisited(id: ReportId) {
  const next = { ...loadReportVisits(), [id]: new Date().toISOString() }
  localStorage.setItem(VISIT_KEY, JSON.stringify(next))
  return next
}
