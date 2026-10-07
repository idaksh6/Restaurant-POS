import { useCallback, useEffect, useRef, useState } from 'react'
import type { PrintStation } from '../data/printers'
import {
  checkPrinters,
  getAgentStatus,
  syncAgentPrinters,
  usesAgent,
  type AgentError,
  type AgentStatus,
  type PrinterHealthResult,
} from '../hardware/printAgent'

const POLL_MS = 20_000

export type PrinterHealthState = {
  agent: AgentStatus | null
  agentError: AgentError | null
  /** First agent probe still running */
  agentChecking: boolean
  health: Map<string, PrinterHealthResult>
  checking: boolean
  refresh: () => Promise<void>
}

/** Agent status + per-printer health for the printers shown on screen (polled). */
export function usePrinterHealth(printers: PrintStation[], enabled = true): PrinterHealthState {
  const [agent, setAgent] = useState<AgentStatus | null>(null)
  const [agentError, setAgentError] = useState<AgentError | null>(null)
  const [agentChecking, setAgentChecking] = useState(true)
  const [health, setHealth] = useState<Map<string, PrinterHealthResult>>(new Map())
  const [checking, setChecking] = useState(false)
  const printersRef = useRef(printers)
  printersRef.current = printers
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setChecking(true)
    try {
      const { status, error } = await getAgentStatus()
      setAgent(status ?? null)
      setAgentError(error ?? null)
      if (!status) {
        setHealth(new Map())
        return
      }
      const list = printersRef.current
      void syncAgentPrinters(list)
      const active = list.filter((p) => p.active && usesAgent(p))
      const { results } = await checkPrinters(active)
      setHealth(new Map(results.map((r) => [r.id, r])))
    } finally {
      busy.current = false
      setChecking(false)
      setAgentChecking(false)
    }
  }, [])

  const signature = printers
    .map((p) => `${p.id}|${p.active}|${p.connection}|${p.target}|${p.host}|${p.port}|${p.options.printMode}`)
    .join(';')

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, refresh, signature])

  return { agent, agentError, agentChecking, health, checking, refresh }
}
