import type { PrintStation } from '../../data/printers'
import { usesAgent, type AgentError, type PrinterHealthResult } from '../../hardware/printAgent'

export type BadgeTone = 'online' | 'offline' | 'warn' | 'idle'

export function printerStatusView(
  p: PrintStation,
  opts: { health?: PrinterHealthResult; agentError: AgentError | null; agentChecking: boolean },
): { tone: BadgeTone; label: string; detail?: string } {
  if (!p.active) return { tone: 'idle', label: 'Disabled' }
  if (!usesAgent(p)) return { tone: 'idle', label: 'Print dialog', detail: 'Printer is chosen in the browser dialog' }
  if (opts.agentChecking && !opts.health) return { tone: 'warn', label: 'Connecting' }
  if (opts.agentError) return { tone: 'idle', label: 'Unknown', detail: 'Print Agent not running on this computer' }
  const h = opts.health
  if (!h) return { tone: 'warn', label: 'Connecting' }
  switch (h.state) {
    case 'online':
      return h.detail && /low/i.test(h.detail)
        ? { tone: 'warn', label: 'Online', detail: h.detail }
        : { tone: 'online', label: 'Online', detail: h.detail }
    case 'paper-out':
      return { tone: 'offline', label: 'Paper out', detail: h.detail }
    case 'cover-open':
      return { tone: 'offline', label: 'Cover open', detail: h.detail }
    case 'offline':
      return { tone: 'offline', label: h.code === 'PRINTER_NOT_FOUND' ? 'Not found' : 'Offline', detail: h.detail }
    case 'error':
      return { tone: 'offline', label: 'Error', detail: h.detail }
    case 'connecting':
      return { tone: 'warn', label: 'Connecting' }
    default:
      return { tone: 'idle', label: 'Unknown', detail: h.detail }
  }
}

export default function PrinterStatusBadge({
  tone,
  label,
  detail,
  showDetail = false,
}: {
  tone: BadgeTone
  label: string
  detail?: string
  showDetail?: boolean
}) {
  return (
    <span className={`zk-pm-status is-${tone}`} title={detail}>
      <span className="zk-pm-status-dot" aria-hidden="true" />
      <span className="zk-pm-status-label">{label}</span>
      {showDetail && detail ? <small className="zk-pm-status-detail">{detail}</small> : null}
    </span>
  )
}
