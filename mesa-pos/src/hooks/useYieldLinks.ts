import { useEffect, useState } from 'react'
import { loadYieldLinks, YIELD_LINKS_CHANGED, type YieldLink } from '../data/stockYieldLinks'

export function useYieldLinks(): YieldLink[] {
  const [rows, setRows] = useState<YieldLink[]>(() => loadYieldLinks())

  useEffect(() => {
    const refresh = () => setRows(loadYieldLinks())
    refresh()
    window.addEventListener(YIELD_LINKS_CHANGED, refresh)
    return () => window.removeEventListener(YIELD_LINKS_CHANGED, refresh)
  }, [])

  return rows
}
