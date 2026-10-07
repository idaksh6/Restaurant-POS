/** Client for the local Isarva POS Print Agent (http://127.0.0.1:17891). */

import type { PrintStation } from '../data/printers'

const URL_KEY = 'isarva-print-agent-url'
export const DEFAULT_AGENT_URL = 'http://127.0.0.1:17891'
export const AGENT_DOWNLOAD_URL = '/downloads/Isarva-Print-Agent-Setup.exe'

export type AgentPrinterState =
  | 'online'
  | 'offline'
  | 'error'
  | 'paper-out'
  | 'cover-open'
  | 'connecting'
  | 'unknown'
  | 'disabled'

export type AgentErrorCode =
  | 'AGENT_UNREACHABLE'
  | 'ORIGIN_NOT_ALLOWED'
  | 'PRINTER_NOT_FOUND'
  | 'PRINTER_OFFLINE'
  | 'TIMEOUT'
  | 'PAPER_OUT'
  | 'COVER_OPEN'
  | 'PRINTER_ERROR'
  | 'RENDER_FAILED'
  | 'PRINT_FAILED'
  | 'BAD_REQUEST'
  | 'AGENT_RESTARTED'
  | 'AGENT_ERROR'

export type AgentError = { code: AgentErrorCode; message: string }

export type AgentStatus = {
  ok: true
  version: string
  port: number
  posConnected: boolean
  printers: Array<{ id: string; name: string; state: AgentPrinterState; detail?: string }>
  failedJobs: number
}

export type SystemPrinter = {
  name: string
  portName: string
  driver: string
  isDefault: boolean
  isUsb: boolean
  isNetwork: boolean
  isVirtual: boolean
  host?: string
  port?: number
  state: AgentPrinterState
  detail?: string
}

export type PrinterHealthResult = { id: string; state: AgentPrinterState; code?: AgentErrorCode; detail?: string }

export type AgentJob = {
  id: string
  docType: string
  docRef?: string
  printerId?: string
  printerName: string
  requestedAt: string
  printedAt?: string
  status: 'pending' | 'printing' | 'printed' | 'failed' | 'cancelled'
  retryCount: number
  error?: AgentError
  canRetry: boolean
}

export type AgentPrintResult = { ok: boolean; job?: AgentJob; error?: AgentError }

export function agentUrl() {
  try {
    return (localStorage.getItem(URL_KEY) || DEFAULT_AGENT_URL).replace(/\/+$/, '')
  } catch {
    return DEFAULT_AGENT_URL
  }
}

export function setAgentUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, '')
  if (!clean || clean === DEFAULT_AGENT_URL) localStorage.removeItem(URL_KEY)
  else localStorage.setItem(URL_KEY, clean)
}

/** Agent-backed printers (everything except the browser print dialog). */
export function usesAgent(p: Pick<PrintStation, 'connection'>) {
  return p.connection === 'usb' || p.connection === 'lan' || p.connection === 'wifi'
}

export function toAgentPrinter(p: PrintStation) {
  return {
    id: p.id,
    name: p.name,
    connection: p.connection,
    deviceName: p.connection === 'usb' ? p.target : undefined,
    host: p.connection === 'lan' || p.connection === 'wifi' ? p.host : undefined,
    port: p.port ?? 9100,
    timeoutMs: p.options.timeoutMs,
    printMode: p.options.printMode,
    paperWidthMm: p.paperWidthMm,
    autoCut: p.options.autoCut,
    openDrawer: p.options.openDrawer,
    active: p.active,
    purposes: p.purposes,
  }
}

