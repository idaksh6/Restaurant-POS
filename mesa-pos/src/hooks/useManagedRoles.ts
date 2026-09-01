import { useEffect, useState } from 'react'
import { loadManagedRoles, type ManagedRole } from '../auth/roles'
import { apiAccessReady, syncCompanyRoles } from '../lib/apiAccess'

/** Roles for the company — shows cached roles immediately, refreshes in the background. */
export function useManagedRoles(companyId: string) {
  const cid = companyId || 'co-mesa'
  const [roles, setRoles] = useState<ManagedRole[]>(() => loadManagedRoles(cid))
  const [loading, setLoading] = useState(() => loadManagedRoles(cid).length === 0)

  useEffect(() => {
    let alive = true
    const cached = loadManagedRoles(cid)
    if (cached.length) {
      setRoles(cached)
      setLoading(false)
    }

    async function refresh() {
      try {
        const next = await syncCompanyRoles(cid)
        if (alive) {
          setRoles(next)
          setLoading(false)
        }
      } catch {
        if (alive) {
          setRoles(loadManagedRoles(cid))
          setLoading(false)
        }
      }
    }

    void refresh()

    const onLocal = () => {
      if (!alive) return
      const local = loadManagedRoles(cid)
      setRoles(local)
      if (local.length) setLoading(false)
    }

    const onRemote = () => {
      if (!alive) return
      void syncCompanyRoles(cid)
        .then((next) => {
          if (alive) setRoles(next)
        })
        .catch(() => {
          if (alive) setRoles(loadManagedRoles(cid))
        })
    }

    window.addEventListener('mesa:roles-changed', onLocal)
    window.addEventListener('mesa:access-refresh', onRemote)
    return () => {
      alive = false
      window.removeEventListener('mesa:roles-changed', onLocal)
      window.removeEventListener('mesa:access-refresh', onRemote)
    }
  }, [cid])

  return { roles, loading, apiOnline: apiAccessReady() }
}
