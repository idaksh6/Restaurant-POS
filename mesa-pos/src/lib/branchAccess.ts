import type { Branch } from '../data/company'

/** Branches the signed-in user may select. Admin / null branchId = all active branches. */
export function branchesForUser(
  branches: Branch[],
  userBranchId?: string | null,
  role?: string | null,
): Branch[] {
  const active = branches.filter((b) => b.active)
  if (role === 'admin') return active
  const scoped = userBranchId?.trim()
  if (!scoped) return active
  const match = branches.filter((b) => b.id === scoped)
  return match.length ? match : active
}
