import { getActiveBranchId } from '../company'
import {
  isDemoCategory,
  isDemoDish,
  withStarterCatalog,
  type MasterDish,
  type MenuCategory,
} from '../masters'
import { mesaDb, snapshotDexieToLocalStorage, tenantGetItem, tenantRemoveItem, tenantSetItem } from './db'

function scrubDemoCategoryOutbox() {
  try {
    const raw = tenantGetItem('mesa-outbox')
    if (!raw) return
    const ops = JSON.parse(raw) as { type?: string; entityId?: string; payload?: { kind?: string } }[]
    if (!Array.isArray(ops)) return
    tenantSetItem(
      'mesa-outbox',
      JSON.stringify(
        ops.filter(
          (op) =>
            !(
              (op.type === 'masters.upsert' || op.type === 'masters.delete') &&
              op.payload?.kind === 'category' &&
              isDemoCategory(op.entityId ?? '')
            ),
        ),
      ),
    )
  } catch {
    /* ignore */
  }
}

function inBranch<T extends { branchId?: string }>(row: T, branchId: string) {
  return !row.branchId || row.branchId === branchId
}

function pendingOutboxMasters(kind: 'dish' | 'category') {
  try {
    const raw = tenantGetItem('mesa-outbox')
    if (!raw) return [] as Array<MasterDish | MenuCategory>
    const ops = JSON.parse(raw) as Array<{
      type?: string
      payload?: { kind?: string; dish?: MasterDish; cat?: MenuCategory }
    }>
    if (!Array.isArray(ops)) return []
    return ops
      .filter((op) => op.type === 'masters.upsert' && op.payload?.kind === kind)
      .map((op) => (kind === 'dish' ? op.payload?.dish : op.payload?.cat))
      .filter(Boolean) as Array<MasterDish | MenuCategory>
  } catch {
    return []
  }
}

/** Pending local deletes — never resurrect these when merging an API list. */
function pendingOutboxMasterDeletes(kind: 'dish' | 'category') {
  try {
    const raw = tenantGetItem('mesa-outbox')
    if (!raw) return new Set<string>()
    const ops = JSON.parse(raw) as Array<{
      type?: string
      entityId?: string
      status?: string
      payload?: { kind?: string }
    }>
    if (!Array.isArray(ops)) return new Set<string>()
    return new Set(
      ops
        .filter(
          (op) =>
            op.type === 'masters.delete' &&
            op.payload?.kind === kind &&
            op.entityId &&
            op.status !== 'done',
        )
        .map((op) => String(op.entityId)),
    )
  } catch {
    return new Set<string>()
  }
}

function mergeDishRows(rows: MasterDish[]) {
  const byId = new Map<string, MasterDish>()
  for (const row of rows) {
    if (!row?.id) continue
    byId.set(row.id, row)
  }
  return sortDishes([...byId.values()])
}

export function sortDishes(rows: MasterDish[]) {
  return [...rows].sort((a, b) => {
    const na = Number(a.code)
    const nb = Number(b.code)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    const codeCmp = String(a.code ?? '').localeCompare(String(b.code ?? ''), undefined, { numeric: true })
    if (codeCmp) return codeCmp
    return a.name.localeCompare(b.name)
  })
}

function snapshotDishes(rows: MasterDish[]) {
  tenantSetItem('mesa-master-dishes', JSON.stringify(rows))
}

