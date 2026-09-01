import { getActiveBranchId } from './company'
import { normalizeTemplateId, type PrintTemplateId } from './printTemplates'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type PrintKind = 'receipt' | 'kot'

export type PrintStation = {
  id: string
  branchId?: string
  kind: PrintKind
  name: string
  /** browser = window.print; otherwise a named device for the native bridge */
  target: string
  copies: number
  paperWidthMm: number
  /** Layout template — scales with paperWidthMm */
  templateId: PrintTemplateId
  departmentId?: string
  header: string
  footer: string
  active: boolean
  sort?: number
}

export const PRINTERS_KEY = 'mesa-print-stations'

function asKind(value: unknown): PrintKind {
  return value === 'kot' ? 'kot' : 'receipt'
}

export function fromApiPrinter(row: Record<string, unknown>): PrintStation {
  const kind = asKind(row.kind)
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    kind,
    name: String(row.name ?? ''),
    target: String(row.target ?? 'browser') || 'browser',
    copies: Math.max(1, Number(row.copies ?? 1) || 1),
    paperWidthMm: Number(row.paperWidthMm ?? 80) || 80,
    templateId: normalizeTemplateId(row.templateId, kind),
    departmentId: row.departmentId ? String(row.departmentId) : undefined,
    header: String(row.header ?? ''),
    footer: String(row.footer ?? ''),
    active: row.active !== false,
    sort: Number(row.sort ?? 0),
  }
}

export function loadAllPrinters(): PrintStation[] {
  try {
    const raw = tenantGetItem(PRINTERS_KEY)
    const parsed = raw ? (JSON.parse(raw) as PrintStation[]) : []
    if (!Array.isArray(parsed)) return []
    const branchId = getActiveBranchId()
    return parsed.map((p) => {
      const kind = asKind(p.kind)
      return {
        ...p,
        branchId: p.branchId || branchId,
        templateId: normalizeTemplateId(p.templateId, kind),
        paperWidthMm: Number(p.paperWidthMm ?? 80) || 80,
      }
    })
  } catch {
    return []
  }
}

export function saveAllPrinters(rows: PrintStation[]) {
  tenantSetItem(PRINTERS_KEY, JSON.stringify(rows))
}

export function printersForBranch(rows: PrintStation[], branchId = getActiveBranchId()) {
  return rows.filter((p) => !p.branchId || p.branchId === branchId)
}

export function receiptStation(rows: PrintStation[], branchId = getActiveBranchId()) {
  const list = printersForBranch(rows, branchId).filter((p) => p.kind === 'receipt' && p.active)
  return [...list].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0]
}

export function kotStation(
  rows: PrintStation[],
  departmentId?: string,
  branchId = getActiveBranchId(),
) {
  const list = printersForBranch(rows, branchId).filter((p) => p.kind === 'kot' && p.active)
  if (departmentId) {
    const mapped = list.find((p) => p.departmentId === departmentId)
    if (mapped) return mapped
  }
  return list.find((p) => !p.departmentId) ?? list[0]
}
