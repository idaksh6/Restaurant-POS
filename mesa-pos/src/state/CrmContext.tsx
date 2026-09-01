import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { customersRepo, isDemoGuest } from '../data/repos/customersRepo'
import { migrateLocalStorageToDexie } from '../data/repos/db'
import {
  apiListCustomers,
  apiMastersReady,
  apiPutCustomer,
  type ApiCustomer,
} from '../lib/apiMasters'
import { enqueueOutbox, dropPendingUpsertsFor } from '../sync/outbox'
import { getDeviceId } from '../sync/deviceId'
import { getActiveBranchId } from '../data/company'
import { useAuth } from './AuthContext'
import { useBranch } from './BranchContext'
import { useSync } from '../sync/SyncContext'

export type CrmCustomer = {
  id: string
  companyId?: string
  branchId?: string
  name: string
  phone: string
  address?: string
  email?: string
  visits: number
  spent: number
  points: number
  lastVisit: string
}

type CrmContextValue = {
  customers: CrmCustomer[]
  earnPoints: (customerId: string, totalSar: number) => number
  redeemPoints: (customerId: string, points: number) => { ok: boolean; valueSar: number }
  addVisit: (customerId: string, spent: number) => void
  upsertCustomer: (input: {
    id?: string
    name: string
    phone: string
    address?: string
    email?: string
  }) => CrmCustomer
}

const POINTS_PER_SAR = 1
const SAR_PER_POINT = 0.1

const CrmContext = createContext<CrmContextValue | null>(null)

function fromApi(row: ApiCustomer): CrmCustomer {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId ?? undefined,
    name: row.name,
    phone: row.phone,
    address: row.address ?? undefined,
    email: row.email ?? undefined,
    visits: row.visits,
    spent: row.spent,
    points: row.points,
    lastVisit: row.updatedAt ?? '—',
  }
}

function pushCustomer(row: CrmCustomer) {
  if (isDemoGuest(row)) return
  const branchId = row.branchId ?? getActiveBranchId()
  const stamped = { ...row, branchId }
  if (apiMastersReady()) {
    void apiPutCustomer(stamped)
      .then(() => dropPendingUpsertsFor(stamped.id, 'customer.upsert'))
      .catch(() => enqueueOutbox('customer.upsert', stamped.id, stamped, getDeviceId(), branchId))
  } else {
    enqueueOutbox('customer.upsert', stamped.id, stamped, getDeviceId(), branchId)
  }
}

export function CrmProvider({ children }: { children: ReactNode }) {
  const { companyId, token } = useAuth()
  const { activeBranchId } = useBranch()
  const { syncEpoch } = useSync()
  const cid = companyId ?? 'co-mesa'
  const [customers, setCustomers] = useState<CrmCustomer[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await migrateLocalStorageToDexie()
      await customersRepo.purgeDemoGuests(cid)
      const branchId = getActiveBranchId()
      const local = await customersRepo.list(cid, branchId)
      if (cancelled) return
      setCustomers(local)

      if (!apiMastersReady()) return
      try {
        const remote = (await apiListCustomers(branchId)).map(fromApi).filter((c) => !isDemoGuest(c))
        if (cancelled) return
        await customersRepo.saveAll(cid, remote, branchId)
        if (!cancelled) setCustomers(remote)
      } catch {
        /* stay on the local Dexie list */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cid, token, syncEpoch, activeBranchId])

  const earnPoints = useCallback((customerId: string, totalSar: number) => {
    const pts = Math.floor(totalSar * POINTS_PER_SAR)
    setCustomers((prev) => {
      const next = prev.map((c) =>
        c.id === customerId
          ? {
              ...c,
              points: c.points + pts,
              spent: c.spent + totalSar,
              visits: c.visits + 1,
              lastVisit: new Date().toISOString(),
            }
          : c,
      )
      void customersRepo.saveAll(cid, next, getActiveBranchId())
      const row = next.find((c) => c.id === customerId)
      if (row) pushCustomer(row)
      return next
    })
    return pts
  }, [cid])

  const redeemPoints = useCallback((customerId: string, points: number) => {
    let valueSar = 0
    let ok = false
    setCustomers((prev) => {
      const cust = prev.find((c) => c.id === customerId)
      if (!cust || points <= 0 || points > cust.points) return prev
      valueSar = Math.round(points * SAR_PER_POINT * 100) / 100
      ok = true
      const next = prev.map((c) =>
        c.id === customerId ? { ...c, points: c.points - points } : c,
      )
      void customersRepo.saveAll(cid, next, getActiveBranchId())
      const row = next.find((c) => c.id === customerId)
      if (row) pushCustomer(row)
      return next
    })
    return { ok, valueSar }
  }, [cid])

  const addVisit = useCallback((customerId: string, spent: number) => {
    setCustomers((prev) => {
      const next = prev.map((c) =>
        c.id === customerId
          ? { ...c, visits: c.visits + 1, spent: c.spent + spent, lastVisit: new Date().toISOString() }
          : c,
      )
      void customersRepo.saveAll(cid, next, getActiveBranchId())
      const row = next.find((c) => c.id === customerId)
      if (row) pushCustomer(row)
      return next
    })
  }, [cid])

  const upsertCustomer = useCallback(
    (input: { id?: string; name: string; phone: string; address?: string; email?: string }) => {
      const name = input.name.trim()
      const phone = input.phone.trim()
      const email = input.email?.trim() || undefined
      const address = input.address?.trim() || undefined
      let saved: CrmCustomer = {
        id: input.id ?? `c-${Date.now()}`,
        companyId: cid,
        branchId: getActiveBranchId(),
        name,
        phone,
        address,
        email,
        visits: 0,
        spent: 0,
        points: 0,
        lastVisit: '—',
      }
      setCustomers((prev) => {
        const byId = input.id ? prev.find((c) => c.id === input.id) : undefined
        const byPhone =
          !byId && phone
            ? prev.find((c) => c.phone.replace(/\s/g, '') === phone.replace(/\s/g, ''))
            : undefined
        const existing = byId ?? byPhone
        let next: CrmCustomer[]
        if (existing) {
          next = prev.map((c) => {
            if (c.id !== existing.id) return c
            saved = {
              ...c,
              companyId: cid,
              branchId: c.branchId ?? getActiveBranchId(),
              name,
              phone: phone || c.phone,
              address: address ?? c.address,
              email: email ?? c.email,
            }
            return saved
          })
        } else {
          next = [saved, ...prev]
        }
        void customersRepo.saveAll(cid, next, getActiveBranchId())
        pushCustomer(saved)
        return next
      })
      return saved
    },
    [cid],
  )

  const value = useMemo(
    () => ({ customers, earnPoints, redeemPoints, addVisit, upsertCustomer }),
    [cid, customers, earnPoints, redeemPoints, addVisit, upsertCustomer],
  )

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>
}

export function useCrm() {
  const ctx = useContext(CrmContext)
  if (!ctx) throw new Error('useCrm must be used within CrmProvider')
  return ctx
}

export { POINTS_PER_SAR, SAR_PER_POINT }
