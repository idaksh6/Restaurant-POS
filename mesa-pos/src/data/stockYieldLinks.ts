import { getActiveBranchId } from './company'
import type { StockItem } from './mock'
import { tenantGetItem, tenantSetItem } from './repos/db'

/** Valid raw → prepped conversion (production yield only). */
export type YieldLink = {
  id: string
  fromSku: string
  toSku: string
  /** Default output / raw × 100 (e.g. 85 = 8.5 kg from 10 kg raw). */
  defaultYieldPct: number
  label: string
  note?: string
  active?: boolean
  /** Branch that owns this conversion. */
  branchId?: string
}

export type YieldConversion = {
  link: YieldLink
  from: StockItem
  to: StockItem
}

export const YIELD_LINKS_KEY = 'mesa-yield-links'
export const YIELD_LINKS_CHANGED = 'mesa:yield-links-changed'

/** Demo pairs — never auto-seed into production storage. */
const SEED_YIELD_IDS = new Set(['yl-potato-fry', 'yl-paneer-portion'])

export function isSeedYieldLink(row: { id?: string; fromSku?: string; toSku?: string }): boolean {
  if (row.id && SEED_YIELD_IDS.has(String(row.id))) return true
  const from = String(row.fromSku || '').trim().toUpperCase()
  const to = String(row.toSku || '').trim().toUpperCase()
  return (
    (from === 'PRD-POT-RAW' && to === 'PRD-POT-FRY') ||
    (from === 'DRY-PAN-BLK' && to === 'DRY-PAN-CKB')
  )
}

function normalizeYieldLink(row: YieldLink): YieldLink {
  return {
    id: String(row.id ?? '').trim() || `yl-${Date.now()}`,
    fromSku: String(row.fromSku ?? '').trim(),
    toSku: String(row.toSku ?? '').trim(),
    defaultYieldPct: Math.min(100, Math.max(1, Math.round(Number(row.defaultYieldPct) || 100))),
    label: String(row.label ?? '').trim(),
    note: row.note?.trim() || undefined,
    active: row.active !== false,
    branchId: row.branchId ? String(row.branchId) : undefined,
  }
}

/** All stored links (all branches), seeds stripped. */
export function loadAllYieldLinks(): YieldLink[] {
  try {
    const raw = tenantGetItem(YIELD_LINKS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as YieldLink[]
      if (Array.isArray(parsed)) {
        const cleaned = parsed.map(normalizeYieldLink).filter((r) => !isSeedYieldLink(r))
        if (cleaned.length !== parsed.length) {
          tenantSetItem(YIELD_LINKS_KEY, JSON.stringify(cleaned))
        }
        return cleaned
      }
    }
  } catch {
    /* empty */
  }
  return []
}

/** Links for a branch (defaults to active). Unscoped leftovers are ignored. */
export function loadYieldLinks(branchId = getActiveBranchId()): YieldLink[] {
  return loadAllYieldLinks()
    .filter((r) => r.branchId === branchId)
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function activeYieldLinks(branchId = getActiveBranchId()): YieldLink[] {
  return loadYieldLinks(branchId).filter((l) => l.active !== false)
}

export function saveYieldLinks(rows: YieldLink[], branchId = getActiveBranchId()) {
  const scoped = rows
    .map((r) => normalizeYieldLink({ ...r, branchId: r.branchId ?? branchId }))
    .filter((r) => !isSeedYieldLink(r) && r.branchId === branchId)
  const others = loadAllYieldLinks().filter(
    (r) => r.branchId && r.branchId !== branchId && !isSeedYieldLink(r),
  )
  tenantSetItem(YIELD_LINKS_KEY, JSON.stringify([...others, ...scoped]))
  window.dispatchEvent(new Event(YIELD_LINKS_CHANGED))
}

export function upsertYieldLink(row: YieldLink, branchId = getActiveBranchId()) {
  if (isSeedYieldLink(row)) return
  const doc = normalizeYieldLink({ ...row, branchId })
  const rows = loadYieldLinks(branchId)
  saveYieldLinks([doc, ...rows.filter((r) => r.id !== doc.id)], branchId)
}

export function deleteYieldLink(id: string, branchId = getActiveBranchId()) {
  saveYieldLinks(
    loadYieldLinks(branchId).filter((r) => r.id !== id),
    branchId,
  )
}

export function isYieldPairTaken(
  rows: YieldLink[],
  fromSku: string,
  toSku: string,
  excludeId?: string,
): boolean {
  return rows.some(
    (r) => r.fromSku === fromSku && r.toSku === toSku && r.id !== excludeId,
  )
}

export function yieldConversionsForStock(
  stock: StockItem[],
  branchId = getActiveBranchId(),
): YieldConversion[] {
  const bySku = new Map(stock.map((s) => [s.sku, s]))
  const out: YieldConversion[] = []
  for (const link of activeYieldLinks(branchId)) {
    const from = bySku.get(link.fromSku)
    const to = bySku.get(link.toSku)
    if (!from || !to) continue
    if (from.unit !== to.unit) continue
    if (from.id === to.id) continue
    out.push({ link, from, to })
  }
  return out.sort((a, b) => a.link.label.localeCompare(b.link.label))
}

export function findYieldLink(
  fromSku: string,
  toSku: string,
  branchId = getActiveBranchId(),
): YieldLink | undefined {
  return activeYieldLinks(branchId).find((l) => l.fromSku === fromSku && l.toSku === toSku)
}

export function conversionLabel(c: YieldConversion): string {
  return `${c.from.name} → ${c.to.name} (${c.link.defaultYieldPct}% yield)`
}

export function stockSkuOptions(stock: StockItem[]) {
  return stock
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      value: s.sku,
      label: `${s.name} · ${s.sku} (${s.unit})`,
    }))
}
