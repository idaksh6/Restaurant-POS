import { getActiveBranchId } from './company'
import type { OrderType } from './mock'
import { normalizeTemplateId, type PrintTemplateId } from './printTemplates'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type PrintKind = 'receipt' | 'kot'
export type PrintPurpose = 'kot' | 'bill' | 'receipt'
/** browser = print dialog (no agent); usb = Windows-installed printer; lan / wifi = raw TCP via the Print Agent */
export type PrinterConnection = 'browser' | 'usb' | 'lan' | 'wifi'
export type PrintFontSize = 'small' | 'medium' | 'large'
export type PrintAlign = 'left' | 'center' | 'right'

/** Empty list = no restriction on that dimension. */
export type PrinterRouting = {
  orderTypes: OrderType[]
  /** Table area ids (dine-in) */
  areaIds: string[]
  /** Menu category ids — KOT only; a parent category covers its sub-categories */
  categoryIds: string[]
}

export const ROUTE_ORDER_TYPES: { id: OrderType; label: string }[] = [
  { id: 'dine-in', label: 'Dine-in' },
  { id: 'takeaway', label: 'Takeaway / Quick serve / Drive-thru' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'online', label: 'Online / Aggregator' },
]

export type PrinterOptions = {
  autoCut: boolean
  openDrawer: boolean
  printLogo: boolean
  printName: boolean
  printAddress: boolean
  printPhone: boolean
  printVat: boolean
  printFooter: boolean
  printQr: boolean
  fontSize: PrintFontSize
  align: PrintAlign
  encoding: 'auto'
  /** escpos = agent renders an image and sends ESC/POS; driver = Windows driver prints the slip */
  printMode: 'escpos' | 'driver'
  timeoutMs: number
  /** Bill / receipt prints as soon as it is ready, without pressing Print */
  autoPrint: boolean
  routing: PrinterRouting
}

export type PrintStation = {
  id: string
  branchId?: string
  /** Primary purpose (legacy field kept for older terminals and KDS boards). */
  kind: PrintKind
  name: string
  /** browser, a Windows printer name (usb) or host:port (lan / wifi) */
  target: string
  copies: number
  paperWidthMm: number
  /** Layout template — scales with paperWidthMm */
  templateId: PrintTemplateId
  departmentId?: string
  header: string
  footer: string
  active: boolean
  sort?: number
  purposes: PrintPurpose[]
  connection: PrinterConnection
  host?: string
  port?: number
  options: PrinterOptions
  isDefault: boolean
}

export const PRINTERS_KEY = 'mesa-print-stations'
export const PRINT_PURPOSES: PrintPurpose[] = ['kot', 'bill', 'receipt']

export const DEFAULT_PRINTER_OPTIONS: PrinterOptions = {
  autoCut: true,
  openDrawer: false,
  printLogo: true,
  printName: true,
  printAddress: true,
  printPhone: true,
  printVat: true,
  printFooter: true,
  printQr: true,
  fontSize: 'medium',
  align: 'center',
  encoding: 'auto',
  printMode: 'escpos',
  timeoutMs: 5000,
  autoPrint: false,
  routing: { orderTypes: [], areaIds: [], categoryIds: [] },
}

const ORDER_TYPE_IDS = new Set<string>(ROUTE_ORDER_TYPES.map((o) => o.id))

function asIdList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : []
}

function asRouting(value: unknown): PrinterRouting {
  const r = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof PrinterRouting, unknown>>
  return {
    orderTypes: asIdList(r.orderTypes).filter((t): t is OrderType => ORDER_TYPE_IDS.has(t)),
    areaIds: asIdList(r.areaIds),
    categoryIds: asIdList(r.categoryIds),
  }
}

function asKind(value: unknown): PrintKind {
  return value === 'kot' ? 'kot' : 'receipt'
}

function asPurposes(value: unknown, kind: unknown): PrintPurpose[] {
  let raw = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = undefined
    }
  }
  const list = Array.isArray(raw)
    ? raw.map(String).filter((p): p is PrintPurpose => PRINT_PURPOSES.includes(p as PrintPurpose))
    : []
  if (list.length) return [...new Set(list)]
  if (kind === 'kot') return ['kot']
  if (kind === 'bill') return ['bill']
  return ['receipt']
}

