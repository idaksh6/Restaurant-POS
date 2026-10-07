import { loadBranches, type Branch } from '../data/company'

/** Head Office / HQ — not a store floor; inventory lives on restaurant branches. */
export function isHeadOfficeBranch(branch: Pick<Branch, 'code' | 'name'> | null | undefined): boolean {
  if (!branch) return false
  const code = (branch.code || '').trim().toUpperCase()
  const name = (branch.name || '').trim().toLowerCase()
  return (
    code === 'H001' ||
    code === 'HO' ||
    code === 'HQ' ||
    code === 'HEAD' ||
    name.includes('head office') ||
    name.includes('headoffice') ||
    name === 'hq'
  )
}

export function isHeadOfficeBranchId(branchId: string | null | undefined): boolean {
  if (!branchId) return false
  return isHeadOfficeBranch(loadBranches().find((b) => b.id === branchId))
}

/** Only rows stamped for this branch (no company-wide / null leakage). */
export function stockForBranch<T extends { branchId?: string | null }>(
  rows: T[],
  branchId: string,
): T[] {
  return rows.filter((r) => r.branchId === branchId)
}

/** Stable per-branch stock id so HO and restaurant never share one DB row. */
export function scopedStockId(id: string, branchId: string): string {
  const raw = String(id || '').trim()
  if (!raw || !branchId) return raw
  if (raw.startsWith(`${branchId}:`)) return raw
  const bare = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw
  return `${branchId}:${bare}`
}
