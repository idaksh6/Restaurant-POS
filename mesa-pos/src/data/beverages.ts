import { tenantGetItem, tenantSetItem } from './repos/db'
import type { MasterDish, MenuCategory } from './masters'

/** Shared drink serving sizes (Small / Regular / Large …). */
export type BeverageQty = {
  id: string
  branchId?: string
  code: string
  name: string
  /** Volume in ml (0 = not specified). */
  ml: number
  sort: number
  active: boolean
  isDefault?: boolean
}

/** Price for one product at one serving size. */
export type BeveragePrice = {
  id: string
  branchId?: string
  productId: string
  qtyId: string
  price: number
}

const QTY_KEY = 'mesa-beverage-qtys'
const PRICE_KEY = 'mesa-beverage-prices'

const BEV_NAME_RE =
  /drink|beverage|juice|coffee|tea|bar|latte|mocha|smoothie|shake|soda|water|mocktail|cocktail|مشروب|مشروبات|عصير|قهوة|شاي|ساخن|بارد/

export function loadBeverageQtys(): BeverageQty[] {
  try {
    const raw = tenantGetItem(QTY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as BeverageQty[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveBeverageQtys(rows: BeverageQty[]) {
  tenantSetItem(QTY_KEY, JSON.stringify(rows))
}

export function loadBeveragePrices(): BeveragePrice[] {
  try {
    const raw = tenantGetItem(PRICE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as BeveragePrice[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveBeveragePrices(rows: BeveragePrice[]) {
  tenantSetItem(PRICE_KEY, JSON.stringify(rows))
}

export function starterBeverageQtys(branchId?: string): BeverageQty[] {
  // Company-wide sizes (no branch) so every till shares the same Small/Regular/Large.
  void branchId
  return [
    { id: 'bev-qty-s', code: 'S', name: 'Small', ml: 250, sort: 1, active: true },
    {
      id: 'bev-qty-r',
      code: 'R',
      name: 'Regular',
      ml: 350,
      sort: 2,
      active: true,
      isDefault: true,
    },
    { id: 'bev-qty-l', code: 'L', name: 'Large', ml: 500, sort: 3, active: true },
  ]
}

export function fromApiBeverageQty(row: Record<string, unknown>): BeverageQty {
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    ml: Math.max(0, Number(row.ml ?? 0)),
    sort: Number(row.sort ?? 0),
    active: row.active !== false,
    isDefault: row.isDefault === true,
  }
}

export function fromApiBeveragePrice(row: Record<string, unknown>): BeveragePrice {
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    productId: String(row.productId ?? ''),
    qtyId: String(row.qtyId ?? ''),
    price: Math.round(Number(row.price ?? 0) * 100) / 100,
  }
}

export function beveragePriceId(productId: string, qtyId: string) {
  return `bp-${productId}-${qtyId}`
}

export function qtyLabel(q: BeverageQty) {
  const name = q.name.trim() || q.code || 'Size'
  if (q.ml > 0) return `${name} (${q.ml} ml)`
  return name
}

function categoryChain(
  categoryId: string,
  categories: MenuCategory[],
): MenuCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const chain: MenuCategory[] = []
  let cur = byId.get(categoryId)
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    chain.push(cur)
    seen.add(cur.id)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return chain
}

/** True when the dish sits under a beverage / drinks / bar department. */
export function isBeverageDish(dish: MasterDish, categories: MenuCategory[]) {
  const chain = categoryChain(dish.categoryId, categories)
  if (chain.some((c) => c.isBar === true)) return true
  const blob = [
    dish.name,
    dish.alias ?? '',
    dish.category,
    ...chain.map((c) => `${c.name} ${c.alias ?? ''}`),
  ]
    .join(' ')
    .toLowerCase()
  return BEV_NAME_RE.test(blob)
}

/** Active menu products for beverage masters (optional department filter). */
export function listBeverageTargets(
  dishes: MasterDish[],
  categories: MenuCategory[],
  opts?: { scope?: 'drinks' | 'all'; departmentId?: string; query?: string },
) {
  const scope = opts?.scope ?? 'drinks'
  const deptId = opts?.departmentId?.trim() || ''
  const q = (opts?.query ?? '').trim().toLowerCase()
  const byId = new Map(categories.map((c) => [c.id, c]))

  return dishes
    .filter((d) => d.active)
    .filter((d) => (scope === 'all' ? true : isBeverageDish(d, categories)))
    .filter((d) => {
      if (!deptId) return true
      const chain = categoryChain(d.categoryId, categories)
      return chain.some((c) => c.id === deptId) || d.categoryId === deptId
    })
    .filter(
      (d) =>
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.alias ?? '').toLowerCase().includes(q) ||
        (d.category || '').toLowerCase().includes(q) ||
        (byId.get(d.categoryId)?.name ?? '').toLowerCase().includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function activeBeverageQtys(rows: BeverageQty[] = loadBeverageQtys()) {
  return [...rows]
    .filter((q) => q.active)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
}

export function priceMapForProduct(
  prices: BeveragePrice[],
  productId: string,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of prices) {
    if (p.productId === productId) out[p.qtyId] = p.price
  }
  return out
}

/** Build / refresh dish customizer variations from qty + price masters. */
export function applyBeverageSizesToDish(
  dish: MasterDish,
  qtys: BeverageQty[],
  prices: BeveragePrice[],
): MasterDish {
  const active = activeBeverageQtys(qtys)
  if (!active.length) return dish
  const map = priceMapForProduct(prices, dish.id)
  const defaultQty = active.find((q) => q.isDefault) ?? active[0]
  const variations = active.map((q) => ({
    id: `v-${dish.id}-${q.id}`,
    name: qtyLabel(q),
    price: map[q.id] ?? (q.id === defaultQty.id ? dish.price : dish.price),
  }))
  const basePrice = map[defaultQty.id] ?? variations[0]?.price ?? dish.price
  const prev = dish.customizer
  return {
    ...dish,
    price: Math.round(basePrice * 100) / 100,
    customizer: {
      title: prev?.title?.trim() || 'Choose size',
      variationLabel: prev?.variationLabel?.trim() || 'Size',
      variations,
      addonGroups: prev?.addonGroups?.length
        ? prev.addonGroups
        : prev?.addons?.length
          ? [
              {
                id: `g-${dish.id}-addons`,
                name: 'Addons',
                appendVariationName: true,
                min: 0,
                max: 4,
                addons: prev.addons,
              },
            ]
          : [],
    },
  }
}
