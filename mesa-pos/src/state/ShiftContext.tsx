import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getActiveBranchId } from '../data/company'
import {
  fromApiShift,
  loadAllShifts,
  mergeRemoteShifts,
  saveAllShifts,
  shiftsForBranch,
  type ShiftRecord,
} from '../data/shifts'
import { apiListShifts, apiMastersReady, apiPutShift } from '../lib/apiMasters'
import { useAuth } from './AuthContext'
import { useBranch } from './BranchContext'
import { getDeviceId } from '../sync/deviceId'
import { enqueueOutbox, dropPendingUpsertsFor, loadOutbox } from '../sync/outbox'
import { useSync } from '../sync/SyncContext'

export type { ShiftRecord }

type ShiftContextValue = {
  activeShift: ShiftRecord | null
  history: ShiftRecord[]
  openShift: (userId: string, userName: string, floatAmount: number) => void
  addCashIn: (amount: number) => void
  closeShift: (countedCash: number) => { ok: boolean; message: string; variance?: number }
}

const ShiftContext = createContext<ShiftContextValue | null>(null)

function persist(next: ShiftRecord[], row?: ShiftRecord) {
  saveAllShifts(next)
  if (!row) return
  if (apiMastersReady()) {
    void apiPutShift(row)
      .then(() => dropPendingUpsertsFor(row.id, 'shift.upsert'))
      .catch(() => enqueueOutbox('shift.upsert', row.id, row, getDeviceId(), row.branchId))
  } else {
    enqueueOutbox('shift.upsert', row.id, row, getDeviceId(), row.branchId)
  }
}

export function ShiftProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const { activeBranchId } = useBranch()
  const { syncEpoch } = useSync()
  const [all, setAll] = useState<ShiftRecord[]>(() => loadAllShifts())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const branchId = getActiveBranchId()
      setAll(loadAllShifts())
      if (!apiMastersReady()) return
      try {
        const remote = (await apiListShifts(branchId)) as Record<string, unknown>[]
        if (cancelled) return
        const pending = loadOutbox()
          .filter((o) => o.type === 'shift.upsert' && (o.status === 'pending' || o.status === 'syncing'))
          .map((o) => o.payload as ShiftRecord)
        const merged = mergeRemoteShifts(loadAllShifts(), remote.map(fromApiShift), branchId, pending)
        saveAllShifts(merged)
        setAll(merged)
      } catch {
        /* keep local cache */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, syncEpoch, activeBranchId])

  const history = useMemo(() => shiftsForBranch(all, activeBranchId), [all, activeBranchId])
  const activeShift = history.find((s) => s.open) ?? null

  const openShift = useCallback((userId: string, userName: string, floatAmount: number) => {
    const branchId = getActiveBranchId()
    setAll((prev) => {
      if (shiftsForBranch(prev, branchId).some((s) => s.open)) return prev
      const row: ShiftRecord = {
        id: `sh-${Date.now()}`,
        branchId,
        userId,
        userName,
        openedAt: new Date().toISOString(),
        floatAmount,
        cashIn: 0,
        open: true,
      }
      const next = [row, ...prev]
      persist(next, row)
      return next
    })
  }, [])

  const addCashIn = useCallback((amount: number) => {
    if (amount <= 0) return
    const branchId = getActiveBranchId()
    setAll((prev) => {
      let updated: ShiftRecord | undefined
      const next = prev.map((s) => {
        if (!s.open || (s.branchId && s.branchId !== branchId)) return s
        updated = { ...s, branchId: s.branchId ?? branchId, cashIn: s.cashIn + amount }
        return updated
      })
      if (updated) persist(next, updated)
      return next
    })
  }, [])

  const closeShift = useCallback((countedCash: number) => {
    let variance = 0
    let ok = false
    const branchId = getActiveBranchId()
    setAll((prev) => {
      const active = shiftsForBranch(prev, branchId).find((s) => s.open)
      if (!active) return prev
      const expected = active.floatAmount + active.cashIn
      variance = Math.round((countedCash - expected) * 100) / 100
      ok = true
      const closed: ShiftRecord = {
        ...active,
        branchId: active.branchId ?? branchId,
        open: false,
        closedAt: new Date().toISOString(),
        countedCash,
        variance,
      }
      const next = prev.map((s) => (s.id === active.id ? closed : s))
      persist(next, closed)
      return next
    })
    return ok
      ? { ok: true, message: `Shift closed · variance ${variance.toFixed(2)}`, variance }
      : { ok: false, message: 'No open shift' }
  }, [])

  const value = useMemo(
    () => ({ activeShift, history, openShift, addCashIn, closeShift }),
    [activeShift, history, openShift, addCashIn, closeShift],
  )

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>
}

export function useShift() {
  const ctx = useContext(ShiftContext)
  if (!ctx) throw new Error('useShift must be used within ShiftProvider')
  return ctx
}
