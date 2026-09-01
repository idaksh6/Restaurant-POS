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
}

export type YieldConversion = {
  link: YieldLink
  from: StockItem
  to: StockItem
}

export const YIELD_LINKS_KEY = 'mesa-yield-links'
export const YIELD_LINKS_CHANGED = 'mesa:yield-links-changed'

export const SEED_YIELD_LINKS: YieldLink[] = [
  {
    id: 'yl-potato-fry',
    fromSku: 'PRD-POT-RAW',
    toSku: 'PRD-POT-FRY',
    defaultYieldPct: 85,
    label: 'Whole potato → fry cut',
    note: 'Peel & cut; ~15% trim waste',
    active: true,
  },
  {
    id: 'yl-paneer-portion',
    fromSku: 'DRY-PAN-BLK',
    toSku: 'DRY-PAN-CKB',
    defaultYieldPct: 100,
    label: 'Paneer block → tikka cubes',
    note: 'Portion bulk block for line cooks',
    active: true,
  },
]

function normalizeYieldLink(row: YieldLink): YieldLink {
  return {
    id: String(row.id ?? '').trim() || `yl-${Date.now()}`,
    fromSku: String(row.fromSku ?? '').trim(),
    toSku: String(row.toSku ?? '').trim(),
    defaultYieldPct: Math.min(100, Math.max(1, Math.round(Number(row.defaultYieldPct) || 100))),
    label: String(row.label ?? '').trim(),
    note: row.note?.trim() || undefined,
    active: row.active !== false,
  }
}

export function loadYieldLinks(): YieldLink[] {
  try {
    const raw = tenantGetItem(YIELD_LINKS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as YieldLink[]
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(normalizeYieldLink)
      }
    }
  } catch {
    /* use seed */
  }
  return SEED_YIELD_LINKS.map((r) => ({ ...r }))
}

export function activeYieldLinks(): YieldLink[] {
  return loadYieldLinks().filter((l) => l.active !== false)
}

export function saveYieldLinks(rows: YieldLink[]) {
  tenantSetItem(YIELD_LINKS_KEY, JSON.stringify(rows.map(normalizeYieldLink)))
  window.dispatchEvent(new Event(YIELD_LINKS_CHANGED))
}

export function upsertYieldLink(row: YieldLink) {
  const doc = normalizeYieldLink(row)
  const rows = loadYieldLinks()
  saveYieldLinks([doc, ...rows.filter((r) => r.id !== doc.id)])
}

export function deleteYieldLink(id: string) {
  saveYieldLinks(loadYieldLinks().filter((r) => r.id !== id))
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

export function yieldConversionsForStock(stock: StockItem[]): YieldConversion[] {
  const bySku = new Map(stock.map((s) => [s.sku, s]))
  const out: YieldConversion[] = []
  for (const link of activeYieldLinks()) {
    const from = bySku.get(link.fromSku)
    const to = bySku.get(link.toSku)
    if (!from || !to) continue
    if (from.unit !== to.unit) continue
    if (from.id === to.id) continue
    out.push({ link, from, to })
  }
  return out.sort((a, b) => a.link.label.localeCompare(b.link.label))
}

export function findYieldLink(fromSku: string, toSku: string): YieldLink | undefined {
  return activeYieldLinks().find((l) => l.fromSku === fromSku && l.toSku === toSku)
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
