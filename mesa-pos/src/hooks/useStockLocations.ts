import { useEffect, useState } from 'react'
import {
  activeStockLocations,
  STOCK_LOCATIONS_CHANGED,
  type StockLocation,
} from '../data/stockLocations'

export function useStockLocations(): StockLocation[] {
  const [rows, setRows] = useState<StockLocation[]>(() => activeStockLocations())

  useEffect(() => {
    const refresh = () => setRows(activeStockLocations())
    refresh()
    window.addEventListener(STOCK_LOCATIONS_CHANGED, refresh)
    return () => window.removeEventListener(STOCK_LOCATIONS_CHANGED, refresh)
  }, [])

  return rows
}
