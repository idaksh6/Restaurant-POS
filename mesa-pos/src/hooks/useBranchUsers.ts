import { useEffect, useMemo, useState } from 'react'
import {
  isSeedManagedUser,
  loadManagedUsers,
  mergeRemoteUsers,
  saveManagedUsers,
  type ManagedUser,
} from '../data/staffUsers'
import { apiAccessReady, apiListUsers, syncCompanyRoles } from '../lib/apiAccess'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { accessOutboxOverlay } from '../sync/accessOutbox'
import { useSync } from '../sync/SyncContext'

function activeBranchUsers(rows: ManagedUser[], activeBranchId: string) {
  return rows.filter(
    (r) => r.active && (r.role === 'admin' || !r.branchId || r.branchId === activeBranchId),
  )
}

/** Company users for the active branch — synced from API when online (same source as Users page). */
export function useBranchUsers() {
  const { companyId } = useAuth()
  const { activeBranchId } = useBranch()
  const { syncEpoch } = useSync()
  const cid = companyId ?? 'co-mesa'
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    setReady(false)

    async function load() {
      const overlay = accessOutboxOverlay()
      if (!apiAccessReady()) {
        if (!alive) return
        setUsers(activeBranchUsers(mergeRemoteUsers(loadManagedUsers(cid), [], overlay.pendingUsers), activeBranchId))
        setReady(true)
        return
      }
      try {
        await syncCompanyRoles(cid)
        const remote = await apiListUsers(activeBranchId)
        if (!alive) return
        const mapped = remote.map((u) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          nameAr: u.nameAr ?? '',
          role: u.role,
          branchId: u.branchId ?? null,
          active: u.active,
          companyId: u.companyId ?? cid,
        }))
        const prev = loadManagedUsers(cid).filter((r) => !isSeedManagedUser(r))
        const merged = mergeRemoteUsers(prev, mapped, overlay.pendingUsers)
        saveManagedUsers(cid, merged)
        setUsers(activeBranchUsers(merged, activeBranchId))
      } catch {
        if (!alive) return
        setUsers(
          activeBranchUsers(
            mergeRemoteUsers(
              loadManagedUsers(cid).filter((r) => !isSeedManagedUser(r)),
              [],
              overlay.pendingUsers,
            ),
            activeBranchId,
          ),
        )
      } finally {
        if (alive) setReady(true)
      }
    }

    void load()

    const onUsers = () => {
      if (!alive) return
      const local = loadManagedUsers(cid).filter((r) => r.active && !isSeedManagedUser(r))
      setUsers(activeBranchUsers(local, activeBranchId))
    }
    window.addEventListener('mesa:users-changed', onUsers)
    return () => {
      alive = false
      window.removeEventListener('mesa:users-changed', onUsers)
    }
  }, [cid, activeBranchId, syncEpoch])

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const byName = useMemo(
    () => new Map(users.map((u) => [u.name.trim().toLowerCase(), u])),
    [users],
  )

  return { users, ready, companyId: cid, byId, byName }
}
