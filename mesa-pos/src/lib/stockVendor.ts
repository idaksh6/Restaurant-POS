import type { Ingredient } from '../data/ingredients'
import type { StockItem } from '../data/mock'
import type { PurchaseOrder, Supplier } from '../data/purchasing'
import type { StockReceipt } from '../data/stockReceiving'

/** Legacy category → demo vendor labels (templates only; not auto-applied). */
export const STOCK_VENDOR_BY_CATEGORY: Record<string, string> = {
  Meat: 'Al Nakheel Meats',
  Seafood: 'Red Sea Catch',
  Dairy: 'Najd Dairy Co',
  Produce: 'Farm Fresh KSA',
  Beverage: 'Gulf Beverages',
  'Dry Goods': 'Riyadh Dry Store',
}

const CATEGORY_VENDOR_ID: Record<string, string> = {
  Meat: 'vnd-meat',
  Seafood: 'vnd-seafood',
  Dairy: 'vnd-dairy',
  Produce: 'vnd-produce',
  Beverage: 'vnd-bev',
  'Dry Goods': 'vnd-dry',
}

export function defaultVendorForCategory(category: string) {
  return STOCK_VENDOR_BY_CATEGORY[category] ?? ''
}

export function defaultVendorIdForCategory(category: string) {
  return CATEGORY_VENDOR_ID[category] ?? ''
}

/** Resolve preferred vendor from receipts → POs → supplier roster. */
export function vendorHintsFromPurchasing(
  suppliers: Supplier[],
  purchaseOrders: PurchaseOrder[],
  receipts: StockReceipt[],
) {
  const nameById = new Map(suppliers.map((s) => [s.id, s.name]))
  const idByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]))
  const byStock = new Map<string, { vendorId?: string; vendor: string }>()

  const sortedReceipts = [...receipts].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  )
  for (const receipt of sortedReceipts) {
    const name = nameById.get(receipt.supplierId)
    if (!name) continue
    for (const line of receipt.lines) {
      if (!byStock.has(line.stockId)) {
        byStock.set(line.stockId, { vendorId: receipt.supplierId, vendor: name })
      }
    }
  }

  const sortedPos = [...purchaseOrders].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  )
  for (const po of sortedPos) {
    const name = nameById.get(po.supplierId)
    if (!name) continue
    for (const line of po.lines) {
      if (!byStock.has(line.stockId)) {
        byStock.set(line.stockId, { vendorId: po.supplierId, vendor: name })
      }
    }
  }

  return { nameById, idByName, byStock }
}

/** Fill missing vendor fields from receipts / POs / ingredient master — never invent seed vendors. */
export function enrichStockVendors(
  items: StockItem[],
  suppliers: Supplier[] = [],
  purchaseOrders: PurchaseOrder[] = [],
  receipts: StockReceipt[] = [],
  ingredients: Ingredient[] = [],
): StockItem[] {
  const roster = suppliers
  const { nameById, idByName, byStock } = vendorHintsFromPurchasing(
    roster,
    purchaseOrders,
    receipts,
  )
  const ingById = new Map(ingredients.map((ing) => [ing.id, ing]))
  let changed = false

  const next = items.map((item) => {
    const preferred = ingById.get(item.ingredientId || item.id)
    let vendorId = preferred?.vendorId?.trim() || item.vendorId?.trim() || undefined
    let vendor = preferred?.vendor?.trim() || item.vendor?.trim() || undefined

    if (vendorId && !vendor) vendor = nameById.get(vendorId)
    if (vendor && !vendorId) vendorId = idByName.get(vendor.toLowerCase())

    if (!vendorId && !vendor) {
      const hint = byStock.get(item.id)
      if (hint) {
        vendorId = hint.vendorId ?? vendorId
        vendor = hint.vendor
      }
    }

    if (vendor === item.vendor && vendorId === item.vendorId) return item
    changed = true
    return { ...item, vendorId, vendor }
  })

  return changed ? next : items
}
