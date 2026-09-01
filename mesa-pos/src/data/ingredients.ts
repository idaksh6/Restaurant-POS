import { tenantGetItem, tenantSetItem } from './repos/db'
import type { StockItem } from './mock'

/** Contracted / last-known price from a specific supplier for this ingredient. */
export type IngredientVendorLink = {
  vendorId: string
  vendor?: string
  unitPrice?: number
  /** Exactly one link should be primary (default on POs). */
  primary?: boolean
}

/** Recipe / kitchen catalog — no on-hand qty (that lives on Stock). */
export type Ingredient = {
  id: string
  name: string
  sku: string
  category: string
  unit: string
  active: boolean
  /** Default supplier for POs and receiving — edited on this master only. */
  vendorId?: string
  /** Denormalized vendor name for display / offline. */
  vendor?: string
  /** Primary + alternate suppliers with optional contracted unit prices. */
  vendorLinks?: IngredientVendorLink[]
  /** Par level — alert when branch on-hand falls to this qty or below. */
  reorderAt?: number
  /** Home storage area — receiving / new stock lands here by default. */
  defaultLocationId?: string
}

const KEY = 'mesa-ingredients'
const CUSTOM_CATEGORIES_KEY = 'mesa-ingredient-categories'
export const INGREDIENT_CATEGORIES_CHANGED = 'mesa:ingredient-categories-changed'

export const BUILTIN_INGREDIENT_CATEGORIES = [
  'Produce',
  'Dairy',
  'Dry Goods',
  'Beverage',
  'Meat',
  'Seafood',
  'Spice',
  'General',
] as const

const CATEGORY_ALIASES: Record<string, string> = {
  protein: 'Meat',
  proteins: 'Meat',
  'dry goods': 'Dry Goods',
  drygoods: 'Dry Goods',
  drinks: 'Beverage',
  beverages: 'Beverage',
  veg: 'Produce',
  vegetables: 'Produce',
}

