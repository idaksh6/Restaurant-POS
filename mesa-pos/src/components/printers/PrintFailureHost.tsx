import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { hasPurpose, printersForBranch, type PrintPurpose, type PrintStation } from '../../data/printers'
import { printBrowserDocument } from '../../hardware/printer'
import { friendlyPrintError, syncAgentPrinters, usesAgent } from '../../hardware/printAgent'
import {
  cancelPrintFailure,
  printFailures,
  retryPrintFailure,
  subscribePrintFailures,
  type PrintFailure,
} from '../../hardware/printFailures'
import { useBranch } from '../../state/BranchContext'
import { useCatalog } from '../../state/CatalogContext'
import { usePos } from '../../state/PosContext'

const DOC_LABEL: Record<PrintFailure['docType'], string> = {
  kot: 'Kitchen order (KOT)',
  bill: 'Bill',
  receipt: 'Receipt',
  test: 'Test print',
}

function FailureDialog({ failure, waiting, printers }: { failure: PrintFailure; waiting: number; printers: PrintStation[] }) {
  const { flash } = usePos()
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const friendly = friendlyPrintError(failure.error, failure.station.name)
  const purpose: PrintPurpose | null = failure.docType === 'test' ? null : failure.docType

  const alternatives = useMemo(
    () =>
      printers
        .filter((p) => p.active && usesAgent(p) && p.id !== failure.station.id)
        .sort((a, b) => Number(purpose ? hasPurpose(b, purpose) : 0) - Number(purpose ? hasPurpose(a, purpose) : 0)),
    [printers, failure.station.id, purpose],
  )

  async function retry(printer?: PrintStation) {
    setBusy(true)
    const res = await retryPrintFailure(failure, printer)
    setBusy(false)
    if (res.ok) {
      setPicking(false)
      flash(`✓ Printed on ${(printer ?? failure.station).name}`)
    }
  }

  async function viaDialog() {
    setBusy(true)
    let ok = true
    for (let i = 0; i < Math.max(1, failure.copies); i += 1) {
      ok = (await printBrowserDocument(failure.html, { widthMm: failure.paperWidthMm })).ok && ok
    }
    setBusy(false)
    if (ok) await cancelPrintFailure(failure)
    else flash('Print dialog was blocked by the browser', 'err')
  }

  return (
    <div className="modal-backdrop zk-pf-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="zk-pf-title" aria-describedby="zk-pf-hint">
      <div className="modal-card zk-pf-card">
        <div className="zk-pf-head">
          <span className="zk-pf-icon" aria-hidden="true">!</span>
          <div>
            <h2 id="zk-pf-title">{friendly.title}</h2>
            <p className="zk-pf-doc">
              {DOC_LABEL[failure.docType]} · {failure.ref}
            </p>
          </div>
        </div>
        <p id="zk-pf-hint" className="zk-pf-hint">{friendly.hint}</p>
        <p className="zk-pf-kept">The print is kept — nothing is lost. Choose what to do:</p>

        {picking ? (
          <div className="zk-pf-pick" role="list">
            {alternatives.map((p) => (
              <button key={p.id} type="button" role="listitem" className="zk-pf-option" disabled={busy} onClick={() => void retry(p)}>
                <strong>{p.name}</strong>
                <small>
                  {p.purposes.map((x) => x.toUpperCase()).join(' · ')} · {p.connection === 'usb' ? 'USB' : `${p.host}:${p.port ?? 9100}`}
                </small>
              </button>
            ))}
            <button type="button" role="listitem" className="zk-pf-option" disabled={busy} onClick={() => void viaDialog()}>
              <strong>Print dialog on this computer</strong>
              <small>Choose any installed printer in the browser dialog</small>
            </button>
            <button type="button" className="zk-pm-btn" onClick={() => setPicking(false)} disabled={busy}>
              Back
            </button>
          </div>
        ) : (
          <div className="zk-pf-actions">
            <button type="button" className="zk-pm-btn primary lg" onClick={() => void retry()} disabled={busy} autoFocus>
              {busy ? 'Printing…' : 'Retry'}
            </button>
            <button type="button" className="zk-pm-btn lg" onClick={() => setPicking(true)} disabled={busy}>
              Select another printer
            </button>
            <button type="button" className="zk-pm-btn lg zk-pf-cancel" onClick={() => void cancelPrintFailure(failure)} disabled={busy}>
              Cancel print
            </button>
          </div>
        )}
        {waiting > 0 ? <p className="zk-pf-more">{waiting} more print{waiting === 1 ? '' : 's'} waiting</p> : null}
      </div>
    </div>
  )
}

/** App-wide: "printer offline" dialog + keeps the local Print Agent's printer list current. */
export default function PrintFailureHost() {
  const failures = useSyncExternalStore(subscribePrintFailures, printFailures)
  const { printStations } = useCatalog()
  const { activeBranchId } = useBranch()
  const branchPrinters = useMemo(() => printersForBranch(printStations, activeBranchId), [printStations, activeBranchId])

  const agentSignature = useMemo(
    () =>
      JSON.stringify(
        branchPrinters.filter(usesAgent).map((p) => [p.id, p.name, p.active, p.connection, p.target, p.host, p.port, p.options.printMode]),
      ),
    [branchPrinters],
  )
  useEffect(() => {
    const list = branchPrinters.filter(usesAgent)
    if (!list.length) return
    const timer = window.setTimeout(() => void syncAgentPrinters(list), 1500)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSignature])

  const current = failures[0]
  if (!current) return null
  return createPortal(
    <FailureDialog key={current.id} failure={current} waiting={failures.length - 1} printers={branchPrinters} />,
    document.body,
  )
}
