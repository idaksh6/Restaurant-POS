import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getActiveBranchId } from '../data/company'
import {
  loadTimePunches,
  openPunchForUser,
  punchesForBranch,
  saveTimePunches,
  type TimePunch,
} from '../data/timeClock'
import { useBranch } from './BranchContext'

type TimeClockValue = {
  punches: TimePunch[]
  getOpenPunch: (userId: string) => TimePunch | null
  clockIn: (userId: string, userName: string, note?: string) => { ok: boolean; message: string }
  clockOut: (userId: string) => { ok: boolean; message: string }
  reload: () => void
}

const TimeClockContext = createContext<TimeClockValue | null>(null)

export function TimeClockProvider({ children }: { children: ReactNode }) {
  const { activeBranchId } = useBranch()
  const [all, setAll] = useState<TimePunch[]>(() => loadTimePunches())

  const reload = useCallback(() => setAll(loadTimePunches()), [])

  const punches = useMemo(
    () => punchesForBranch(all, activeBranchId),
    [all, activeBranchId],
  )

  const getOpenPunch = useCallback(
    (userId: string) => punches.find((p) => p.userId === userId && !p.clockOutAt) ?? null,
    [punches],
  )

  const clockIn = useCallback((userId: string, userName: string, note?: string) => {
    const branchId = getActiveBranchId()
    const rows = loadTimePunches()
    if (openPunchForUser(rows, userId, branchId)) {
      return { ok: false, message: 'Already clocked in' }
    }
    const punch: TimePunch = {
      id: `tp-${Date.now()}`,
      userId,
      userName,
      branchId,
      clockInAt: new Date().toISOString(),
      note,
    }
    const next = [punch, ...rows]
    saveTimePunches(next)
    setAll(next)
    return { ok: true, message: `Clocked in · ${userName}` }
  }, [])

  const clockOut = useCallback((userId: string) => {
    const branchId = getActiveBranchId()
    const rows = loadTimePunches()
    const open = openPunchForUser(rows, userId, branchId)
    if (!open) return { ok: false, message: 'Not clocked in' }
    const next = rows.map((p) =>
      p.id === open.id ? { ...p, clockOutAt: new Date().toISOString() } : p,
    )
    saveTimePunches(next)
    setAll(next)
    return { ok: true, message: 'Clocked out' }
  }, [])

  const value = useMemo(
    () => ({ punches, getOpenPunch, clockIn, clockOut, reload }),
    [punches, getOpenPunch, clockIn, clockOut, reload],
  )

  return <TimeClockContext.Provider value={value}>{children}</TimeClockContext.Provider>
}

export function useTimeClock() {
  const ctx = useContext(TimeClockContext)
  if (!ctx) throw new Error('useTimeClock must be used within TimeClockProvider')
  return ctx
}
