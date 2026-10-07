import type { AddonGroup, AddonOption } from './masters'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type AddonMasterGroup = {
  id: string
  branchId?: string
  name: string
  appendVariationName?: boolean
  min: number
  max: number
  addons: AddonOption[]
  active: boolean
  sort?: number
}

export const ADDON_MASTERS_KEY = 'mesa-addon-masters'

export const seedAddonMasters: AddonMasterGroup[] = [
  {
    id: 'am-pizza-toppings',
    name: 'Pizza toppings',
    appendVariationName: true,
    min: 0,
    max: 8,
    active: true,
    sort: 1,
    addons: [
      { id: 'am-top-onion', name: 'Onion', price: 2 },
      { id: 'am-top-olive', name: 'Olives', price: 3 },
      { id: 'am-top-mushroom', name: 'Mushroom', price: 4 },
      { id: 'am-top-pepperoni', name: 'Pepperoni', price: 6 },
    ],
  },
  {
    id: 'am-extra-cheese',
    name: 'Cheese extras',
    appendVariationName: false,
    min: 0,
    max: 3,
    active: true,
    sort: 2,
    addons: [
      { id: 'am-ch-moz', name: 'Extra mozzarella', price: 5 },
      { id: 'am-ch-ched', name: 'Cheddar', price: 4 },
    ],
  },
  {
    id: 'am-sauces',
    name: 'Sauces',
    appendVariationName: false,
    min: 0,
    max: 2,
    active: true,
    sort: 3,
    addons: [
      { id: 'am-sauce-garlic', name: 'Garlic sauce', price: 1 },
      { id: 'am-sauce-chili', name: 'Chili sauce', price: 1 },
      { id: 'am-sauce-bbq', name: 'BBQ sauce', price: 2 },
    ],
  },
]

function normalizeAddon(row: Partial<AddonOption> | Record<string, unknown>, fallbackId: string): AddonOption {
  return {
    id: String(row.id ?? fallbackId),
    name: String(row.name ?? '').trim() || 'Addon',
    price: Math.round((Number(row.price) || 0) * 100) / 100,
    variationPrices:
      row.variationPrices && typeof row.variationPrices === 'object'
        ? (row.variationPrices as Record<string, number>)
        : undefined,
  }
}

function normalizeGroup(row: Partial<AddonMasterGroup> | Record<string, unknown>): AddonMasterGroup | null {
  const id = String(row.id ?? '')
  if (!id) return null
  const rawAddons = Array.isArray(row.addons) ? row.addons : []
  const addons = rawAddons.map((a, i) =>
    normalizeAddon((a ?? {}) as Record<string, unknown>, `${id}-a${i}`),
  )
  const min = Math.max(0, Math.floor(Number(row.min) || 0))
  const max = Math.max(min, Math.floor(Number(row.max) || 99))
  return {
    id,
    branchId: row.branchId ? String(row.branchId) : undefined,
    name: String(row.name ?? '').trim() || 'Addon group',
    appendVariationName: row.appendVariationName === true,
    min,
    max,
    addons,
    active: row.active !== false,
    sort: Number(row.sort ?? 0) || 0,
  }
}

export function fromApiAddonMaster(row: Record<string, unknown>): AddonMasterGroup {
  let addons: unknown = row.addons
  if (typeof addons === 'string') {
    try {
      addons = JSON.parse(addons)
    } catch {
      addons = []
    }
  }
  return (
    normalizeGroup({ ...row, addons }) ?? {
      id: String(row.id),
      name: 'Addon group',
      min: 0,
      max: 99,
      addons: [],
      active: true,
      sort: 0,
    }
  )
}

export function loadAddonMasters(): AddonMasterGroup[] {
  try {
    const raw = tenantGetItem(ADDON_MASTERS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((r) => normalizeGroup(r as Record<string, unknown>))
      .filter((r): r is AddonMasterGroup => r != null)
  } catch {
    return []
  }
}

export function saveAddonMasters(rows: AddonMasterGroup[]) {
  const cleaned = rows
    .map((r) => normalizeGroup(r))
    .filter((r): r is AddonMasterGroup => r != null)
  tenantSetItem(ADDON_MASTERS_KEY, JSON.stringify(cleaned))
}

export function activeAddonMasters(rows: AddonMasterGroup[]) {
  return rows
    .filter((r) => r.active)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
}

/** Fresh ids so starters persist/sync like normal catalog rows. */
export function starterAddonMasters(): AddonMasterGroup[] {
  const stamp = Date.now()
  return seedAddonMasters.map((r, i) => ({
    ...r,
    id: `am-${stamp}-${i}`,
    addons: r.addons.map((a, ai) => ({
      ...a,
      id: `am-${stamp}-${i}-a${ai}`,
    })),
  }))
}

/** Stable dish group id so re-attaching replaces the same group. */
export function dishGroupIdFromMaster(masterId: string) {
  return `from-${masterId}`
}

export function cloneMasterGroupOntoDish(master: AddonMasterGroup): AddonGroup {
  return {
    id: dishGroupIdFromMaster(master.id),
    name: master.name,
    appendVariationName: master.appendVariationName,
    min: master.min,
    max: master.max,
    addons: master.addons.map((a) => ({
      id: a.id,
      name: a.name,
      price: a.price,
      variationPrices: a.variationPrices ? { ...a.variationPrices } : undefined,
    })),
  }
}

/** Attach or replace a master group on a dish customizer's addonGroups list. */
export function attachMasterGroup(
  existing: AddonGroup[],
  master: AddonMasterGroup,
): AddonGroup[] {
  const cloned = cloneMasterGroupOntoDish(master)
  const rest = existing.filter((g) => g.id !== cloned.id)
  return [...rest, cloned]
}
