import { useEffect, useState } from 'react'
import { loadYieldLinks, YIELD_LINKS_CHANGED, type YieldLink } from '../data/stockYieldLinks'
import { useBranch } from '../state/BranchContext'

export function useYieldLinks(): YieldLink[] {
  const { activeBranchId } = useBranch()
  const [rows, setRows] = useState<YieldLink[]>(() => loadYieldLinks(activeBranchId))

  useEffect(() => {
    const refresh = () => setRows(loadYieldLinks(activeBranchId))
    refresh()
    window.addEventListener(YIELD_LINKS_CHANGED, refresh)
    return () => window.removeEventListener(YIELD_LINKS_CHANGED, refresh)
  }, [activeBranchId])

  return rows
}
