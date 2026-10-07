import type { KitchenTicketStatus } from '../data/mock'
import type { MasterDish, MenuCategory } from '../data/masters'
import { isBeverageDish } from '../data/beverages'
import {
  hasPurpose,
  kotStation,
  loadAllPrinters,
  printersForBranch,
  type PrintStation,
} from '../data/printers'
import { getActiveBranchId } from '../data/company'
import { peekCategories } from '../data/repos/mastersRepo'

export type KdsStation = {
  id: string
  name: string
  /** Mapped department, or undefined = catch-all KOT */
  departmentId?: string
  board: 'kitchen' | 'bar'
}

export type KdsBoardMode = 'all' | 'kitchen' | 'bar' | 'expo'

const VIRTUAL_KITCHEN = 'station-kitchen'
const VIRTUAL_BAR = 'station-bar'

function categoryChain(catId: string | undefined, categories: MenuCategory[]) {
  const out: MenuCategory[] = []
  let id = catId
  const guard = new Set<string>()
  while (id && !guard.has(id)) {
    guard.add(id)
    const cat = categories.find((c) => c.id === id)
    if (!cat) break
    out.push(cat)
    id = cat.parentId
  }
  return out
}

function isBarCategory(cat: MenuCategory) {
  if (cat.isBar) return true
  return /bar|bev|drink|beverage|مشروب|مشروبات/i.test(`${cat.name} ${cat.alias ?? ''}`)
}

/** Leaf → root ids for printer / station matching. */
export function dishDepartmentIds(
  dish: MasterDish | undefined,
  categories: MenuCategory[],
): string[] {
  if (!dish?.categoryId) return []
  return categoryChain(dish.categoryId, categories).map((c) => c.id)
}

export function dishDepartmentId(
  dish: MasterDish | undefined,
  categories: MenuCategory[],
): string | undefined {
  return dishDepartmentIds(dish, categories)[0]
}

export function isBarDish(dish: MasterDish | undefined, categories: MenuCategory[]) {
  if (!dish) return false
  if (isBeverageDish(dish, categories)) return true
  return categoryChain(dish.categoryId, categories).some(isBarCategory)
}

function stationFromPrinter(p: PrintStation): KdsStation {
  return {
    id: p.id,
    name: p.name,
    departmentId: p.departmentId,
    board: /bar|bev|drink|مشروب/i.test(p.name) ? 'bar' : 'kitchen',
  }
}

/**
 * Active KOT printers as KDS stations.
 * If none: top-level menu departments (so Grill / Pizza / etc. appear without printers).
 * Last resort: Kitchen + Bar virtual boards.
 */
export function listKdsStations(
  branchId?: string,
  categories: MenuCategory[] = peekCategories(),
): KdsStation[] {
  const bid = branchId ?? getActiveBranchId()
  const printers = printersForBranch(loadAllPrinters(), bid).filter(
    (p) => hasPurpose(p, 'kot') && p.active,
  )
  if (printers.length) {
    return [...printers]
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map(stationFromPrinter)
  }

  const tops = categories
    .filter((c) => c.active !== false && !c.parentId)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  if (tops.length) {
    return tops.map((c) => ({
      id: `dept-${c.id}`,
      name: c.name,
      departmentId: c.id,
      board: isBarCategory(c) ? 'bar' : 'kitchen',
    }))
  }

  return [
    { id: VIRTUAL_KITCHEN, name: 'Kitchen', board: 'kitchen' },
    { id: VIRTUAL_BAR, name: 'Bar', board: 'bar' },
  ]
}

export function resolveLineStationId(
  dish: MasterDish | undefined,
  categories: MenuCategory[],
  stations: KdsStation[] = listKdsStations(getActiveBranchId(), categories),
  printers: PrintStation[] = loadAllPrinters(),
): string {
  const deptIds = dishDepartmentIds(dish, categories)
  for (const deptId of deptIds) {
    const mapped = kotStation(printers, deptId)
    if (mapped && stations.some((s) => s.id === mapped.id)) return mapped.id
    const byDept = stations.find((s) => s.departmentId === deptId)
    if (byDept) return byDept.id
  }

  const bar = isBarDish(dish, categories)
  const virtual = stations.find((s) => s.id === (bar ? VIRTUAL_BAR : VIRTUAL_KITCHEN))
  if (virtual) return virtual.id
  const byBoard = stations.find((s) => s.board === (bar ? 'bar' : 'kitchen'))
  return byBoard?.id ?? stations[0]?.id ?? VIRTUAL_KITCHEN
}

export function aggregateKitchenStatus(
  statuses: Array<KitchenTicketStatus | undefined>,
): KitchenTicketStatus {
  const active = statuses.filter((s) => (s ?? 'queued') !== 'done')
  if (!active.length) return 'done'
  if (active.some((s) => (s ?? 'queued') === 'queued')) return 'queued'
  if (active.some((s) => s === 'cooking')) return 'cooking'
  if (active.some((s) => s === 'ready')) return 'ready'
  return 'done'
}

export function lineEffectiveStatus(
  lineStatus: KitchenTicketStatus | undefined,
  ticketStatus: KitchenTicketStatus,
): KitchenTicketStatus {
  return lineStatus ?? ticketStatus
}

/** Next bump in Queued → Cooking → Ready → Done. */
export function nextKitchenBump(status: KitchenTicketStatus): KitchenTicketStatus | null {
  if (status === 'queued') return 'cooking'
  if (status === 'cooking') return 'ready'
  if (status === 'ready') return 'done'
  return null
}