function asOptions(value: unknown, legacyNamedPrinter: boolean): PrinterOptions {
  let raw = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = undefined
    }
  }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<PrinterOptions>
  const pick = <K extends keyof PrinterOptions>(k: K) => (o[k] === undefined ? DEFAULT_PRINTER_OPTIONS[k] : o[k])
  return {
    autoCut: Boolean(pick('autoCut')),
    openDrawer: Boolean(pick('openDrawer')),
    printLogo: Boolean(pick('printLogo')),
    printName: Boolean(pick('printName')),
    printAddress: Boolean(pick('printAddress')),
    printPhone: Boolean(pick('printPhone')),
    printVat: Boolean(pick('printVat')),
    printFooter: Boolean(pick('printFooter')),
    printQr: Boolean(pick('printQr')),
    fontSize: o.fontSize === 'small' || o.fontSize === 'large' ? o.fontSize : 'medium',
    align: o.align === 'left' || o.align === 'right' ? o.align : 'center',
    encoding: 'auto',
    // Rows saved before the agent printed through the Windows driver — keep that behaviour.
    printMode: o.printMode === 'driver' || o.printMode === 'escpos' ? o.printMode : legacyNamedPrinter ? 'driver' : 'escpos',
    timeoutMs: Math.min(30000, Math.max(1000, Number(o.timeoutMs) || DEFAULT_PRINTER_OPTIONS.timeoutMs)),
    autoPrint: o.autoPrint === true,
    routing: asRouting(o.routing),
  }
}

function asConnection(value: unknown, target: string): PrinterConnection {
  if (value === 'browser' || value === 'usb' || value === 'lan' || value === 'wifi') return value
  return !target || target.toLowerCase() === 'browser' ? 'browser' : 'usb'
}

/** Fill new fields on rows saved by older terminals / API rows without the agent columns. */
export function normalizePrinter(p: Partial<PrintStation> & { id: string }, fallbackBranchId?: string): PrintStation {
  const target = String(p.target ?? 'browser').trim() || 'browser'
  const connection = asConnection(p.connection, target)
  const purposes = asPurposes(p.purposes, p.kind)
  const kind: PrintKind = purposes.includes('kot') && !purposes.some((x) => x !== 'kot') ? 'kot' : asKind(purposes[0])
  const legacyNamed = p.connection == null && connection === 'usb'
  return {
    id: String(p.id),
    branchId: p.branchId || fallbackBranchId,
    kind,
    name: String(p.name ?? ''),
    target,
    copies: Math.max(1, Number(p.copies ?? 1) || 1),
    paperWidthMm: Number(p.paperWidthMm ?? 80) || 80,
    templateId: normalizeTemplateId(p.templateId, kind),
    departmentId: p.departmentId ? String(p.departmentId) : undefined,
    header: String(p.header ?? ''),
    footer: String(p.footer ?? ''),
    active: p.active !== false,
    sort: Number(p.sort ?? 0),
    purposes,
    connection,
    host: p.host ? String(p.host).trim() : undefined,
    port: p.port ? Number(p.port) || 9100 : connection === 'lan' || connection === 'wifi' ? 9100 : undefined,
    options: asOptions(p.options, legacyNamed),
    isDefault: p.isDefault === true,
  }
}

export function fromApiPrinter(row: Record<string, unknown>): PrintStation {
  return normalizePrinter({
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    kind: row.kind as PrintKind,
    name: row.name as string,
    target: row.target as string,
    copies: row.copies as number,
    paperWidthMm: row.paperWidthMm as number,
    templateId: row.templateId as PrintTemplateId,
    departmentId: row.departmentId ? String(row.departmentId) : undefined,
    header: row.header as string,
    footer: row.footer as string,
    active: row.active !== false,
    sort: Number(row.sort ?? 0),
    purposes: row.purposes as PrintPurpose[],
    connection: (row.connection ?? undefined) as PrinterConnection,
    host: row.host ? String(row.host) : undefined,
    port: row.port != null ? Number(row.port) : undefined,
    options: row.options as PrinterOptions,
    isDefault: row.isDefault === true,
  })
}

/** Keep `target` meaningful for older terminals that only read it. */
export function printerTarget(p: Pick<PrintStation, 'connection' | 'host' | 'port' | 'target'>) {
  if (p.connection === 'browser') return 'browser'
  if (p.connection === 'lan' || p.connection === 'wifi') return `${p.host ?? ''}:${p.port ?? 9100}`
  return p.target && p.target.toLowerCase() !== 'browser' ? p.target : ''
}

export function loadAllPrinters(): PrintStation[] {
  try {
    const raw = tenantGetItem(PRINTERS_KEY)
    const parsed = raw ? (JSON.parse(raw) as PrintStation[]) : []
    if (!Array.isArray(parsed)) return []
    const branchId = getActiveBranchId()
    return parsed.filter((p) => p?.id).map((p) => normalizePrinter(p, branchId))
  } catch {
    return []
  }
}