class AgentRequestError extends Error {
  code: AgentErrorCode
  constructor(code: AgentErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

async function call<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 8000)
  let res: Response
  try {
    res = await fetch(`${agentUrl()}${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    })
  } catch {
    throw new AgentRequestError('AGENT_UNREACHABLE', 'Print Agent is not running on this computer')
  } finally {
    window.clearTimeout(timer)
  }
  if (res.status === 403) throw new AgentRequestError('ORIGIN_NOT_ALLOWED', 'This website is not allowed in the Print Agent settings')
  const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: AgentError }) | null
  if (!data) throw new AgentRequestError('AGENT_ERROR', 'Unexpected response from the Print Agent')
  if (res.status >= 400 && data.error) throw new AgentRequestError(data.error.code, data.error.message)
  return data
}

function asAgentError(e: unknown): AgentError {
  if (e instanceof AgentRequestError) return { code: e.code, message: e.message }
  return { code: 'AGENT_ERROR', message: e instanceof Error ? e.message : 'Print Agent error' }
}

export async function getAgentStatus(): Promise<{ status?: AgentStatus; error?: AgentError }> {
  try {
    return { status: await call<AgentStatus>('/status', { timeoutMs: 3000 }) }
  } catch (e) {
    return { error: asAgentError(e) }
  }
}

export async function listSystemPrinters(): Promise<{ printers: SystemPrinter[]; error?: AgentError }> {
  try {
    const res = await call<{ printers: SystemPrinter[] }>('/printers/system', { timeoutMs: 20000 })
    return { printers: res.printers ?? [] }
  } catch (e) {
    return { printers: [], error: asAgentError(e) }
  }
}

export async function syncAgentPrinters(printers: PrintStation[]) {
  try {
    await call('/printers/sync', { method: 'POST', body: { printers: printers.filter(usesAgent).map(toAgentPrinter) } })
    return true
  } catch {
    return false
  }
}

export async function checkPrinters(printers: PrintStation[]): Promise<{ results: PrinterHealthResult[]; error?: AgentError }> {
  const list = printers.filter(usesAgent)
  if (!list.length) return { results: [] }
  try {
    const res = await call<{ printers: PrinterHealthResult[] }>('/printers/status', {
      method: 'POST',
      body: { printers: list.map(toAgentPrinter) },
      timeoutMs: 25000,
    })
    return { results: res.printers ?? [] }
  } catch (e) {
    return { results: [], error: asAgentError(e) }
  }
}

export async function testConnection(host: string, port: number, timeoutMs: number) {
  try {
    return await call<{ ok: boolean; state: AgentPrinterState; code?: AgentErrorCode; detail?: string }>('/connection/test', {
      method: 'POST',
      body: { host, port, timeoutMs },
      timeoutMs: timeoutMs + 5000,
    })
  } catch (e) {
    const err = asAgentError(e)
    return { ok: false, state: 'unknown' as AgentPrinterState, code: err.code, detail: err.message }
  }
}

export type AgentDocType = 'kot' | 'bill' | 'receipt' | 'test'

export async function agentPrint(
  printer: PrintStation,
  doc: { type: AgentDocType; html?: string; ref?: string; copies?: number; openDrawer?: boolean; orderId?: string; kotId?: string },
): Promise<AgentPrintResult> {
  const path = doc.type === 'test' ? '/print/test' : `/print/${doc.type}`
  try {
    return await call<AgentPrintResult>(path, {
      method: 'POST',
      body: {
        printer: toAgentPrinter(printer),
        html: doc.html,
        docRef: doc.ref,
        copies: doc.copies ?? printer.copies,
        openDrawer: doc.openDrawer,
        orderId: doc.orderId,
        kotId: doc.kotId,
      },
      timeoutMs: 60000,
    })
  } catch (e) {
    return { ok: false, error: asAgentError(e) }
  }
}

export async function listAgentJobs(limit = 100): Promise<{ jobs: AgentJob[]; error?: AgentError }> {
  try {
    const res = await call<{ jobs: AgentJob[] }>(`/jobs?limit=${limit}`)
    return { jobs: res.jobs ?? [] }
  } catch (e) {
    return { jobs: [], error: asAgentError(e) }
  }
}

export async function retryAgentJob(id: string, printer?: PrintStation): Promise<AgentPrintResult> {
  try {
    return await call<AgentPrintResult>(`/jobs/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
      body: printer ? { printer: toAgentPrinter(printer) } : {},
      timeoutMs: 60000,
    })
  } catch (e) {
    return { ok: false, error: asAgentError(e) }
  }
}

export async function cancelAgentJob(id: string) {
  try {
    await call(`/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} })
    return true
  } catch {
    return false
  }
}

/** Short, non-technical message for cashiers and admins. */
export function friendlyPrintError(error: AgentError | undefined, printerName?: string): { title: string; hint: string } {
  const who = printerName || 'The printer'
  switch (error?.code) {
    case 'AGENT_UNREACHABLE':
      return { title: 'Print Agent is not running', hint: 'Start "Isarva POS Print Agent" on this computer (or install it), then try again.' }
    case 'ORIGIN_NOT_ALLOWED':
      return { title: 'Print Agent blocked this website', hint: 'Open the Print Agent from the tray and add this website under Settings.' }
    case 'PRINTER_NOT_FOUND':
      return { title: `${who} was not found`, hint: 'Check the USB cable / driver, or the IP address in printer settings.' }
    case 'PRINTER_OFFLINE':
      return { title: `${who} is offline`, hint: 'Check the printer is switched on and connected.' }
    case 'TIMEOUT':
      return { title: `${who} is not responding`, hint: 'Check the network cable / Wi-Fi and the IP address.' }
    case 'PAPER_OUT':
      return { title: `${who} is out of paper`, hint: 'Load a new paper roll and try again.' }
    case 'COVER_OPEN':
      return { title: `${who} cover is open`, hint: 'Close the printer cover and try again.' }
    case 'RENDER_FAILED':
      return { title: 'Could not prepare the slip', hint: 'Try again. If it keeps failing, check the Print Agent logs.' }
    case 'BAD_REQUEST':
      return { title: 'Printer settings are incomplete', hint: error.message }
    default:
      return { title: `${who} could not print`, hint: 'Check the printer, then try again. Details are in the Print Agent logs.' }
  }
}