/** Sync peek for print/KOT without awaiting Dexie. */
export function peekDishes(): MasterDish[] {
  try {
    const raw = tenantGetItem('mesa-master-dishes')
    if (!raw) return []
    const parsed = JSON.parse(raw) as MasterDish[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function snapshotCategories(rows: MenuCategory[]) {
  tenantSetItem('mesa-master-categories', JSON.stringify(rows))
}

export const mastersRepo = {
  async listCategories(branchId = getActiveBranchId()): Promise<MenuCategory[]> {
    const rows = await mesaDb.categories.toArray()
    const demoIds = rows.filter((c) => isDemoCategory(c.id)).map((c) => c.id)
    if (demoIds.length) await mesaDb.categories.bulkDelete(demoIds)
    const keep = rows.filter((c) => !isDemoCategory(c.id) && inBranch(c, branchId)).sort((a, b) => a.sort - b.sort)
    const pending = (pendingOutboxMasters('category') as MenuCategory[]).filter(
      (c) => !isDemoCategory(c.id) && inBranch(c, branchId) && !keep.some((x) => x.id === c.id),
    )
    if (pending.length) await mesaDb.categories.bulkPut(pending.map((c) => ({ ...c, branchId: c.branchId ?? branchId })))
    const seeded = withStarterCatalog([...keep, ...pending], [], branchId).categories
    const missing = seeded.filter((c) => !keep.some((x) => x.id === c.id))
    if (missing.length) await mesaDb.categories.bulkPut(missing)
    tenantSetItem('mesa-master-categories', JSON.stringify(seeded))
    scrubDemoCategoryOutbox()
    return seeded
  },

  async replaceCategories(rows: MenuCategory[], branchId = getActiveBranchId()) {
    // Server list wins for this branch. Keep only unsynced local upserts —
    // never keep arbitrary local-only rows (that resurrects peer deletes).
    const deletedIds = pendingOutboxMasterDeletes('category')
    const incoming = rows
      .filter((c) => !isDemoCategory(c.id) && !deletedIds.has(c.id))
      .map((c) => ({ ...c, branchId: c.branchId ?? branchId }))
    const incomingIds = new Set(incoming.map((c) => c.id))
    const existing = await mesaDb.categories.toArray()
    const others = existing.filter((c) => c.branchId && c.branchId !== branchId)
    const pending = (pendingOutboxMasters('category') as MenuCategory[]).filter(
      (c) =>
        !incomingIds.has(c.id) &&
        !deletedIds.has(c.id) &&
        !isDemoCategory(c.id) &&
        inBranch(c, branchId),
    )
    const scoped = [...incoming, ...pending].sort((a, b) => a.sort - b.sort)
    await mesaDb.categories.clear()
    const all = [...others, ...scoped]
    if (all.length) await mesaDb.categories.bulkPut(all)
    snapshotCategories(scoped)
    return scoped
  },

  async listDishes(branchId = getActiveBranchId()): Promise<MasterDish[]> {
    const rows = await mesaDb.dishes.toArray()
    const demoIds = rows.filter((d) => isDemoDish(d.id) || isDemoCategory(d.categoryId)).map((d) => d.id)
    if (demoIds.length) await mesaDb.dishes.bulkDelete(demoIds)
    const keep = rows.filter(
      (d) => !isDemoDish(d.id) && !isDemoCategory(d.categoryId) && inBranch(d, branchId),
    )
    const pending = (pendingOutboxMasters('dish') as MasterDish[]).filter(
      (d) =>
        !isDemoDish(d.id) &&
        !isDemoCategory(d.categoryId) &&
        inBranch(d, branchId) &&
        !keep.some((x) => x.id === d.id),
    )
    if (pending.length) await mesaDb.dishes.bulkPut(pending.map((d) => ({ ...d, branchId: d.branchId ?? branchId })))
    const combined = mergeDishRows([...keep, ...pending])
    const seeded = combined.length
      ? combined
      : withStarterCatalog([], [], branchId).dishes
    const missing = seeded.filter((d) => !keep.some((x) => x.id === d.id))
    if (missing.length) await mesaDb.dishes.bulkPut(missing)
    snapshotDishes(seeded)
    await snapshotDexieToLocalStorage()
    return seeded
  },

  async saveCategory(cat: MenuCategory, branchId = getActiveBranchId()) {
    if (isDemoCategory(cat.id)) return this.listCategories(branchId)
    const stamped = { ...cat, branchId: cat.branchId ?? branchId }
    await mesaDb.categories.put(stamped)
    await snapshotDexieToLocalStorage()
    return this.listCategories(branchId)
  },

  async deleteCategory(id: string, branchId = getActiveBranchId()) {
    await mesaDb.categories.delete(id)
    return this.listCategories(branchId)
  },

  async replaceDishes(rows: MasterDish[], branchId = getActiveBranchId()) {
    const deletedIds = pendingOutboxMasterDeletes('dish')
    const incoming = rows
      .filter((d) => !isDemoDish(d.id) && !isDemoCategory(d.categoryId) && !deletedIds.has(d.id))
      .map((d) => ({ ...d, branchId: d.branchId ?? branchId }))
    const incomingIds = new Set(incoming.map((d) => d.id))
    const existing = await mesaDb.dishes.toArray()
    const others = existing.filter((d) => d.branchId && d.branchId !== branchId)
    const localById = new Map(
      existing.filter((d) => inBranch(d, branchId)).map((d) => [d.id, d] as const),
    )
    // Keep local photos if the API payload omitted imageDataUrl (meta merge lag / size).
    const withLocalImages = incoming.map((d) => {
      const prev = localById.get(d.id)
      if (prev?.imageDataUrl && !d.imageDataUrl) {
        return { ...d, imageDataUrl: prev.imageDataUrl }
      }
      return d
    })
    const pending = (pendingOutboxMasters('dish') as MasterDish[]).filter(
      (d) =>
        !incomingIds.has(d.id) &&
        !deletedIds.has(d.id) &&
        !isDemoDish(d.id) &&
        !isDemoCategory(d.categoryId) &&
        inBranch(d, branchId),
    )
    // Server rows for this branch win. Keep only unsynced local upserts.
    const scoped = mergeDishRows([
      ...withLocalImages.filter((d) => inBranch(d, branchId)),
      ...pending.map((d) => ({ ...d, branchId: d.branchId ?? branchId })),
    ])
    await mesaDb.dishes.clear()
    const all = [...others, ...scoped]
    if (all.length) await mesaDb.dishes.bulkPut(all)
    snapshotDishes(scoped)
    await snapshotDexieToLocalStorage()
    return scoped
  },

  async saveDish(dish: MasterDish, branchId = getActiveBranchId()) {
    if (isDemoDish(dish.id) || isDemoCategory(dish.categoryId)) return this.listDishes(branchId)
    const stamped = { ...dish, branchId: dish.branchId ?? branchId }
    await mesaDb.dishes.put(stamped)
    await snapshotDexieToLocalStorage()
    const listed = await this.listDishes(branchId)
    snapshotDishes(listed)
    await snapshotDexieToLocalStorage()
    return listed
  },

  async deleteDish(id: string, branchId = getActiveBranchId()) {
    await mesaDb.dishes.delete(id)
    return this.listDishes(branchId)
  },

  async reset() {
    await mesaDb.categories.clear()
    await mesaDb.dishes.clear()
    tenantRemoveItem('mesa-master-categories')
    tenantRemoveItem('mesa-master-dishes')
  },
}
