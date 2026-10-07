/** Failed Print Agent jobs waiting for the cashier to Retry / pick another printer / Cancel. */

import type { PrintStation } from '../data/printers'
import {
  agentPrint,
  cancelAgentJob,
  retryAgentJob,
  usesAgent,
  type AgentDocType,
  type AgentError,
} from './printAgent'

export type PrintFailure = {
  id: string
  station: PrintStation
  docType: AgentDocType
  /** Short label shown to the cashier, e.g. "KOT · Table 4 · Grill" */
  ref: string
  html: string
  copies: number
  openDrawer?: boolean
  paperWidthMm: number
  /** Agent job id when the agent accepted the job (kept there as failed) */
  jobId?: string
  error: AgentError
  at: number
}

let queue: PrintFailure[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function subscribePrintFailures(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function printFailures(): PrintFailure[] {
  return queue
}

export function reportPrintFailure(f: Omit<PrintFailure, 'id' | 'at'>) {
  queue = [...queue, { ...f, id: `pf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now() }]
  emit()
}

function update(id: string, patch: Partial<PrintFailure>) {
  queue = queue.map((f) => (f.id === id ? { ...f, ...patch } : f))
  emit()
}

export function dismissPrintFailure(id: string) {
  queue = queue.filter((f) => f.id !== id)
  emit()
}

/** Re-send to the same printer, or to `printer` when the cashier picked another one. */
export async function retryPrintFailure(f: PrintFailure, printer?: PrintStation): Promise<{ ok: boolean }> {
  const target = printer ?? f.station
  if (!usesAgent(target)) return { ok: false }
  const res = f.jobId
    ? await retryAgentJob(f.jobId, printer)
    : await agentPrint(target, { type: f.docType, html: f.html, ref: f.ref, copies: f.copies, openDrawer: f.openDrawer })
  if (res.ok) {
    dismissPrintFailure(f.id)
    return { ok: true }
  }
  const error = res.error ?? res.job?.error ?? { code: 'PRINT_FAILED' as const, message: 'Print failed' }
  update(f.id, { error, station: target, jobId: res.job?.id ?? f.jobId })
  return { ok: false }
}

export async function cancelPrintFailure(f: PrintFailure) {
  if (f.jobId) await cancelAgentJob(f.jobId)
  dismissPrintFailure(f.id)
}
