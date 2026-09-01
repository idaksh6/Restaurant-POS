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

export function alignFloorTableId(tableId: string | undefined, layout: { id: string }[]) {
  if (!tableId) return tableId
  return layout.find((row) => sameFloorTable(row.id, tableId))?.id ?? tableId
}

function asLayout(row: FloorTableRow): Table {
  return {
    id: row.id,
    label: row.label,
    seats: row.seats,
    area: row.area,
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
    const others = (await mesaDb.floorTables.toArray()).filter((r) => r.branchId && r.branchId !== branchId)
    await mesaDb.floorTables.clear()
    const all = [...others, ...incoming]
    if (all.length) await mesaDb.floorTables.bulkPut(all)
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