export function loadCustomIngredientCategories(): string[] {
  try {
    const raw = tenantGetItem(CUSTOM_CATEGORIES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((c) => String(c ?? '').trim())
      .filter(Boolean)
      .filter(
        (c, i, arr) =>
          arr.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i &&
          !BUILTIN_INGREDIENT_CATEGORIES.some((b) => b.toLowerCase() === c.toLowerCase()),
      )
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

export function saveCustomIngredientCategories(rows: string[]) {
  const cleaned = rows
    .map((c) => c.trim())
    .filter(Boolean)
    .filter(
      (c, i, arr) =>
        arr.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i &&
        !BUILTIN_INGREDIENT_CATEGORIES.some((b) => b.toLowerCase() === c.toLowerCase()),
    )
    .sort((a, b) => a.localeCompare(b))
  tenantSetItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(cleaned))
  window.dispatchEvent(new Event(INGREDIENT_CATEGORIES_CHANGED))
  return cleaned
}

/** Built-in + custom + categories already used on ingredients. */
export function listIngredientCategories(usedFromIngredients: string[] = []): string[] {
  const custom = loadCustomIngredientCategories()
  const used = usedFromIngredients.map((c) => canonicalizeIngredientCategory(c)).filter(Boolean)
  const all = [...BUILTIN_INGREDIENT_CATEGORIES, ...custom, ...used]
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of all) {
    const key = c.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  const preferred = BUILTIN_INGREDIENT_CATEGORIES as unknown as string[]
  return out.sort((a, b) => {
    const ai = preferred.findIndex((p) => p.toLowerCase() === a.toLowerCase())
    const bi = preferred.findIndex((p) => p.toLowerCase() === b.toLowerCase())
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return a.localeCompare(b)
  })
}

export function findIngredientCategory(name: string): string | undefined {
  const key = name.trim().toLowerCase()
  if (!key) return undefined
  return listIngredientCategories(loadIngredients().map((r) => r.category)).find(
    (c) => c.toLowerCase() === key,
  )
}

/** Quick-add a category. Fails when the name already exists (case-insensitive). */
export function addIngredientCategory(
  name: string,
): { ok: true; name: string } | { ok: false; error: string; existing?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Category name is required' }
  const existing = findIngredientCategory(trimmed)
  if (existing) {
    return { ok: false, error: `Category “${existing}” already exists`, existing }
  }
  const custom = loadCustomIngredientCategories()
  saveCustomIngredientCategories([...custom, trimmed])
  return { ok: true, name: trimmed }
}

export function canonicalizeIngredientCategory(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return 'General'
  const builtins = BUILTIN_INGREDIENT_CATEGORIES as unknown as string[]
  const hit = builtins.find((c) => c.toLowerCase() === trimmed.toLowerCase())
  if (hit) return hit
  const aliased = CATEGORY_ALIASES[trimmed.toLowerCase()]
  if (aliased) return aliased
  const custom = loadCustomIngredientCategories().find(
    (c) => c.toLowerCase() === trimmed.toLowerCase(),
  )
  if (custom) return custom
  return trimmed
}

export function loadIngredients(): Ingredient[] {
  try {
    const raw = tenantGetItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Ingredient[]
    return Array.isArray(parsed) ? parsed.filter((r) => r?.id && r.name?.trim()) : []
  } catch {
    return []
  }
}

export function saveIngredients(rows: Ingredient[]) {
  tenantSetItem(KEY, JSON.stringify(rows))
  window.dispatchEvent(new Event('mesa:ingredients-changed'))
}

/** Merge legacy vendorId + vendorLinks into one canonical list; sync primary fields. */
export function normalizeIngredient(row: Ingredient): Ingredient {
  const links: IngredientVendorLink[] = []
  const raw = Array.isArray(row.vendorLinks) ? row.vendorLinks : []

  for (const link of raw) {
    const vendorId = link.vendorId?.trim()
    if (!vendorId || links.some((l) => l.vendorId === vendorId)) continue
    links.push({
      vendorId,
      vendor: link.vendor?.trim() || undefined,
      unitPrice:
        typeof link.unitPrice === 'number' && Number.isFinite(link.unitPrice) && link.unitPrice >= 0
          ? Math.round(link.unitPrice * 100) / 100
          : undefined,
      primary: !!link.primary,
    })
  }

  const legacyPrimary = row.vendorId?.trim()
  if (legacyPrimary && !links.some((l) => l.vendorId === legacyPrimary)) {
    links.unshift({
      vendorId: legacyPrimary,
      vendor: row.vendor?.trim() || undefined,
      primary: true,
    })
  }

  if (links.length && !links.some((l) => l.primary)) links[0].primary = true

  let hasPrimary = false
  for (const link of links) {
    if (link.primary && !hasPrimary) hasPrimary = true
    else link.primary = false
  }
  if (links.length && !hasPrimary) links[0].primary = true

  const primary = links.find((l) => l.primary) ?? links[0]
  const reorderAt =
    typeof row.reorderAt === 'number' && Number.isFinite(row.reorderAt) && row.reorderAt >= 0
      ? Math.round(row.reorderAt * 100) / 100
      : 0
  const defaultLocationId = row.defaultLocationId?.trim() || undefined
  return {
    ...row,
    category: canonicalizeIngredientCategory(row.category),
    vendorLinks: links.length ? links : undefined,
    vendorId: primary?.vendorId,
    vendor: primary?.vendor,
    reorderAt,
    defaultLocationId,
  }
}

export function normalizeIngredients(rows: Ingredient[]): Ingredient[] {
  return rows.map(normalizeIngredient)
}

export function fromApiIngredient(row: Record<string, unknown>): Ingredient {
  let vendorLinks: IngredientVendorLink[] | undefined
  const rawLinks = row.vendorLinks
  if (Array.isArray(rawLinks)) {
    vendorLinks = rawLinks as IngredientVendorLink[]
  } else if (typeof rawLinks === 'string' && rawLinks.trim()) {
    try {
      const parsed = JSON.parse(rawLinks) as unknown
      if (Array.isArray(parsed)) vendorLinks = parsed as IngredientVendorLink[]
    } catch {
      /* ignore */
    }
  }
  return normalizeIngredient({
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    sku: String(row.sku ?? ''),
    category: String(row.category ?? 'General'),
    unit: String(row.unit ?? 'pcs'),
    active: row.active !== false,
    vendorId: row.vendorId ? String(row.vendorId) : undefined,
    vendor: row.vendor ? String(row.vendor) : undefined,
    vendorLinks,
    reorderAt: Number(row.reorderAt ?? 0),
    defaultLocationId: row.defaultLocationId ? String(row.defaultLocationId) : undefined,
  })
}

/** Keep local catalog rows; overlay server updates by id (multi-device safe). */
export function mergeRemoteIngredients(local: Ingredient[], remote: Ingredient[]): Ingredient[] {
  const byId = new Map<string, Ingredient>()
  for (const row of local) {
    if (row?.id) byId.set(row.id, normalizeIngredient(row))
  }
  for (const row of remote) {
    if (!row?.id) continue
    const prev = byId.get(row.id)
    const next = normalizeIngredient(row)
    if (prev) {
      byId.set(row.id, {
        ...prev,
        ...next,
        vendorLinks: next.vendorLinks?.length ? next.vendorLinks : prev.vendorLinks,
        reorderAt: (next.reorderAt ?? 0) > 0 ? next.reorderAt : prev.reorderAt ?? next.reorderAt,
        defaultLocationId: next.defaultLocationId || prev.defaultLocationId,
      })
    } else {
      byId.set(row.id, next)
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Add ingredient rows for stock SKUs that are not in the catalog yet. */
export function ensureMissingIngredientsFromStock(
  ingredients: Ingredient[],
  stock: StockItem[],
): Ingredient[] {
  const knownIds = new Set(ingredients.map((r) => r.id))
  const knownNames = new Set(ingredients.map((r) => r.name.trim().toLowerCase()).filter(Boolean))
  const knownSkus = new Set(ingredients.map((r) => r.sku.trim().toLowerCase()).filter(Boolean))
  const added: Ingredient[] = []
  for (const row of stock) {
    const id = row.ingredientId || row.id
    if (knownIds.has(id)) continue
    const nameKey = row.name.trim().toLowerCase()
    const skuKey = (row.sku || '').trim().toLowerCase()
    // Don't spawn a second card when stock already matches an ingredient by name/SKU.
    if (nameKey && knownNames.has(nameKey)) {
      knownIds.add(id)
      continue
    }
    if (skuKey && knownSkus.has(skuKey)) {
      knownIds.add(id)
      continue
    }
    knownIds.add(id)
    if (nameKey) knownNames.add(nameKey)
    if (skuKey) knownSkus.add(skuKey)
    added.push(ingredientFromStock(row))
  }
  if (!added.length) return ingredients
  return [...ingredients, ...added].sort((a, b) => a.name.localeCompare(b.name))
}

function mergeVendorLinks(
  a: IngredientVendorLink[] | undefined,
  b: IngredientVendorLink[] | undefined,
): IngredientVendorLink[] | undefined {
  const links: IngredientVendorLink[] = []
  for (const link of [...(a ?? []), ...(b ?? [])]) {
    const vendorId = link.vendorId?.trim()
    if (!vendorId) continue
    const existing = links.find((l) => l.vendorId === vendorId)
    if (existing) {
      if (existing.unitPrice == null && link.unitPrice != null) existing.unitPrice = link.unitPrice
      if (!existing.vendor?.trim() && link.vendor?.trim()) existing.vendor = link.vendor.trim()
      if (link.primary) existing.primary = true
      continue
    }
    links.push({
      vendorId,
      vendor: link.vendor?.trim() || undefined,
      unitPrice: link.unitPrice,
      primary: !!link.primary,
    })
  }
  if (!links.length) return undefined
  if (!links.some((l) => l.primary)) links[0].primary = true
  let saw = false
  for (const link of links) {
    if (link.primary && !saw) saw = true
    else link.primary = false
  }
  return links
}

function preferIngredientWinner(a: Ingredient, b: Ingredient): Ingredient {
  const score = (row: Ingredient) => {
    let s = 0
    if (row.id.startsWith('ing-')) s += 100
    if (!row.id.startsWith('stk-') && !row.id.startsWith('s')) s += 20
    s += (row.vendorLinks?.length ?? 0) * 5
    if (row.vendorId) s += 2
    if ((row.reorderAt ?? 0) > 0) s += 1
    return s
  }
  return score(a) >= score(b) ? a : b
}

/**
 * Collapse duplicate catalog cards (same name) into one ingredient.
 * Merges vendor lists so multi-vendor shows on a single card.
 * Returns remapped stock ingredient ids (oldId → keptId).
 */
export function dedupeIngredientsByName(rows: Ingredient[]): {
  ingredients: Ingredient[]
  idMap: Map<string, string>
} {
  const groups = new Map<string, Ingredient[]>()
  for (const row of rows) {
    const key = row.name.trim().toLowerCase()
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const idMap = new Map<string, string>()
  const merged: Ingredient[] = []

  for (const group of groups.values()) {
    if (group.length === 1) {
      const only = normalizeIngredient(group[0])
      merged.push(only)
      idMap.set(only.id, only.id)
      continue
    }
    let winner = group[0]
    for (let i = 1; i < group.length; i++) winner = preferIngredientWinner(winner, group[i])
    let links = winner.vendorLinks
    let reorderAt = winner.reorderAt ?? 0
    let sku = winner.sku
    let category = winner.category
    let unit = winner.unit
    let active = winner.active
    for (const row of group) {
      if (row.id === winner.id) continue
      links = mergeVendorLinks(links, normalizeIngredient(row).vendorLinks)
      if (!links?.length && row.vendorId) {
        links = mergeVendorLinks(links, [
          { vendorId: row.vendorId, vendor: row.vendor, primary: true },
        ])
      }
      if ((row.reorderAt ?? 0) > reorderAt) reorderAt = row.reorderAt ?? 0
      if ((!sku || sku === winner.id) && row.sku?.trim()) sku = row.sku
      if (category === 'General' && row.category && row.category !== 'General') category = row.category
      if (unit === 'pcs' && row.unit && row.unit !== 'pcs') unit = row.unit
      if (row.active === false) active = false
      idMap.set(row.id, winner.id)
    }
    idMap.set(winner.id, winner.id)
    merged.push(
      normalizeIngredient({
        ...winner,
        sku,
        category,
        unit,
        active,
        vendorLinks: links,
        reorderAt,
      }),
    )
  }

  return {
    ingredients: merged.sort((a, b) => a.name.localeCompare(b.name)),
    idMap,
  }
}

/** Remap stock.ingredientId after ingredient dedupe. */
export function remapStockIngredientIds(
  stock: StockItem[],
  idMap: Map<string, string>,
): StockItem[] {
  let changed = false
  const next = stock.map((row) => {
    const cur = row.ingredientId || row.id
    const mapped = idMap.get(cur)
    if (!mapped || mapped === row.ingredientId) return row
    changed = true
    return { ...row, ingredientId: mapped }
  })
  return changed ? next : stock
}

export function ingredientVendorUnitPrice(ing: Ingredient, vendorId: string): number | undefined {
  const link = normalizeIngredient(ing).vendorLinks?.find((l) => l.vendorId === vendorId)
  return link?.unitPrice
}

/** True when ingredient has no vendor list yet, or vendor is in approved list. */
export function ingredientSuppliesVendor(ing: Ingredient, vendorId: string): boolean {
  const links = normalizeIngredient(ing).vendorLinks
  if (!links?.length) return true
  return links.some((l) => l.vendorId === vendorId)
}

/**
 * Strict catalog check for PO lines: only ingredients explicitly linked to the
 * vendor (or legacy primary vendorId). Unlinked items stay out unless the user
 * opts into “show all stock”.
 */
export function ingredientInVendorCatalog(
  ing: Ingredient,
  vendorId: string,
  vendorName?: string,
): boolean {
  const norm = normalizeIngredient(ing)
  if (norm.vendorLinks?.length) {
    if (norm.vendorLinks.some((l) => l.vendorId === vendorId)) return true
    const name = vendorName?.trim().toLowerCase()
    if (name && norm.vendorLinks.some((l) => l.vendor?.trim().toLowerCase() === name)) {
      return true
    }
  }
  if (norm.vendorId === vendorId) return true
  const name = vendorName?.trim().toLowerCase()
  if (name && norm.vendor?.trim().toLowerCase() === name) return true
  return false
}

export function alternateVendorCount(ing: Ingredient): number {
  const n = normalizeIngredient(ing).vendorLinks?.length ?? 0
  return Math.max(0, n - 1)
}

export function primaryVendorUnitPrice(ing: Ingredient): number | undefined {
  const norm = normalizeIngredient(ing)
  const primary = norm.vendorLinks?.find((l) => l.primary) ?? norm.vendorLinks?.[0]
  return primary?.unitPrice
}

export type IngredientVendorRow = {
  vendorId: string
  vendor: string
  unitPrice?: number
  primary: boolean
}

/** Approved suppliers for stock table — primary first, with catalog unit prices. */
export function ingredientVendorRowsForDisplay(
  ing: Ingredient | undefined,
  vendorNameById: Map<string, string>,
  fallback?: { vendorId?: string; vendor?: string; unitPrice?: number },
): IngredientVendorRow[] {
  if (ing) {
    const links = normalizeIngredient(ing).vendorLinks ?? []
    if (links.length) {
      return [...links]
        .map((link) => ({
          vendorId: link.vendorId,
          vendor:
            link.vendor?.trim() || vendorNameById.get(link.vendorId) || link.vendorId || '—',
          unitPrice: link.unitPrice,
          primary: !!link.primary,
        }))
        .sort((a, b) => {
          if (a.primary !== b.primary) return a.primary ? -1 : 1
          return a.vendor.localeCompare(b.vendor)
        })
    }
  }
  const vendorId = fallback?.vendorId?.trim()
  const vendor =
    fallback?.vendor?.trim() ||
    (vendorId ? vendorNameById.get(vendorId) : undefined) ||
    undefined
  if (vendorId || vendor) {
    return [
      {
        vendorId: vendorId ?? vendor ?? '',
        vendor: vendor ?? '—',
        unitPrice: fallback?.unitPrice,
        primary: true,
      },
    ]
  }
  return []
}

export function ingredientFromStock(row: StockItem): Ingredient {
  const id = row.ingredientId || row.id
  return {
    id,
    name: row.name,
    sku: row.sku || row.id,
    category: row.category || 'General',
    unit: row.unit || 'pcs',
    active: true,
    vendorId: row.vendorId,
    vendor: row.vendor,
    reorderAt: row.reorderAt > 0 ? row.reorderAt : undefined,
  }
}

/** Backfill par level from stock when ingredient has none yet. */
export function migrateIngredientReorderFromStock(
  ingredients: Ingredient[],
  stock: StockItem[],
): Ingredient[] {
  const stockByIng = new Map<string, StockItem>()
  for (const row of stock) stockByIng.set(row.ingredientId || row.id, row)

  let changed = false
  const next = ingredients.map((ing) => {
    if ((ing.reorderAt ?? 0) > 0) return ing
    const linked = stockByIng.get(ing.id)
    if (!linked || !(linked.reorderAt > 0)) return ing
    changed = true
    return { ...ing, reorderAt: linked.reorderAt }
  })
  return changed ? next : ingredients
}

/** One-time backfill: copy stock vendor onto ingredients that have none yet. */
export function migrateIngredientVendorsFromStock(
  ingredients: Ingredient[],
  stock: StockItem[],
): Ingredient[] {
  const stockByIng = new Map<string, StockItem>()
  for (const row of stock) stockByIng.set(row.ingredientId || row.id, row)

  let changed = false
  const next = ingredients.map((ing) => {
    if (ing.vendorId || ing.vendor?.trim()) return ing
    const linked = stockByIng.get(ing.id)
    if (!linked?.vendorId && !linked?.vendor?.trim()) return ing
    changed = true
    return { ...ing, vendorId: linked.vendorId, vendor: linked.vendor?.trim() || undefined }
  })
  return changed ? next : ingredients
}

export function applyIngredientFieldsToStock(
  stock: StockItem[],
  ingredients: Ingredient[],
): StockItem[] {
  const byId = new Map(ingredients.map((ing) => [ing.id, ing]))
  let changed = false
  const next = stock.map((row) => {
    const ing = byId.get(row.ingredientId || row.id)
    if (!ing) return row
    const vendorId = ing.vendorId?.trim() || undefined
    const vendor = ing.vendor?.trim() || undefined
    const reorderAt = ing.reorderAt ?? 0
    if (row.vendorId === vendorId && row.vendor === vendor && row.reorderAt === reorderAt) return row
    changed = true
    return { ...row, vendorId, vendor, reorderAt }
  })
  return changed ? next : stock
}

/** @deprecated use applyIngredientFieldsToStock */
export function applyIngredientVendorsToStock(
  stock: StockItem[],
  ingredients: Ingredient[],
): StockItem[] {
  return applyIngredientFieldsToStock(stock, ingredients)
}

/** Seed ingredient catalog from warehouse stock when empty (one-time migration). */
export function ensureIngredientsFromStock(stock: StockItem[]): Ingredient[] {
  const existing = loadIngredients()
  if (existing.length) return existing
  if (!stock.length) return []
  const seeded = dedupeIngredientsByName(stock.map(ingredientFromStock)).ingredients
  saveIngredients(seeded)
  return seeded
}

export function nextIngredientSku(rows: Ingredient[]): string {
  const nums = rows.map((r) => Number(r.sku)).filter((n) => Number.isFinite(n))
  const max = nums.length ? Math.max(...nums) : 1000
  let n = max + 1
  const used = new Set(rows.map((r) => r.sku.trim().toLowerCase()))
  while (used.has(String(n))) n += 1
  return String(n)
}

export function isIngredientNameTaken(
  rows: Ingredient[],
  name: string,
  excludeId?: string,
): boolean {
  const key = name.trim().toLowerCase()
  if (!key) return false
  return rows.some((r) => r.id !== excludeId && r.name.trim().toLowerCase() === key)
}

export function isIngredientSkuTaken(rows: Ingredient[], sku: string, excludeId?: string): boolean {
  const key = sku.trim().toLowerCase()
  if (!key) return false
  return rows.some((r) => r.id !== excludeId && r.sku.trim().toLowerCase() === key)
}
