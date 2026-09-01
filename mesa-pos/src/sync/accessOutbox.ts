import type { ManagedRole } from '../auth/roles'
import type { ManagedUser } from '../data/staffUsers'
import { loadOutbox } from './outbox'

export function accessOutboxOverlay() {
  const live = loadOutbox().filter((o) => o.status === 'pending' || o.status === 'syncing')
  const pendingUsers = live
    .filter((o) => o.type === 'user.upsert')
    .map((o) => o.payload as ManagedUser)
    .filter((u) => u?.id || u?.username)
  const pendingRoles = live
    .filter((o) => o.type === 'role.upsert')
    .map((o) => o.payload as ManagedRole)
    .filter((r) => r?.id || r?.key)
  const pendingRoleDeletes = live.filter((o) => o.type === 'role.delete').map((o) => o.entityId)
  return { pendingUsers, pendingRoles, pendingRoleDeletes }
}