export function saveAllPrinters(rows: PrintStation[]) {
  tenantSetItem(PRINTERS_KEY, JSON.stringify(rows))
}

export function printersForBranch(rows: PrintStation[], branchId = getActiveBranchId()) {
  return rows.filter((p) => !p.branchId || p.branchId === branchId)
}

export function hasPurpose(p: Pick<PrintStation, 'purposes' | 'kind'>, purpose: PrintPurpose) {
  return (p.purposes?.length ? p.purposes : [p.kind]).includes(purpose)
}

function byDefaultThenSort(a: PrintStation, b: PrintStation) {
  return Number(b.isDefault) - Number(a.isDefault) || (a.sort ?? 0) - (b.sort ?? 0)
}

export function receiptStation(rows: PrintStation[], branchId = getActiveBranchId()) {
  const list = printersForBranch(rows, branchId).filter((p) => p.active && hasPurpose(p, 'receipt'))
  return [...list].sort(byDefaultThenSort)[0]
}

/** Guest check / bill printer — falls back to the receipt printer. */
export function billStation(rows: PrintStation[], branchId = getActiveBranchId()) {
  const list = printersForBranch(rows, branchId).filter((p) => p.active && hasPurpose(p, 'bill'))
  return [...list].sort(byDefaultThenSort)[0] ?? receiptStation(rows, branchId)
}

export function kotStation(
  rows: PrintStation[],
  departmentId?: string,
  branchId = getActiveBranchId(),
) {
  const list = printersForBranch(rows, branchId)
    .filter((p) => p.active && hasPurpose(p, 'kot'))
    .sort(byDefaultThenSort)
  if (departmentId) {
    const mapped = list.find((p) => p.departmentId === departmentId)
    if (mapped) return mapped
  }
  return list.find((p) => !p.departmentId) ?? list[0]
}

export type PrintContext = {
  orderType?: OrderType
  areaId?: string
  /** Item category chain, leaf first (KOT) */
  categoryIds?: string[]
}

/** null = the printer's rules exclude this job; higher = more specific match. */
function routeScore(p: PrintStation, purpose: PrintPurpose, ctx: PrintContext): number | null {
  const r = p.options.routing
  let score = 0
  if (r.orderTypes.length) {
    if (!ctx.orderType || !r.orderTypes.includes(ctx.orderType)) return null
    score += 1
  }
  if (r.areaIds.length) {
    if (!ctx.areaId || !r.areaIds.includes(ctx.areaId)) return null
    score += 2
  }
  if (purpose !== 'kot') return score
  const chain = ctx.categoryIds ?? []
  // Leaf category beats its parent department
  const rank = (id: string) => {
    const i = chain.indexOf(id)
    return i < 0 ? null : 4 - Math.min(i, 3) * 0.5
  }
  if (r.categoryIds.length) {
    const ranks = r.categoryIds.map(rank).filter((x): x is number => x != null)
    if (!ranks.length) return null
    score += Math.max(...ranks)
  }
  if (p.departmentId) {
    const rk = rank(p.departmentId)
    if (rk == null) return null
    score += rk
  }
  return score
}

export type RouteResult = {
  printer?: PrintStation
  /** rule = matched the printer's assignment · fallback = no rule matched, default printer used */
  reason: 'rule' | 'fallback' | 'receipt-printer' | 'none'
}

export function explainRoute(
  rows: PrintStation[],
  purpose: PrintPurpose,
  ctx: PrintContext = {},
  branchId = getActiveBranchId(),
): RouteResult {
  const list = printersForBranch(rows, branchId)
    .filter((p) => p.active && hasPurpose(p, purpose))
    .sort(byDefaultThenSort)
  let best: PrintStation | undefined
  let bestScore = -1
  for (const p of list) {
    const s = routeScore(p, purpose, ctx)
    if (s != null && s > bestScore) {
      best = p
      bestScore = s
    }
  }
  if (best) return { printer: best, reason: 'rule' }
  if (purpose === 'bill') {
    const viaReceipt = explainRoute(rows, 'receipt', ctx, branchId)
    if (viaReceipt.printer) return { printer: viaReceipt.printer, reason: 'receipt-printer' }
  }
  if (list[0]) return { printer: list[0], reason: 'fallback' }
  return { reason: 'none' }
}

/** Printer for a KOT / bill / receipt — rules first, then the default printer so no job is dropped. */
export function routePrinter(
  rows: PrintStation[],
  purpose: PrintPurpose,
  ctx: PrintContext = {},
  branchId = getActiveBranchId(),
) {
  return explainRoute(rows, purpose, ctx, branchId).printer
}
