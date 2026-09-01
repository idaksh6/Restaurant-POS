import { tableAreas as seedAreaNames } from './mock'
import { tenantGetItem, tenantSetItem } from './repos/db'

const AREAS_KEY = 'mesa-table-areas'

export type TableArea = {
  id: string
  name: string
  sortOrder: number
  active: boolean
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

function seedAreas(): TableArea[] {
  return seedAreaNames.map((name, i) => ({
    id: `area-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    sortOrder: (i + 1) * 10,
    active: true,
  }))
}

export function loadTableAreas(): TableArea[] {
  try {
    const raw = tenantGetItem(AREAS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TableArea[]
      if (Array.isArray(parsed) && parsed.length) {
        return parsed
          .map((a) => ({
            id: String(a.id),
            name: String(a.name ?? '').trim(),
            sortOrder: Number(a.sortOrder) || 0,
            active: a.active !== false,
          }))
          .filter((a) => a.id && a.name)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      }
    }
  } catch {
    /* seed */
  }
  const seeded = seedAreas()
  saveTableAreas(seeded)
  return seeded
}

export function saveTableAreas(rows: TableArea[]) {
  const next = [...rows]
    .map((a) => ({
      ...a,
      name: a.name.trim(),
      sortOrder: Number(a.sortOrder) || 0,
      active: a.active !== false,
    }))
    .filter((a) => a.id && a.name)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  tenantSetItem(AREAS_KEY, JSON.stringify(next))
  if (typeof window !== 'undefined') {
    queueMicrotask(() => window.dispatchEvent(new Event('mesa:table-areas-changed')))
  }
  return next
}

export function nextAreaSortOrder(rows: TableArea[]) {
  return (rows.reduce((m, r) => Math.max(m, r.sortOrder), 0) || 0) + 10
}

export function createTableArea(name: string, rows = loadTableAreas()): TableArea {
  const trimmed = name.trim()
  return {
    id: slugAreaId(trimmed, rows),
    name: trimmed,
    sortOrder: nextAreaSortOrder(rows),
    active: true,
  }
}

/** Ensure catalog includes every area name used on floor tables. */
export function ensureAreasFromTables(areaNames: string[], rows = loadTableAreas()): TableArea[] {
  let next = [...rows]
  let changed = false
  for (const raw of areaNames) {
    const name = raw.trim()
    if (!name) continue
    if (next.some((a) => a.name.toLowerCase() === name.toLowerCase())) continue
    next.push(createTableArea(name, next))
    changed = true
  }
  if (changed) return saveTableAreas(next)
  return next
}

export function activeAreaNames(rows = loadTableAreas()): string[] {
  return rows.filter((a) => a.active).map((a) => a.name)
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
    if (seen.has(leftover.toLowerCase())) continue
    ordered.push(leftover)
    seen.add(leftover.toLowerCase())
  }
  return ordered
}

export { slugAreaId }
