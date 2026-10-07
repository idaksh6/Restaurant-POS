import { getActiveBranchId } from './company'
import { isHeadOfficeBranchId } from '../lib/stockBranch'
import { tenantGetItem, tenantSetItem } from './repos/db'

const AREAS_KEY = 'mesa-table-areas'

export type TableArea = {
  id: string
  name: string
  sortOrder: number
  active: boolean
  /** Branch that owns this area — required for new rows. */
  branchId?: string
}

function slugAreaId(name: string, existing: TableArea[]) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'area'
  let id = `area-${base}`
  let n = 2
  const taken = new Set(existing.map((a) => a.id))
  while (taken.has(id)) {
    id = `area-${base}-${n}`
    n += 1
  }
  return id
}

function normalizeArea(a: TableArea): TableArea {
  return {
    id: String(a.id),
    name: String(a.name ?? '').trim(),
    sortOrder: Number(a.sortOrder) || 0,
    active: a.active !== false,
    branchId: a.branchId ? String(a.branchId) : undefined,
  }
}

/** All stored areas (every branch). Never auto-seeds demo areas. */
export function loadAllTableAreas(): TableArea[] {
  try {
    const raw = tenantGetItem(AREAS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TableArea[]
      if (Array.isArray(parsed)) {
        return parsed
          .map(normalizeArea)
          .filter((a) => a.id && a.name)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      }
    }
  } catch {
    /* empty */
  }
  return []
}

/** Areas for one branch. Unscoped legacy rows only show on Head Office. */
export function loadTableAreas(branchId = getActiveBranchId()): TableArea[] {
  const all = loadAllTableAreas()
  const scoped = all.filter((a) => a.branchId === branchId)
  if (scoped.length) return scoped
  if (isHeadOfficeBranchId(branchId)) {
    return all.filter((a) => !a.branchId)
  }
  return []
}

export function saveTableAreas(rows: TableArea[], branchId = getActiveBranchId()) {
  const scoped = rows
    .map((a) => normalizeArea({ ...a, branchId: a.branchId ?? branchId }))
    .filter((a) => a.id && a.name && a.branchId === branchId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const all = loadAllTableAreas()
  // Keep other branches' areas. Keep unscoped legacy unless Head Office is
  // saving scoped rows (then migrate legacy off the shared bucket).
  const others = all.filter((a) => {
    if (a.branchId === branchId) return false
    if (!a.branchId) {
      if (isHeadOfficeBranchId(branchId) && scoped.length) return false
      return true
    }
    return true
  })
  const next = [...others, ...scoped]
  tenantSetItem(AREAS_KEY, JSON.stringify(next))
  if (typeof window !== 'undefined') {
    queueMicrotask(() => window.dispatchEvent(new Event('mesa:table-areas-changed')))
  }
  if (scoped.length) return scoped
  if (isHeadOfficeBranchId(branchId)) return all.filter((a) => !a.branchId)
  return []
}

export function fromApiTableArea(row: Record<string, unknown>): TableArea {
  return normalizeArea({
    id: String(row.id ?? ''),
    name: String(row.name ?? '').trim(),
    sortOrder: Number(row.sort ?? row.sortOrder ?? 0) || 0,
    active: row.active !== false,
    branchId: row.branchId ? String(row.branchId) : undefined,
  })
}

export function toApiTableArea(row: TableArea): Record<string, unknown> {
  const branchId = row.branchId ?? getActiveBranchId()
  return {
    id: row.id,
    name: row.name,
    sort: row.sortOrder,
    sortOrder: row.sortOrder,
    active: row.active !== false,
    branchId,
  }
}

/** Merge server catalog for this branch into local areas (server wins on same id). */
export function mergeRemoteTableAreas(
  remote: TableArea[],
  branchId = getActiveBranchId(),
  local = loadTableAreas(branchId),
): TableArea[] {
  const byId = new Map<string, TableArea>()
  for (const a of local) {
    if (a.branchId && a.branchId !== branchId) continue
    byId.set(a.id, { ...a, branchId })
  }
  for (const a of remote) {
    if (!a.id || !a.name) continue
    if (a.branchId && a.branchId !== branchId) continue
    // Skip company-wide legacy rows when this is not Head Office.
    if (!a.branchId && !isHeadOfficeBranchId(branchId)) continue
    byId.set(a.id, { ...a, branchId })
  }
  const byName = new Map<string, TableArea>()
  for (const a of byId.values()) {
    const key = a.name.toLowerCase()
    const prev = byName.get(key)
    if (!prev || remote.some((r) => r.id === a.id)) byName.set(key, a)
  }
  return saveTableAreas([...byName.values()], branchId)
}

export function nextAreaSortOrder(rows: TableArea[]) {
  return (rows.reduce((m, r) => Math.max(m, r.sortOrder), 0) || 0) + 1
}

export function createTableArea(
  name: string,
  rows = loadTableAreas(),
  branchId = getActiveBranchId(),
): TableArea {
  const trimmed = name.trim()
  return {
    id: slugAreaId(trimmed, rows),
    name: trimmed,
    sortOrder: nextAreaSortOrder(rows),
    active: true,
    branchId,
  }
}

/** Ensure catalog includes every area name used on floor tables for this branch. */
export function ensureAreasFromTables(
  areaNames: string[],
  rows?: TableArea[],
  branchId = getActiveBranchId(),
): TableArea[] {
  let next = [...(rows ?? loadTableAreas(branchId))]
  let changed = false
  for (const raw of areaNames) {
    const name = raw.trim()
    if (!name) continue
    if (next.some((a) => a.name.toLowerCase() === name.toLowerCase())) continue
    next.push(createTableArea(name, next, branchId))
    changed = true
  }
  if (changed) return saveTableAreas(next, branchId)
  return next
}

/** Floor tables store the area name — printer routing keys on the area id. */
export function areaIdByName(name: string | undefined, rows = loadTableAreas()): string | undefined {
  const key = name?.trim().toLowerCase()
  if (!key) return undefined
  return rows.find((a) => a.name.trim().toLowerCase() === key)?.id
}

export function activeAreaNames(rows = loadTableAreas()): string[] {
  return rows.filter((a) => a.active).map((a) => a.name)
}

/** Lowercased names of inactive catalog areas. */
export function inactiveAreaNameSet(rows = loadTableAreas()): Set<string> {
  return new Set(
    rows.filter((a) => !a.active).map((a) => a.name.trim().toLowerCase()).filter(Boolean),
  )
}

export function isTableAreaActive(name: string, catalog = loadTableAreas()): boolean {
  const key = name.trim().toLowerCase()
  if (!key) return true
  const hit = catalog.find((a) => a.name.trim().toLowerCase() === key)
  if (!hit) return true
  return hit.active !== false
}

export function orderedAreaNames(used: string[], catalog = loadTableAreas()): string[] {
  const usedNorm = new Map<string, string>()
  for (const raw of used) {
    const name = raw.trim()
    if (!name) continue
    usedNorm.set(name.toLowerCase(), name)
  }
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const a of catalog) {
    if (!a.active) continue
    const hit = usedNorm.get(a.name.toLowerCase())
    const label = hit ?? a.name
    if (seen.has(label.toLowerCase())) continue
    ordered.push(label)
    seen.add(label.toLowerCase())
    usedNorm.delete(a.name.toLowerCase())
  }
  for (const leftover of usedNorm.values()) {
    if (!isTableAreaActive(leftover, catalog)) continue
    if (seen.has(leftover.toLowerCase())) continue
    ordered.push(leftover)
    seen.add(leftover.toLowerCase())
  }
  return ordered
}

export { slugAreaId }
