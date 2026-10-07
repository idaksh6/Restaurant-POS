import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  deleteFoodVoucherBatch,
  generateCodesForBatch,
  hydrateFoodVouchersFromApi,
  loadBatches,
  loadCodes,
  saveFoodVoucherBatch,
  type FoodVoucherBatch,
  type FoodVoucherCode,
} from '../data/foodVouchers'
import { apiMastersReady } from '../lib/apiMasters'
import { useAuth } from './AuthContext'
import { useBranch } from './BranchContext'
import { useSync } from '../sync/SyncContext'

type FoodVoucherContextValue = {
  batches: FoodVoucherBatch[]
  codes: FoodVoucherCode[]
  saveBatch: (batch: FoodVoucherBatch, isNew: boolean) => FoodVoucherCode[]
  removeBatch: (id: string) => void
}

const FoodVoucherContext = createContext<FoodVoucherContextValue | null>(null)

export function FoodVoucherProvider({ children }: { children: ReactNode }) {
  const { token, companyId } = useAuth()
  const { activeBranchId } = useBranch()
  const { syncEpoch } = useSync()
  const [batches, setBatches] = useState<FoodVoucherBatch[]>(() => loadBatches(activeBranchId))
  const [codes, setCodes] = useState<FoodVoucherCode[]>(() => loadCodes(activeBranchId))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const localBatches = loadBatches(activeBranchId)
      const localCodes = loadCodes(activeBranchId)
      setBatches(localBatches)
      setCodes(localCodes)
      if (!apiMastersReady()) return
      try {
        const remote = await hydrateFoodVouchersFromApi(activeBranchId)
        if (cancelled) return
        setBatches(remote.batches)
        setCodes(remote.codes)
      } catch {
        /* keep the local cache */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, companyId, syncEpoch, activeBranchId])

  const saveBatch = useCallback(
    (batch: FoodVoucherBatch, isNew: boolean) => {
      const stamped = { ...batch, branchId: batch.branchId ?? activeBranchId }
      const created = isNew ? generateCodesForBatch(stamped, codes) : undefined
      const next = saveFoodVoucherBatch(stamped, batches, codes, created, activeBranchId)
      setBatches(next.batches)
      setCodes(next.codes)
      return created ?? []
    },
    [batches, codes, activeBranchId],
  )

  const removeBatch = useCallback(
    (id: string) => {
      const next = deleteFoodVoucherBatch(id, batches, codes, activeBranchId)
      setBatches(next.batches)
      setCodes(next.codes)
    },
    [batches, codes, activeBranchId],
  )

  const value = useMemo(
    () => ({ batches, codes, saveBatch, removeBatch }),
    [batches, codes, saveBatch, removeBatch],
  )

  return <FoodVoucherContext.Provider value={value}>{children}</FoodVoucherContext.Provider>
}

export function useFoodVouchers() {
  const ctx = useContext(FoodVoucherContext)
  if (!ctx) throw new Error('useFoodVouchers must be used within FoodVoucherProvider')
  return ctx
}
