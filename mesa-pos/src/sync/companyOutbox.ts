import type { Branch, CompanyProfile } from '../data/company'
import { loadOutbox } from './outbox'

export function companyOutboxOverlay() {
  const live = loadOutbox().filter((o) => o.status === 'pending' || o.status === 'syncing')
  const pendingCompany = (live.find((o) => o.type === 'company.upsert')?.payload ?? null) as
    | CompanyProfile
    | null
  const pendingBranches = live
    .filter((o) => o.type === 'branch.upsert')
    .map((o) => o.payload as Branch)
    .filter((b) => b?.id)
  const pendingDeletes = live.filter((o) => o.type === 'branch.delete').map((o) => o.entityId)
  return { pendingCompany, pendingBranches, pendingDeletes }
}
