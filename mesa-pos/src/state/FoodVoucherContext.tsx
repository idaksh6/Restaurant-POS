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
import { apiMastersReady, apiPutFoodVoucher } from '../lib/apiMasters'
import { useAuth } from './AuthContext'
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
  const { syncEpoch } = useSync()
  const [batches, setBatches] = useState<FoodVoucherBatch[]>(() => loadBatches())
  const [codes, setCodes] = useState<FoodVoucherCode[]>(() => loadCodes())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const localBatches = loadBatches()
      const localCodes = loadCodes()
      setBatches(localBatches)
      setCodes(localCodes)
      if (!apiMastersReady()) return
      try {
        const remote = await hydrateFoodVouchersFromApi()
        if (cancelled) return
        // Never replace non-empty local with empty remote — and re-push so DB catches up.
        if (!remote.batches.length && !remote.codes.length && (localBatches.length || localCodes.length)) {
          for (const batch of localBatches) {
            const scoped = localCodes.filter((c) => c.batchId === batch.id)
            void apiPutFoodVoucher({ batch, codes: scoped }).catch(() => undefined)
          }
          return
        }
        setBatches(remote.batches)
        setCodes(remote.codes)
      } catch {
        /* keep the local cache */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, companyId, syncEpoch])

  const saveBatch = useCallback((batch: FoodVoucherBatch, isNew: boolean) => {
    const created = isNew ? generateCodesForBatch(batch, codes) : undefined
    const next = saveFoodVoucherBatch(batch, batches, codes, created)
    setBatches(next.batches)
    setCodes(next.codes)
    return created ?? []
  }, [batches, codes])

  const removeBatch = useCallback((id: string) => {
    const next = deleteFoodVoucherBatch(id, batches, codes)
    setBatches(next.batches)
    setCodes(next.codes)
  }, [batches, codes])

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
