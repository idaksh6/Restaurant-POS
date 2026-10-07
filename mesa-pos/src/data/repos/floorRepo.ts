import { getActiveBranchId } from '../company'
import { scopedId } from '../masters'
import type { Table } from '../mock'
import { mesaDb, type FloorTableRow } from './db'

export function scopedFloorId(id: string, branchId: string) {
  if (id.endsWith(`__${branchId}`)) return id
  if (id.includes('__')) return id
  return scopedId(id, branchId)
}

/** Strip `dine:branch:` and `__branchId` so two terminals can share a table. */
export function unscopedFloorId(id: string) {
  const fromDine = /^dine:[^:]+:(.+)$/.exec(id)
  const raw = fromDine ? fromDine[1] : id
  const cut = raw.lastIndexOf('__')
  return cut > 0 ? raw.slice(0, cut) : raw
}

export function sameFloorTable(a?: string | null, b?: string | null) {
  if (!a || !b) return false
  return a === b || unscopedFloorId(a) === unscopedFloorId(b)
}

/** Fired after peer floor.upsert / local floor writes so UI can soft-refresh without remounting. */
export const FLOOR_SYNC_EVENT = 'mesa:floor-synced'

export function notifyFloorSynced() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(FLOOR_SYNC_EVENT))
}

export function alignFloorTableId(tableId: string | undefined, layout: { id: string }[]) {
  if (!tableId) return tableId
  return layout.find((row) => sameFloorTable(row.id, tableId))?.id ?? tableId
}

function asLayout(row: FloorTableRow): Table {
  const note = row.note?.trim()
  return {
    id: row.id,
    label: row.label,
    seats: row.seats,
    area: row.area,
    note: note || undefined,
    status: 'free',
  }
}

export const floorRepo = {
  async list(branchId = getActiveBranchId()): Promise<Table[]> {
    const rows = await mesaDb.floorTables.toArray()
    return rows.filter((r) => r.branchId === branchId).map(asLayout)
  },

  async replace(rows: FloorTableRow[], branchId = getActiveBranchId()) {
    const incoming = rows.map((r) => {
      const br = r.branchId ?? branchId
      return { ...r, id: scopedFloorId(String(r.id), br), branchId: br, status: 'free' as const }
    })
    const existing = await mesaDb.floorTables.toArray()
    const dropIds = existing
      .filter((r) => !r.branchId || r.branchId === branchId)
      .map((r) => r.id)
      .filter((id) => !incoming.some((r) => r.id === id))
    // Prefer surgical deletes over clear() so peer soft-reloads never see an empty floor mid-write.
    if (dropIds.length) await mesaDb.floorTables.bulkDelete(dropIds)
    if (incoming.length) await mesaDb.floorTables.bulkPut(incoming)
    return incoming.map(asLayout)
  },

  async put(table: FloorTableRow, branchId = getActiveBranchId()) {
    const br = table.branchId ?? branchId
    const stamped = { ...table, id: scopedFloorId(String(table.id), br), branchId: br, status: 'free' as const }
    await mesaDb.floorTables.put(stamped)
    return asLayout(stamped)
  },

  async remove(id: string, branchId = getActiveBranchId()) {
    const scoped = scopedFloorId(id, branchId)
    await mesaDb.floorTables.delete(scoped)
    if (scoped !== id) await mesaDb.floorTables.delete(id)
  },
}
