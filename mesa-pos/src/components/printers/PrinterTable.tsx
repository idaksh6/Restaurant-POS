import { useEffect, useRef, useState } from 'react'
import type { PrintPurpose, PrintStation } from '../../data/printers'
import type { AgentError, PrinterHealthResult } from '../../hardware/printAgent'
import PrinterStatusBadge, { printerStatusView } from './PrinterStatusBadge'

const PURPOSE_LABEL: Record<PrintPurpose, string> = { kot: 'KOT', bill: 'Bill', receipt: 'Receipt' }
const CONNECTION_LABEL: Record<PrintStation['connection'], string> = {
  usb: 'USB',
  lan: 'LAN',
  wifi: 'Wi-Fi',
  browser: 'Print dialog',
}

export function printerDevice(p: PrintStation) {
  if (p.connection === 'lan' || p.connection === 'wifi') return `${p.host ?? '—'}:${p.port ?? 9100}`
  if (p.connection === 'usb') return p.target || '—'
  return 'Chosen when printing'
}

function RowMenu({
  printer,
  testing,
  onEdit,
  onTest,
  onToggle,
  onDelete,
}: {
  printer: PrintStation
  testing: boolean
  onEdit: () => void
  onTest: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const pick = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  return (
    <div className="zk-pm-actions" ref={ref}>
      <button type="button" className="zk-pm-icon-btn" onClick={onEdit} title="Edit printer" aria-label={`Edit ${printer.name}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>
      </button>
      <button
        type="button"
        className="zk-pm-icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${printer.name}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
      </button>
      {open ? (
        <div className="zk-pm-menu" role="menu">
          <button type="button" role="menuitem" onClick={pick(onEdit)}>Edit</button>
          <button type="button" role="menuitem" onClick={pick(onTest)} disabled={testing || !printer.active}>
            {testing ? 'Sending test print…' : 'Test print'}
          </button>
          <button type="button" role="menuitem" onClick={pick(onToggle)}>{printer.active ? 'Disable' : 'Enable'}</button>
          <button type="button" role="menuitem" className="danger" onClick={pick(onDelete)}>Delete</button>
        </div>
      ) : null}
    </div>
  )
}

export default function PrinterTable({
  printers,
  health,
  agentError,
  agentChecking,
  testingId,
  onEdit,
  onTest,
  onToggle,
  onDelete,
}: {
  printers: PrintStation[]
  health: Map<string, PrinterHealthResult>
  agentError: AgentError | null
  agentChecking: boolean
  testingId: string | null
  onEdit: (p: PrintStation) => void
  onTest: (p: PrintStation) => void
  onToggle: (p: PrintStation) => void
  onDelete: (p: PrintStation) => void
}) {
  return (
    <div className="zk-pm-table" role="table" aria-label="Printers">
      <div className="zk-pm-tr zk-pm-thead" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Printer name</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Connection</span>
        <span role="columnheader">IP / Device</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Default</span>
        <span role="columnheader" className="zk-pm-col-actions">Actions</span>
      </div>
      {printers.map((p, i) => {
        const view = printerStatusView(p, { health: health.get(p.id), agentError, agentChecking })
        return (
          <div key={p.id} className={`zk-pm-tr${p.active ? '' : ' is-off'}`} role="row">
            <span className="zk-pm-num" role="cell">{i + 1}</span>
            <span className="zk-pm-name" role="cell">
              <strong>{p.name}</strong>
            </span>
            <span className="zk-pm-types" role="cell">
              {p.purposes.map((x) => (
                <span key={x} className={`zk-pm-chip is-${x}`}>{PURPOSE_LABEL[x]}</span>
              ))}
            </span>
            <span className="zk-pm-cell" role="cell" data-label="Connection">{CONNECTION_LABEL[p.connection]}</span>
            <span className="zk-pm-cell zk-pm-device" role="cell" data-label="IP / Device" title={printerDevice(p)}>
              {printerDevice(p)}
            </span>
            <span className="zk-pm-cell" role="cell" data-label="Status">
              <PrinterStatusBadge {...view} showDetail={view.tone === 'offline'} />
            </span>
            <span className="zk-pm-cell" role="cell" data-label="Default">
              {p.isDefault ? <span className="zk-pm-default">Default</span> : <span className="zk-pm-muted">—</span>}
            </span>
            <span className="zk-pm-col-actions" role="cell">
              <RowMenu
                printer={p}
                testing={testingId === p.id}
                onEdit={() => onEdit(p)}
                onTest={() => onTest(p)}
                onToggle={() => onToggle(p)}
                onDelete={() => onDelete(p)}
              />
            </span>
          </div>
        )
      })}
    </div>
  )
}
