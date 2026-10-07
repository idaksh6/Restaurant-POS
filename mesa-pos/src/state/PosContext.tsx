import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getActiveBranchId, loadCompanyProfile } from '../data/company'
import {
  cashFromLedger,
  fromApiLedgerEntry,
  loadAllLedger,
  loadDayClosed,
  makeSaleEntry,
  mergeRemoteLedger,
  saveDayClosed,
  saveLedger,
  todayKey,
  type LedgerEntry,
  type SettleMeta,
} from '../data/ledger'
import { chargesForBranch, type ExtraCharge } from '../data/charges'
import { dishTaxPercent } from '../data/tax'
import { useCatalog } from './CatalogContext'
import { mesaDb, migrateLocalStorageToDexie, tenantGetItem, tenantSetItem } from '../data/repos/db'
import { alignFloorTableId, floorRepo, FLOOR_SYNC_EVENT, sameFloorTable, scopedFloorId } from '../data/repos/floorRepo'
import { collapseOpenLines, dineCheckForTable, mergeRemoteTickets, TICKETS_SYNC_EVENT, ticketsRepo } from '../data/repos/ticketsRepo'
import { kitchenFromTicket, ticketFromServer } from '../sync/applyIncoming'
import { enrichStockVendors } from '../lib/stockVendor'
import {
  isHeadOfficeBranchId,
  scopedStockId,
  stockForBranch,
} from '../lib/stockBranch'
import {
  deductFromLocations,
  defaultDeductPreferOrder,
  defaultReceiveLocationId,
  emptyLocationBalances,
  migrateStockItem,
  normalizeLocationBalances,
  resolveReceiveLocationId,
  roundStockQty,
  totalOnHand,
  type StockLocationId,
} from '../data/stockLocations'
import {
  applyIngredientFieldsToStock,
  dedupeIngredientsByName,
  fromApiIngredient,
  ingredientsForBranch,
  isSeedIngredient,
  loadIngredients,
  migrateIngredientReorderFromStock,
  migrateIngredientVendorsFromStock,
  normalizeIngredient,
  normalizeIngredients,
  remapStockIngredientIds,
  saveIngredients,
  type Ingredient,
} from '../data/ingredients'
import {
  isMergedCheck,
  lineTotal,
  nowTime,
  stock as seedStock,
  type KitchenPriority,
  type KitchenTicket,
  type KitchenTicketStatus,
  type MenuItem,
  type OpenTicket,
  type OrderLine,
  type OrderType,
  type StockItem,
  type Table,
} from '../data/mock'
import { areaIdByName, ensureAreasFromTables } from '../data/tableAreas'
import { appendAudit } from '../hardware/audit'
import { canEmitPhase1Qr, isZatcaEnabled, newZatcaInvoiceUuid, prepareZatcaPhase1, queueZatcaPhase2, peekZatcaPhase2Config, refreshZatcaPhase2Config } from '../hardware/zatca'
import { loadAllPrinters, routePrinter, type PrintContext, type PrintStation } from '../data/printers'
import { printEscPos, stationPrintJob } from '../hardware/printer'
import { localizedLineName } from '../lib/branding'
import { activeLang, messages } from '../locale/i18n'
import { peekCategories, peekDishes } from '../data/repos/mastersRepo'
import { kitchenPendingLines, lineRequiresKitchen } from '../lib/kitchenRouting'
import {
  aggregateKitchenStatus,
  dishDepartmentIds,
  listKdsStations,
  resolveLineStationId,
} from '../lib/kdsStations'
import { dropPendingUpsertsFor, enqueueOutbox, loadOutbox } from '../sync/outbox'
import { getDeviceId } from '../sync/deviceId'
import {
  apiDayClose,
  apiLatestDayClose,
  apiListFloor,
  apiListLedger,
  apiListStock,
  apiListIngredients,
  apiListTickets,
  apiMastersReady,
  apiPutFloor,
  apiDeleteFloor,
  apiPutLedger,
  apiPutStock,
  apiPutIngredient,
  apiDeleteIngredient,
  apiPutTicket,
} from '../lib/apiMasters'
import { useSync } from '../sync/SyncContext'
import { useBranch } from './BranchContext'

type FlashKind = 'ok' | 'err'
type Toast = { message: string; kind: FlashKind; at: number }

const DEFAULT_FLASH_MS = 2400
const ERROR_FLASH_MS = 3200

function inferFlashKind(message: string): FlashKind {
  return /required|cannot|could not|couldn’t|invalid|fail|error|not enough|locked|must |choose |enter |pick |keep at least|reassign|no access|day is closed|min |wrong|not found|already used|no data|select a |add at least|image must/i.test(
    message,
  )
    ? 'err'
    : 'ok'
}

export type AppliedCharge = {
  id: string
  name: string
  amount: number
  /** Resolved VAT % for this charge (company default when master left blank). */
  taxPercent?: number
}

type PosContextValue = {
  tables: Table[]
  tableOrders: Record<string, OrderLine[]>
  tickets: OpenTicket[]
  kitchen: KitchenTicket[]
  toast: string
  toastKind: 'ok' | 'err'
  flash: (message: string, kind?: 'ok' | 'err', durationMs?: number) => void
  dismissFlash: () => void
  ledger: LedgerEntry[]
  dayClosedOn: string | null
  dayIsClosed: boolean
  stock: StockItem[]
  ingredients: Ingredient[]
  chargeCatalog: ExtraCharge[]
  tableCharges: Record<string, string[]>
  openTable: (tableId: string, guests?: number) => void
  setGuests: (tableId: string, guests: number) => void
  selectAddToTable: (tableId: string, item: MenuItem, note?: string) => void
  setTableLineNote: (tableId: string, lineId: string, note: string) => void
  setTableTicketNote: (tableId: string, note: string) => void
  changeTableQty: (tableId: string, lineId: string, delta: number) => void
  voidTableLine: (tableId: string, lineId: string, reason?: string, staff?: string) => void
  sendTableOrders: (tableId: string, priority: KitchenPriority) => void
  transferTable: (fromId: string, toId: string) => void
  mergeTables: (primaryId: string, secondaryId: string) => void
  tableDiscounts: Record<string, number>
  /** Synced order note per open table (not the floor-plan table mark). */
  tableTicketNotes: Record<string, string>
  setTableDiscount: (tableId: string, percent: number) => void
  toggleTableCharge: (tableId: string, chargeId: string) => void
  getTableChargeLines: (tableId: string, goodsSubtotal: number) => AppliedCharge[]
  requestBill: (tableId: string) => void
  settleTable: (tableId: string, meta?: SettleMeta) => void
  /** Clear an accidentally opened dine table that still has no items. */
  clearEmptyTable: (tableId: string) => void
  addTicket: (ticket: OpenTicket) => void
  updateTicket: (ticketId: string, patch: Partial<OpenTicket>) => void
  addToTicket: (ticketId: string, item: MenuItem, note?: string) => void
  changeTicketQty: (ticketId: string, lineId: string, delta: number) => void
  setTicketLineNote: (ticketId: string, lineId: string, note: string) => void
  voidTicketLine: (ticketId: string, lineId: string, reason?: string, staff?: string) => void
  setTicketDiscount: (ticketId: string, percent: number) => void
  toggleTicketCharge: (ticketId: string, chargeId: string) => void
  getTicketChargeLines: (ticketId: string, goodsSubtotal: number) => AppliedCharge[]
  sendTicketOrders: (ticketId: string, priority: KitchenPriority) => void
  settleTicket: (ticketId: string, meta?: SettleMeta) => void
  cancelTicket: (ticketId: string, reason?: string) => void
  setKitchenStatus: (ticketId: string, status: KitchenTicketStatus) => void
  setKitchenLineStatus: (
    ticketId: string,
    lineIndex: number,
    status: KitchenTicketStatus,
  ) => void
  dismissKitchen: (ticketId: string) => void
  recordSale: (meta: SettleMeta) => void
  /** Insert or replace a sales-ledger row (used for invoice identity backfill). */
  upsertLedger: (entry: LedgerEntry) => void
  closeDay: (countedCash: number, staff?: string) => { ok: boolean; message: string }
  reopenDay: () => void
  deductRecipeStock: (
    lines: OrderLine[],
    recipes: Record<string, { ingredientId: string; qty: number }[]>,
  ) => void
  saveIngredient: (row: Ingredient) => void
  deleteIngredient: (id: string) => void
  receiveStock: (
    items: {
      stockId: string
      qty: number
      cost?: number
      vendorId?: string
      vendor?: string
    }[],
  ) => void
  transferStockLocation: (
    stockId: string,
    fromLocation: StockLocationId,
    toLocation: StockLocationId,
    qty: number,
    note?: string,
  ) => boolean
  adjustStock: (stockId: string, delta: number, reason?: string, opts?: { quiet?: boolean }) => void
  /** Create or replace a stock SKU (CSV/Excel import). */
  upsertStockItem: (row: StockItem) => StockItem
  saveFloorTable: (row: {
    id?: string
    label: string
    seats: number
    area: string
    note?: string
    sort?: number
  }) => boolean
  deleteFloorTable: (tableId: string) => boolean
}

const PosContext = createContext<PosContextValue | null>(null)
const STOCK_KEY = 'mesa-stock'

function newDineTicketId(tableId: string) {
  return `dine:${getActiveBranchId()}:${tableId}:${Date.now()}`
}

function retireDineTickets(rows: OpenTicket[]) {
  const branchId = getActiveBranchId()
  for (const ticket of rows) {
    enqueueOutbox(
      'ticket.settle',
      ticket.id,
      { ticketId: ticket.id, meta: { method: 'reseated' } },
      getDeviceId(),
      ticket.branchId ?? branchId,
    )
    void ticketsRepo.remove(ticket.id)
    void mesaDb.kitchen.delete(`kot-${ticket.id}`).catch(() => undefined)
  }
}

function pushFloor(table: Table & { sort?: number }) {
  const branchId = getActiveBranchId()
  const id = scopedFloorId(table.id, branchId)
  const note = table.note?.trim()
  const payload = {
    id,
    label: table.label,
    seats: table.seats,
    area: table.area,
    note: note || null,
    branchId,
    active: true,
    sort: table.sort ?? 0,
  }
  if (apiMastersReady()) {
    void apiPutFloor(payload)
      .then(() => dropPendingUpsertsFor(id, 'floor.upsert'))
      .catch(() => enqueueOutbox('floor.upsert', id, payload, getDeviceId(), branchId))
  } else {
    enqueueOutbox('floor.upsert', id, payload, getDeviceId(), branchId)
  }
}

function pushStock(item: StockItem, delta?: number) {
  const branchId = item.branchId || getActiveBranchId()
  // When adjusting qty, omit absolute onHand from the SyncOp so peers apply the delta.
  const { onHand: _omitOnHand, ...meta } = item
  const payload =
    delta != null && delta !== 0
      ? { ...meta, id: scopedStockId(item.id, branchId), branchId, delta }
      : { ...item, id: scopedStockId(item.id, branchId), branchId }
  if (apiMastersReady()) {
    void apiPutStock({ ...item, id: payload.id, branchId, ...(delta != null && delta !== 0 ? { delta } : {}) })
      .then(() => dropPendingUpsertsFor(payload.id, 'stock.adjust'))
      .catch(() => enqueueOutbox('stock.adjust', payload.id, payload, getDeviceId(), branchId))
  } else {
    enqueueOutbox('stock.adjust', payload.id, payload, getDeviceId(), branchId)
  }
}

function pendingTicketSlices() {
  const ops = loadOutbox().filter(
    (o) =>
      (o.type === 'ticket.create' || o.type === 'ticket.update') &&
      (o.status === 'pending' || o.status === 'syncing'),
  )
  const toTicket = (o: (typeof ops)[number]) =>
    ticketFromServer({ ...(o.payload as object), id: o.entityId } as Record<string, unknown>)
  const pendingCreates = ops
    .filter((o) => o.type === 'ticket.create')
    .map(toTicket)
    .filter((t): t is OpenTicket => Boolean(t))
  const pendingUpdates = ops
    .filter((o) => o.type === 'ticket.update')
    .map(toTicket)
    .filter((t): t is OpenTicket => Boolean(t))
  const settledIds = loadOutbox()
    .filter((o) => o.type === 'ticket.settle' && (o.status === 'pending' || o.status === 'syncing'))
    .map((o) => o.entityId)
  return { pendingCreates, pendingUpdates, settledIds }
}

function ticketsOtherBranch(rows: OpenTicket[], branchId: string) {
  return rows.filter((t) => {
    const br = t.branchId ?? /^dine:([^:]+):/.exec(t.id)?.[1]
    return Boolean(br && br !== branchId)
  })
}

function mapRemoteTickets(remote: Record<string, unknown>[], layout: Table[]): OpenTicket[] {
  return remote
    .map((row) => ticketFromServer(row))
    .filter((t): t is OpenTicket => Boolean(t))
    .map((t) => (t.tableId ? { ...t, tableId: alignFloorTableId(t.tableId, layout) ?? t.tableId } : t))
}

function openLineKey(line: Pick<OrderLine, 'itemId' | 'note' | 'price' | 'sent'>) {
  return `${line.itemId}::${line.note ?? ''}::${Number(line.price)}`
}

function removeDisplayLine(lines: OrderLine[], display: OrderLine): OrderLine[] {
  if (display.sent) {
    return lines.filter((l) => l.id !== display.id)
  }
  const key = openLineKey(display)
  const next = lines.filter((l) => {
    if (l.sent) return true
    if (l.id === display.id) return false
    return openLineKey(l) !== key
  })
  return next.length === lines.length ? lines.filter((l) => l.id !== display.id) : next
}

function adjustDisplayQty(lines: OrderLine[], lineId: string, delta: number): OrderLine[] {
  const display = collapseOpenLines(lines).find((l) => l.id === lineId) ?? lines.find((l) => l.id === lineId)
  if (!display) return lines
  if (delta >= 0 || display.sent) {
    return lines
      .map((line) => (line.id === lineId ? { ...line, qty: line.qty + delta } : line))
      .filter((line) => line.qty > 0)
  }
  let remaining = Math.abs(delta)
  const next: OrderLine[] = []
  for (const line of [...lines].reverse()) {
    if (remaining <= 0 || line.sent || openLineKey(line) !== openLineKey(display)) {
      next.push(line)
      continue
    }
    const take = Math.min(line.qty, remaining)
    remaining -= take
    const qty = line.qty - take
    if (qty > 0) next.push({ ...line, qty })
  }
  return next.reverse()
}

function ticketsSig(rows: OpenTicket[]) {
  return rows
    .map((t) => {
      const lines = [...t.lines]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(
          (l) =>
            `${l.id}:${l.qty}:${l.sent ? 1 : 0}:${String(l.note ?? '').replace(/[|:]/g, ' ')}`,
        )
        .join(',')
      const ticketNote = String(t.note ?? '').replace(/[|:]/g, ' ')
      const charges = [...(t.chargeIds ?? [])].map(String).sort().join('+')
      const discount = Number(t.discountPct) || 0
      return `${t.id}:${t.checkStatus}:${t.kitchenStatus ?? ''}:${t.deliveryStatus ?? ''}:${t.kitchenDismissed ? 1 : 0}:${Math.round((t.amount ?? 0) * 100)}:${t.mergedIntoTableId ?? ''}:${(t.mergedFromTableIds ?? []).join('+')}:${ticketNote}:d${discount}:c${charges}:${lines}`
    })
    .sort()
    .join('|')
}

function kitchenSig(rows: KitchenTicket[]) {
  return rows
    .map(
      (k) =>
        `${k.id}:${k.status}:${k.priority ?? ''}:${k.lines
          .map((l) => `${l.itemId ?? l.name}:${l.qty}:${l.status ?? ''}:${l.stationId ?? ''}`)
          .join(',')}`,
    )
    .sort()
    .join('|')
}

/** Layout-only sig (status/amount come from tickets). */
function floorLayoutSig(rows: Table[]) {
  return rows
    .map((t) => `${t.id}:${t.label}:${t.seats}:${t.area}:${String(t.note ?? '').replace(/[|:]/g, ' ')}`)
    .sort()
    .join('|')
}

const KITCHEN_KEY = 'mesa-kitchen'
const DEMO_KITCHEN_IDS = new Set(['k1', 'k2', 'k3'])

function kitchenStatusRank(status?: KitchenTicketStatus) {
  if (status === 'done') return 3
  if (status === 'ready') return 2
  if (status === 'cooking') return 1
  return 0
}

function preferKitchenStatus(
  local?: KitchenTicketStatus,
  fromTicket?: KitchenTicketStatus,
): KitchenTicketStatus {
  const a = local ?? 'queued'
  const b = fromTicket ?? 'queued'
  return kitchenStatusRank(a) >= kitchenStatusRank(b) ? a : b
}

function mergeKitchenFromTickets(
  prev: KitchenTicket[],
  tickets: OpenTicket[],
): KitchenTicket[] {
  const kots = tickets.map(kitchenFromTicket).filter((k): k is KitchenTicket => Boolean(k))
  const openKotIds = new Set(kots.map((k) => k.id))
  const byId = new Map(prev.filter((k) => openKotIds.has(k.id)).map((k) => [k.id, k]))
  for (const kot of kots) {
    const cur = byId.get(kot.id)
    byId.set(
      kot.id,
      cur
        ? {
            ...cur,
            ...kot,
            lines: (kot.lines.length ? kot.lines : cur.lines).map((line, idx) => {
              const prev =
                cur.lines.find((l) => l.itemId && line.itemId && l.itemId === line.itemId) ||
                cur.lines[idx]
              return {
                ...line,
                status: prev?.status ?? line.status,
                stationId: line.stationId ?? prev?.stationId,
              }
            }),
            // Keep local Cooking/Ready ahead of stale server ticket status
            status: preferKitchenStatus(cur.status, kot.status),
            priority: cur.priority === 'high' || kot.priority === 'high' ? 'high' : kot.priority,
          }
        : kot,
    )
  }
  // Drop cards with no lines (stale kitchenStatus / empty reseats)
  return [...byId.values()].filter((k) => k.lines.length > 0)
}

/** Persist kitchen board and remove Dexie/local orphans for this branch. */
async function persistKitchenBoard(rows: KitchenTicket[], branchId = getActiveBranchId()) {
  const clean = rows.filter((k) => !DEMO_KITCHEN_IDS.has(k.id) && k.lines.length > 0)
  saveKitchen(clean)
  try {
    const existing = await mesaDb.kitchen.toArray()
    const keep = new Set(clean.map((k) => k.id))
    const drop = existing
      .filter((k) => (!k.branchId || k.branchId === branchId) && !keep.has(k.id))
      .map((k) => k.id)
    if (drop.length) await mesaDb.kitchen.bulkDelete(drop)
    if (clean.length) await mesaDb.kitchen.bulkPut(clean)
  } catch {
    /* ignore */
  }
  return clean
}

/** Stamp the ZATCA invoice id on settle meta so the ledger row (and reprints) reuse it. */
function withInvoiceUuid(meta: SettleMeta | undefined, entityId?: string): SettleMeta | undefined {
  if (!meta) return meta
  if (meta.invoiceUuid) return meta
  if (!canEmitPhase1Qr()) return meta
  return { ...meta, invoiceUuid: newZatcaInvoiceUuid(entityId) }
}

function queueZatcaAfterSettle(meta?: SettleMeta, entityId?: string) {
  if (!meta || !canEmitPhase1Qr()) return
  try {
    const company = loadCompanyProfile()
    const invoice = prepareZatcaPhase1({
      invoiceUuid: meta.invoiceUuid ?? newZatcaInvoiceUuid(entityId),
      totalSar: meta.total,
      vatSar: meta.tax,
      sellerVat: company.taxId,
      sellerName: company.companyName,
    })
    if (!invoice) return
    if (!isZatcaEnabled()) return
    const cfg = peekZatcaPhase2Config()
    if (cfg?.phase2Enabled) {
      queueZatcaPhase2(invoice)
    } else {
      void refreshZatcaPhase2Config()
        .then((fresh) => {
          if (fresh?.phase2Enabled) queueZatcaPhase2(invoice)
        })
        .catch(() => undefined)
    }
  } catch {
    /* never block settle */
  }
}

function pushTicket(ticket: OpenTicket, type: 'ticket.create' | 'ticket.update' = 'ticket.update') {
  const branchId = ticket.branchId ?? getActiveBranchId()
  const stamped: OpenTicket = { ...ticket, branchId, updatedAt: Date.now() }
  const payload = {
    ...stamped,
    status:
      stamped.checkStatus === 'settled'
        ? 'settled'
        : stamped.checkStatus === 'merged'
          ? 'open'
          : 'open',
    replaceLines: true,
  }
  enqueueOutbox(type, payload.id, payload, getDeviceId(), branchId)
  if (apiMastersReady()) {
    void apiPutTicket(payload as unknown as Record<string, unknown>).catch(() => undefined)
  }
  return stamped
}

function occupyLayout(layout: Table[], tickets: OpenTicket[]): Table[] {
  const branchId = getActiveBranchId()
  const labelFor = (tableId?: string) => {
    if (!tableId) return ''
    return (
      layout.find((x) => sameFloorTable(x.id, tableId))?.label ??
      String(tableId).replace(/^.*:/, '')
    )
  }
  return layout.map((t) => {
    const check = dineCheckForTable(tickets, t.id, branchId)
    if (!check) {
      return {
        id: t.id,
        label: t.label,
        seats: t.seats,
        area: t.area,
        note: t.note,
        status: 'free' as const,
      }
    }
    if (isMergedCheck(check)) {
      const targetId = check.mergedIntoTableId
      const targetLabel = labelFor(targetId)
      return {
        ...t,
        status: 'merged' as const,
        guests: check.guests,
        openedAt: check.openedAt,
        amount: 0,
        mergedIntoId: targetId,
        mergedIntoLabel: targetLabel || undefined,
      }
    }
    const fromIds = [
      ...new Set([
        ...(check.mergedFromTableIds ?? []),
        ...tickets
          .filter(
            (x) =>
              x.type === 'dine-in' &&
              isMergedCheck(x) &&
              sameFloorTable(x.mergedIntoTableId, t.id) &&
              (!x.branchId || x.branchId === branchId),
          )
          .map((x) => x.tableId)
          .filter(Boolean)
          .map(String),
      ]),
    ]
    const fromLabels = fromIds.map((id) => labelFor(id)).filter(Boolean)
    return {
      ...t,
      status: check.checkStatus === 'billing' ? 'billing' : 'occupied',
      guests: check.guests,
      openedAt: check.openedAt,
      amount: check.amount ?? lineTotal(check.lines),
      mergedIntoId: undefined,
      mergedIntoLabel: undefined,
      mergedFromIds: fromIds.length ? fromIds : undefined,
      mergedFromLabels: fromLabels.length ? fromLabels : undefined,
    }
  })
}

function isSeedStockId(id: string) {
  const bare = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id
  const bareNoStk = bare.startsWith('stk-') ? bare.slice(4) : bare
  return (
    /^s\d+$/.test(bare) ||
    /^s\d+$/.test(bareNoStk) ||
    seedStock.some((s) => s.id === bare || s.id === bareNoStk || s.id === id)
  )
}

function isSeedStockItem(row: { id?: string; sku?: string; ingredientId?: string }) {
  if (row.id && isSeedStockId(row.id)) return true
  if (row.ingredientId && isSeedStockId(row.ingredientId)) return true
  return isSeedIngredient({ id: row.ingredientId, sku: row.sku })
}

function loadStock(): StockItem[] {
  const branchId = getActiveBranchId()
  try {
    const raw = tenantGetItem(STOCK_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StockItem[]
      if (Array.isArray(parsed) && parsed.length) {
        return enrichStockVendors(
          stockForBranch(
            parsed.map(migrateStockItem).filter((s) => !isSeedStockItem(s)),
            branchId,
          ),
        )
      }
    }
  } catch {
    /* ignore */
  }
  // Production starts empty — use Database → Import (CSV/Excel) for stock.
  return []
}

function saveStock(items: StockItem[]) {
  tenantSetItem(STOCK_KEY, JSON.stringify(items))
}

function loadKitchen(): KitchenTicket[] {
  try {
    const raw = tenantGetItem(KITCHEN_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as KitchenTicket[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((k) => !DEMO_KITCHEN_IDS.has(k.id))
  } catch {
    return []
  }
}

function saveKitchen(rows: KitchenTicket[]) {
  tenantSetItem(
    KITCHEN_KEY,
    JSON.stringify(rows.filter((k) => !DEMO_KITCHEN_IDS.has(k.id)).slice(0, 200)),
  )
}

export function PosProvider({ children }: { children: ReactNode }) {
  const { syncEpoch } = useSync()
  const { activeBranchId } = useBranch()
  const { extraCharges, taxes } = useCatalog()
  const floorSeeded = useRef(false)
  const persistEpoch = useRef(-1)
  const ticketsRef = useRef<OpenTicket[]>([])
  const bootBranchRef = useRef<string | null>(null)
  const [floorLayout, setFloorLayout] = useState<Table[]>([])
  const floorLayoutRef = useRef<Table[]>(floorLayout)
  floorLayoutRef.current = floorLayout
  const [tickets, setTickets] = useState<OpenTicket[]>([])
  const [ticketsReady, setTicketsReady] = useState(false)
  const [kitchen, setKitchen] = useState<KitchenTicket[]>(loadKitchen)
  const [stock, setStock] = useState<StockItem[]>(loadStock)
  const [ingredients, setIngredients] = useState<Ingredient[]>(() =>
    ingredientsForBranch(loadIngredients(), getActiveBranchId()),
  )
  const [ledger, setLedger] = useState<LedgerEntry[]>(loadAllLedger)
  const [dayClosedOn, setDayClosedOn] = useState<string | null>(() => loadDayClosed())
  const [toastState, setToastState] = useState<Toast>({ message: '', kind: 'ok', at: 0 })
  /** Active extra charges from Master Data only — no hardcoded demo fallback. */
  const chargeCatalog = useMemo(
    () => chargesForBranch(extraCharges, activeBranchId).filter((c) => c.active),
    [extraCharges, activeBranchId],
  )

  const ticketsOpen = useMemo(
    () => tickets.filter((t) => t.checkStatus !== 'settled'),
    [tickets],
  )
  const tables = useMemo(() => occupyLayout(floorLayout, ticketsOpen), [floorLayout, ticketsOpen])
  const tableOrders = useMemo(() => {
    const next: Record<string, OrderLine[]> = {}
    const branchId = getActiveBranchId()
    for (const table of floorLayout) {
      const check = dineCheckForTable(ticketsOpen, table.id, branchId)
      if (check) next[table.id] = collapseOpenLines(check.lines)
    }
    return next
  }, [ticketsOpen, floorLayout])
  const tableDiscounts = useMemo(() => {
    const next: Record<string, number> = {}
    const branchId = getActiveBranchId()
    for (const table of floorLayout) {
      const check = dineCheckForTable(ticketsOpen, table.id, branchId)
      if (check?.discountPct) next[table.id] = check.discountPct
    }
    return next
  }, [ticketsOpen, floorLayout])
  const tableTicketNotes = useMemo(() => {
    const next: Record<string, string> = {}
    const branchId = getActiveBranchId()
    for (const table of floorLayout) {
      const check = dineCheckForTable(ticketsOpen, table.id, branchId)
      const note = check?.note?.trim()
      if (note) next[table.id] = note
    }
    return next
  }, [ticketsOpen, floorLayout])
  const tableCharges = useMemo(() => {
    const next: Record<string, string[]> = {}
    const branchId = getActiveBranchId()
    for (const table of floorLayout) {
      const check = dineCheckForTable(ticketsOpen, table.id, branchId)
      if (check?.chargeIds?.length) next[table.id] = check.chargeIds
    }
    return next
  }, [ticketsOpen, floorLayout])
  const qsTickets = useMemo(
    () => ticketsOpen.filter((t) => t.type !== 'dine-in'),
    [ticketsOpen],
  )

  useEffect(() => {
    let cancelled = false
    const branchId = activeBranchId
    const isBranchSwitch = bootBranchRef.current !== branchId
    bootBranchRef.current = branchId

    // Only wipe the floor UI on real branch switches. Background syncEpoch bumps
    // (peer edits on another PC) must refresh in place — clearing caused section blink.
    if (isBranchSwitch) {
      persistEpoch.current = -1
      floorSeeded.current = false
      setFloorLayout([])
      setTicketsReady(false)
      setIngredients(ingredientsForBranch(loadIngredients(), branchId))
    }
    ;(async () => {
      await migrateLocalStorageToDexie()
      const [stored, floorRows, stockRows, kotRows] = await Promise.all([
        ticketsRepo.list(branchId),
        floorRepo.list(branchId),
        mesaDb.stock.toArray(),
        mesaDb.kitchen.toArray(),
      ])
      if (cancelled) return
      setDayClosedOn(loadDayClosed(branchId))
      setLedger(loadAllLedger())
      if (apiMastersReady()) {
        try {
          const latest = (await apiLatestDayClose(branchId)) as { dayKey?: string } | null
          if (!cancelled && latest?.dayKey === todayKey()) setDayClosedOn(latest.dayKey)
        } catch {
          /* keep local close flag */
        }
        try {
          const remote = (await apiListLedger(branchId)) as Record<string, unknown>[]
          if (!cancelled) {
            const pending = loadOutbox()
              .filter((o) => o.type === 'ledger.upsert' && (o.status === 'pending' || o.status === 'syncing'))
              .map((o) => o.payload as LedgerEntry)
            const merged = mergeRemoteLedger(
              loadAllLedger(),
              remote.map(fromApiLedgerEntry),
              branchId,
              pending,
            )
            saveLedger(merged)
            setLedger(merged)
            const remoteIds = new Set(remote.map((r) => String(r.id)))
            const pendingIds = new Set(pending.map((p) => p.id).filter(Boolean))
            for (const entry of merged) {
              if (entry.branchId && entry.branchId !== branchId) continue
              if (!entry.id || remoteIds.has(entry.id) || pendingIds.has(entry.id)) continue
              enqueueOutbox('ledger.upsert', entry.id, { ...entry, branchId }, getDeviceId(), branchId)
            }
          }
        } catch {
          /* keep local ledger */
        }
      }

      let layout = floorRows
      if (apiMastersReady()) {
        try {
          const remote = await apiListFloor(branchId)
          if (remote.length) {
            layout = await floorRepo.replace(
              remote.map((row) => {
                const note = row.note != null ? String(row.note).trim() : ''
                return {
                  id: String(row.id),
                  label: String(row.label ?? ''),
                  seats: Number(row.seats ?? 2),
                  area: String(row.area ?? 'Main Hall'),
                  note: note || undefined,
                  status: 'free' as const,
                  branchId: String(row.branchId ?? branchId),
                }
              }),
              branchId,
            )
          }
        } catch {
          /* keep local floor */
        }
      }
      if (cancelled) return
      if (layout.length) {
        setFloorLayout((prev) =>
          !isBranchSwitch && floorLayoutSig(prev) === floorLayoutSig(layout) ? prev : layout,
        )
        floorSeeded.current = true
        ensureAreasFromTables(
          layout.map((t) => t.area),
          undefined,
          branchId,
        )
      } else if (isBranchSwitch) {
        // New / empty branch: do not copy demo tables or other branches' floor plan.
        floorSeeded.current = true
        setFloorLayout([])
        await floorRepo.replace([], branchId)
      }

      let nextTickets = stored
      if (apiMastersReady()) {
        try {
          const remote = (await apiListTickets(branchId)) as Record<string, unknown>[]
          if (!cancelled) {
            const { pendingCreates, pendingUpdates, settledIds } = pendingTicketSlices()
            const mapped = remote
              .map((row) => ticketFromServer(row))
              .filter((t): t is OpenTicket => Boolean(t))
              .map((t) =>
                t.tableId ? { ...t, tableId: alignFloorTableId(t.tableId, layout) ?? t.tableId } : t,
              )
            nextTickets = mergeRemoteTickets(
              mapped,
              branchId,
              pendingCreates,
              settledIds,
              ticketsOtherBranch(stored, branchId),
              stored,
              pendingUpdates,
            )
            await ticketsRepo.saveAll(nextTickets, branchId)
          }
        } catch {
          /* keep local tickets */
        }
      }
      if (cancelled) return
      if (ticketsSig(nextTickets) !== ticketsSig(ticketsRef.current) || !ticketsReady) {
        setTickets(nextTickets)
      }
      persistEpoch.current = syncEpoch
      const scopedStock = stockForBranch(
        stockRows.filter((s) => !isSeedStockItem(s)),
        branchId,
      )
      if (apiMastersReady()) {
        try {
          const remoteStock = ((await apiListStock(branchId)) as StockItem[]).filter(
            (s) => !isSeedStockItem(s),
          )
          if (remoteStock.length) {
            const others = stockRows.filter(
              (s) => s.branchId && s.branchId !== branchId && !isSeedStockItem(s),
            )
            const prevById = new Map(stockRows.map((s) => [s.id, s]))
            const incoming = enrichStockVendors(
              remoteStock.map((s) => {
                const id = scopedStockId(String(s.id), branchId)
                const prev = prevById.get(id) ?? prevById.get(String(s.id))
                return {
                  ...s,
                  id,
                  branchId,
                  vendor: s.vendor?.trim() || prev?.vendor,
                  vendorId: s.vendorId || prev?.vendorId,
                }
              }),
            )
            await mesaDb.stock.clear()
            await mesaDb.stock.bulkPut([...others, ...incoming])
            setStock(incoming)
            saveStock(incoming)
          } else if (isHeadOfficeBranchId(branchId)) {
            // HO must not inherit unscoped / restaurant local stock.
            const others = stockRows.filter((s) => s.branchId && s.branchId !== branchId)
            await mesaDb.stock.clear()
            if (others.length) await mesaDb.stock.bulkPut(others)
            setStock([])
            saveStock([])
          } else if (scopedStock.length) {
            const enriched = enrichStockVendors(
              scopedStock.map((s) => ({ ...s, branchId: s.branchId ?? branchId })),
            )
            setStock(enriched)
            saveStock(enriched)
          } else {
            setStock([])
            saveStock([])
          }
        } catch {
          if (isHeadOfficeBranchId(branchId)) {
            setStock([])
          } else if (scopedStock.length) {
            const enriched = enrichStockVendors(scopedStock)
            setStock(enriched)
            saveStock(enriched)
          } else {
            setStock([])
          }
        }
      } else if (scopedStock.length) {
        const enriched = enrichStockVendors(scopedStock)
        setStock(enriched)
        saveStock(enriched)
      } else if (isHeadOfficeBranchId(branchId)) {
        setStock([])
      }
      let ingRows = loadIngredients().filter((r) => !isSeedIngredient(r))
      // Purge seed leftovers from local storage immediately.
      {
        const cleaned = loadIngredients().filter((r) => !isSeedIngredient(r))
        if (cleaned.length !== loadIngredients().length) saveIngredients(cleaned)
      }
      if (apiMastersReady()) {
        try {
          const remoteRaw = (await apiListIngredients(branchId)) as Record<string, unknown>[]
          const remote = remoteRaw
            .map((r) => fromApiIngredient(r))
            .filter((r) => !isSeedIngredient(r) && (!r.branchId || r.branchId === branchId))
            .map((r) => ({ ...r, branchId: r.branchId || branchId }))
          // Trust server list for this branch — do not re-upload local ghosts.
          ingRows = remote
          const others = loadIngredients().filter(
            (r) => r.branchId && r.branchId !== branchId && !isSeedIngredient(r),
          )
          saveIngredients([...others, ...ingRows])
        } catch {
          ingRows = ingredientsForBranch(ingRows, branchId)
        }
      } else {
        ingRows = ingredientsForBranch(ingRows, branchId)
      }
      setIngredients(ingRows)
      setStock((prev) => {
        const linked = prev.map((s) => ({
          ...s,
          ingredientId: s.ingredientId || s.id,
        }))
        ingRows = migrateIngredientVendorsFromStock(ingRows, linked)
        ingRows = migrateIngredientReorderFromStock(ingRows, linked)
        ingRows = normalizeIngredients(ingRows).filter(
          (r) => r.branchId === branchId && !isSeedIngredient(r),
        )
        const deduped = dedupeIngredientsByName(ingRows)
        ingRows = deduped.ingredients
        const remapped = remapStockIngredientIds(linked, deduped.idMap)
        const synced = applyIngredientFieldsToStock(remapped, ingRows)
        const others = loadIngredients().filter(
          (r) => r.branchId && r.branchId !== branchId && !isSeedIngredient(r),
        )
        setIngredients(ingRows)
        saveIngredients([...others, ...ingRows])
        saveStock(synced)
        void mesaDb.stock.bulkPut(synced)
        return synced
      })
      const reconciled = mergeKitchenFromTickets(
        kotRows
          .filter((k) => !DEMO_KITCHEN_IDS.has(k.id))
          .map((k) => ({ ...k, branchId: k.branchId ?? branchId })),
        nextTickets,
      )
      setKitchen((prev) => {
        if (kitchenSig(prev) === kitchenSig(reconciled)) return prev
        void persistKitchenBoard(reconciled, branchId)
        return reconciled
      })
      setTicketsReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [syncEpoch, activeBranchId])

  useEffect(() => {
    if (!ticketsReady) return
    void persistKitchenBoard(kitchen, getActiveBranchId())
  }, [kitchen, ticketsReady])

  useEffect(() => {
    ticketsRef.current = tickets
  }, [tickets])

  useEffect(() => {
    const onIngredientsChanged = () => {
      setIngredients(ingredientsForBranch(loadIngredients(), getActiveBranchId()))
    }
    window.addEventListener('mesa:ingredients-changed', onIngredientsChanged)
    return () => window.removeEventListener('mesa:ingredients-changed', onIngredientsChanged)
  }, [])

  useEffect(() => {
    const softReloadFloor = () => {
      void floorRepo.list(getActiveBranchId()).then((rows) => {
        setFloorLayout((prev) => {
          // Ignore transient empty reads while Dexie replace is mid-flight.
          if (!rows.length && prev.length) return prev
          return floorLayoutSig(prev) === floorLayoutSig(rows) ? prev : rows
        })
      })
    }
    window.addEventListener(FLOOR_SYNC_EVENT, softReloadFloor)
    return () => window.removeEventListener(FLOOR_SYNC_EVENT, softReloadFloor)
  }, [])

  useEffect(() => {
    if (!ticketsReady || persistEpoch.current !== syncEpoch) return
    void ticketsRepo.saveAll(tickets, getActiveBranchId())
  }, [tickets, ticketsReady, syncEpoch])

  useEffect(() => {
    if (!ticketsReady || !apiMastersReady()) return
    let cancelled = false

    const refreshTicketsFromServer = async () => {
      const branchId = getActiveBranchId()
      try {
        const remote = (await apiListTickets(branchId)) as Record<string, unknown>[]
        if (cancelled) return
        const { pendingCreates, pendingUpdates, settledIds } = pendingTicketSlices()
        const mapped = mapRemoteTickets(remote, floorLayout)
        const next = mergeRemoteTickets(
          mapped,
          branchId,
          pendingCreates,
          settledIds,
          ticketsOtherBranch(ticketsRef.current, branchId),
          ticketsRef.current,
          pendingUpdates,
        )
        await ticketsRepo.saveAll(next, branchId)
        if (ticketsSig(next) !== ticketsSig(ticketsRef.current)) setTickets(next)
        // Only update kitchen state when content changes — avoid 2s re-renders that blink the ticket UI.
        setKitchen((prev) => {
          const merged = mergeKitchenFromTickets(prev, next)
          if (kitchenSig(prev) === kitchenSig(merged)) return prev
          void persistKitchenBoard(merged, branchId)
          return merged
        })
      } catch {
        /* keep local tickets */
      }
    }

    const onSync = () => {
      void refreshTicketsFromServer()
    }
    window.addEventListener(TICKETS_SYNC_EVENT, onSync)

    void refreshTicketsFromServer()
    const id = window.setInterval(() => {
      void refreshTicketsFromServer()
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener(TICKETS_SYNC_EVENT, onSync)
    }
  }, [ticketsReady, activeBranchId, floorLayout])

  const branchKitchen = useMemo(
    () => kitchen.filter((k) => !k.branchId || k.branchId === activeBranchId),
    [kitchen, activeBranchId],
  )
  const branchLedger = useMemo(
    () => ledger.filter((e) => !e.branchId || e.branchId === activeBranchId),
    [ledger, activeBranchId],
  )
  const branchIngredients = useMemo(
    () => ingredientsForBranch(ingredients, activeBranchId),
    [ingredients, activeBranchId],
  )
  const dayIsClosed = dayClosedOn === todayKey()

  const flash = useCallback((message: string, kind?: FlashKind, durationMs?: number) => {
    const resolved = kind ?? inferFlashKind(message)
    const at = Date.now()
    const ms = durationMs ?? (resolved === 'err' ? ERROR_FLASH_MS : DEFAULT_FLASH_MS)
    setToastState({ message, kind: resolved, at })
    window.setTimeout(() => {
      setToastState((prev) => (prev.at === at ? { message: '', kind: 'ok', at: 0 } : prev))
    }, ms)
  }, [])

  const dismissFlash = useCallback(() => {
    setToastState({ message: '', kind: 'ok', at: 0 })
  }, [])

  const appendLedger = useCallback((entry: LedgerEntry) => {
    const stamped = { ...entry, branchId: entry.branchId ?? getActiveBranchId() }
    setLedger((prev) => {
      const next = [stamped, ...prev.filter((e) => e.id !== stamped.id)]
      saveLedger(next)
      return next
    })
    if (apiMastersReady()) {
      void apiPutLedger(stamped as unknown as Record<string, unknown>)
        .then(() => dropPendingUpsertsFor(stamped.id, 'ledger.upsert'))
        .catch(() =>
          enqueueOutbox('ledger.upsert', stamped.id, stamped, getDeviceId(), stamped.branchId),
        )
    } else {
      enqueueOutbox('ledger.upsert', stamped.id, stamped, getDeviceId(), stamped.branchId)
    }
  }, [])

  const recordSale = useCallback(
    (meta: SettleMeta) => {
      const entry = makeSaleEntry(meta)
      appendLedger(entry)
      if (meta.discountAmt && meta.discountAmt > 0) {
        appendLedger({
          ...entry,
          id: `${entry.id}-disc`,
          type: 'discount',
          total: meta.discountAmt,
          method: `Discount · ${meta.source}`,
        })
      }
      if (meta.charges?.length) {
        for (const c of meta.charges) {
          appendLedger({
            ...entry,
            id: `${entry.id}-${c.id}`,
            type: 'charge',
            total: c.amount,
            method: c.name,
            subtotal: c.amount,
            tax: 0,
          })
        }
      }
    },
    [appendLedger],
  )

  const deductRecipeStock = useCallback(
    (lines: OrderLine[], recipes: Record<string, { ingredientId: string; qty: number }[]>) => {
      if (!Array.isArray(lines) || !lines.length) return
      setStock((prev) => {
        const next = prev.map((s) => ({ ...s }))
        for (const line of lines) {
          const recipe = recipes[line.itemId]
          if (!recipe) continue
          for (const r of recipe) {
            const ingId = r.ingredientId
            const item = next.find(
              (s) => s.ingredientId === ingId || (!s.ingredientId && s.id === ingId),
            )
            if (item) {
              const need = roundStockQty(r.qty * line.qty)
              const balances = normalizeLocationBalances(item)
              const { balances: after, remaining } = deductFromLocations(
                balances,
                need,
                defaultDeductPreferOrder(),
              )
              if (remaining > 0) {
                const fallback = defaultReceiveLocationId()
                after[fallback] = roundStockQty(Math.max(0, (after[fallback] ?? 0) - remaining))
              }
              item.locationBalances = after
              item.onHand = totalOnHand(after)
            }
          }
        }
        saveStock(next)
        void mesaDb.stock.bulkPut(next)
        next.forEach((item) => {
          const prevItem = prev.find((s) => s.id === item.id)
          if (prevItem && prevItem.onHand !== item.onHand) {
            pushStock(item, item.onHand - prevItem.onHand)
          }
        })
        return next
      })
    },
    [],
  )

  const saveIngredient = useCallback((row: Ingredient) => {
    if (isSeedIngredient(row)) return
    const branchId = getActiveBranchId()
    const stamped = normalizeIngredient({
      ...row,
      branchId: row.branchId ?? branchId,
      name: row.name.trim(),
      sku: row.sku.trim(),
      unit: row.unit.trim() || 'pcs',
    })
    if (stamped.branchId !== branchId) return
    const { vendorId, vendor } = stamped
    const reorderAt = stamped.reorderAt ?? 0
    const homeLoc = resolveReceiveLocationId(stamped.defaultLocationId)
    setIngredients((prev) => {
      const scoped = prev.filter((r) => r.branchId === branchId && !isSeedIngredient(r))
      const nextScoped = scoped.some((r) => r.id === stamped.id)
        ? scoped.map((r) => (r.id === stamped.id ? stamped : r))
        : [...scoped, stamped].sort((a, b) => a.name.localeCompare(b.name))
      const others = loadIngredients().filter(
        (r) => r.branchId && r.branchId !== branchId && !isSeedIngredient(r),
      )
      saveIngredients([...others, ...nextScoped])
      return nextScoped
    })
    setStock((prev) => {
      const linked = prev.find((s) => s.ingredientId === stamped.id || s.id === stamped.id)
      let next: StockItem[]
      if (linked) {
        next = prev.map((s) =>
          s.id === linked.id
            ? {
                ...s,
                ingredientId: stamped.id,
                name: stamped.name,
                sku: stamped.sku,
                category: stamped.category,
                unit: stamped.unit,
                vendorId,
                vendor,
                reorderAt,
              }
            : s,
        )
      } else {
        const balances = emptyLocationBalances()
        if (homeLoc) balances[homeLoc] = 0
        const stockRow: StockItem = {
          id: `stk-${stamped.id}`,
          ingredientId: stamped.id,
          name: stamped.name,
          sku: stamped.sku,
          category: stamped.category,
          unit: stamped.unit,
          onHand: 0,
          reorderAt,
          locationBalances: balances,
          cost: 0,
          branchId,
          vendorId,
          vendor,
        }
        next = [...prev, stockRow]
      }
      saveStock(next)
      void mesaDb.stock.bulkPut(next)
      const created = next.find((s) => s.ingredientId === stamped.id)
      if (created && !linked) pushStock(created, 0)
      else if (linked) pushStock(next.find((s) => s.id === linked.id)!, 0)
      return next
    })
    if (apiMastersReady()) {
      void apiPutIngredient({
        ...(stamped as unknown as Record<string, unknown>),
        branchId,
      })
        .then(() => {
          dropPendingUpsertsFor(stamped.id, 'catalog.upsert')
        })
        .catch(() => {
          enqueueOutbox(
            'catalog.upsert',
            stamped.id,
            { kind: 'ingredient', row: stamped },
            getDeviceId(),
            branchId,
          )
        })
    } else {
      enqueueOutbox(
        'catalog.upsert',
        stamped.id,
        { kind: 'ingredient', row: stamped },
        getDeviceId(),
        branchId,
      )
    }
  }, [])

  const deleteIngredient = useCallback((id: string) => {
    const branchId = getActiveBranchId()
    setIngredients((prev) => {
      const nextScoped = prev.filter((r) => r.id !== id && !isSeedIngredient(r))
      const others = loadIngredients().filter(
        (r) => r.branchId && r.branchId !== branchId && !isSeedIngredient(r),
      )
      saveIngredients([...others, ...nextScoped])
      return nextScoped
    })
    if (apiMastersReady()) {
      void apiDeleteIngredient(id)
        .then(() => dropPendingUpsertsFor(id, 'catalog.upsert'))
        .catch(() =>
          enqueueOutbox('catalog.delete', id, { kind: 'ingredient' }, getDeviceId(), null),
        )
    } else {
      enqueueOutbox('catalog.delete', id, { kind: 'ingredient' }, getDeviceId(), null)
    }
  }, [])

  const receiveStock = useCallback(
    (
      items: {
        stockId: string
        qty: number
        cost?: number
        vendorId?: string
        vendor?: string
      }[],
    ) => {
      setStock((prev) => {
        const next = prev.map((s) => ({ ...s }))
        for (const row of items) {
          if (row.qty <= 0) continue
          const item = next.find((s) => s.id === row.stockId)
          if (!item) continue
          const balances = normalizeLocationBalances(item)
          const ing = ingredients.find((r) => r.id === item.ingredientId || r.id === item.id)
          const recv = resolveReceiveLocationId(ing?.defaultLocationId)
          balances[recv] = roundStockQty((balances[recv] ?? 0) + row.qty)
          item.locationBalances = balances
          item.onHand = totalOnHand(balances)
          if (typeof row.cost === 'number' && row.cost > 0) {
            item.cost = Math.round(row.cost * 100) / 100
          }
          pushStock(item, row.qty)
        }
        saveStock(next)
        void mesaDb.stock.bulkPut(next)
        return next
      })
    },
    [ingredients],
  )

  const transferStockLocation = useCallback(
    (
      stockId: string,
      fromLocation: StockLocationId,
      toLocation: StockLocationId,
      qty: number,
      _note?: string,
    ) => {
      if (!(qty > 0) || !Number.isFinite(qty)) return false
      if (fromLocation === toLocation) return false
      let ok = false
      setStock((prev) => {
        const next = prev.map((s) => ({ ...s, locationBalances: normalizeLocationBalances(s) }))
        const item = next.find((s) => s.id === stockId)
        if (!item) return prev
        const balances = normalizeLocationBalances(item)
        const fromQty = balances[fromLocation] ?? 0
        if (fromQty < qty) return prev
        balances[fromLocation] = roundStockQty(fromQty - qty)
        balances[toLocation] = roundStockQty((balances[toLocation] ?? 0) + qty)
        item.locationBalances = balances
        item.onHand = totalOnHand(balances)
        pushStock(item)
        saveStock(next)
        void mesaDb.stock.bulkPut(next)
        ok = true
        return next
      })
      return ok
    },
    [],
  )

  const adjustStock = useCallback(
    (stockId: string, delta: number, reason?: string, opts?: { quiet?: boolean }) => {
      if (!delta) return
      const branchId = getActiveBranchId()
      setStock((prev) => {
        const next = prev.map((s) => {
          if (s.id !== stockId) return s
          const balances = normalizeLocationBalances(s)
          const ing = ingredients.find((r) => r.id === s.ingredientId || r.id === s.id)
          const recv = resolveReceiveLocationId(ing?.defaultLocationId)
          balances[recv] = roundStockQty(Math.max(0, (balances[recv] ?? 0) + delta))
          const onHand = totalOnHand(balances)
          return {
            ...s,
            id: scopedStockId(s.id, branchId),
            branchId,
            locationBalances: balances,
            onHand,
          }
        })
        saveStock(next)
        void mesaDb.stock.bulkPut(next)
        const item = next.find((s) => s.id === stockId || s.id === scopedStockId(stockId, branchId))
        if (item) pushStock(item, delta)
        return next
      })
      if (!opts?.quiet) flash(reason ? `Stock adjusted · ${reason}` : 'Stock adjusted')
    },
    [flash, ingredients],
  )

  const upsertStockItem = useCallback((row: StockItem) => {
    const branchId = getActiveBranchId()
    const id = scopedStockId(row.id || `st-${Date.now()}`, branchId)
    const balances = normalizeLocationBalances({
      ...row,
      onHand: Number(row.onHand) || 0,
    })
    const stamped: StockItem = migrateStockItem({
      ...row,
      id,
      branchId,
      locationBalances: balances,
      onHand: totalOnHand(balances),
      sku: String(row.sku || '').trim(),
      name: String(row.name || '').trim(),
      category: String(row.category || 'General').trim() || 'General',
      unit: String(row.unit || 'pcs').trim() || 'pcs',
      reorderAt: Number(row.reorderAt) || 0,
      cost: Number(row.cost) || 0,
      ingredientId: row.ingredientId || id,
    })
    setStock((prev) => {
      const others = prev.filter((s) => s.id !== stamped.id)
      const next = enrichStockVendors([stamped, ...others])
      saveStock(next)
      void mesaDb.stock.bulkPut(next)
      return next
    })
    pushStock(stamped, 0)
    return stamped
  }, [])

  const patchDine = useCallback(
    (tableId: string, mutator: (ticket: OpenTicket) => OpenTicket, create = false) => {
      setTickets((prev) => {
        const layout = floorLayout.find((t) => t.id === tableId)
        const existing = dineCheckForTable(prev, tableId)
        const base: OpenTicket =
          existing ??
          {
            id: newDineTicketId(tableId),
            type: 'dine-in',
            tableId,
            customer: `Table ${layout?.label ?? tableId}`,
            openedAt: nowTime(),
            lines: [],
            guests: 2,
            checkStatus: 'open',
            branchId: getActiveBranchId(),
          }
        const nextTicket = pushTicket(mutator(base), create || !existing ? 'ticket.create' : 'ticket.update')
        const next = existing
          ? prev.map((t) => (t.id === existing.id ? nextTicket : t))
          : [nextTicket, ...prev]
        ticketsRef.current = next
        return next
      })
    },
    [floorLayout],
  )

  const pushKitchen = useCallback(
    (
      ticketId: string,
      source: string,
      lines: OrderLine[],
      priority: KitchenPriority,
      route?: { orderType?: OrderType; tableId?: string },
    ) => {
      const dishes = peekDishes()
      const categories = peekCategories()
      const pending = lines.filter((line) => !line.sent && lineRequiresKitchen(line, dishes))
      if (pending.length === 0) return
      const stations = listKdsStations(getActiveBranchId(), categories)
      const printers = loadAllPrinters()
      const table = route?.tableId ? floorLayoutRef.current.find((t) => sameFloorTable(t.id, route.tableId!)) : undefined
      const baseCtx: PrintContext = { orderType: route?.orderType, areaId: areaIdByName(table?.area) }
      const linePrinters: (PrintStation | undefined)[] = []
      const kotLines = pending.map((line) => {
        const dish = dishes.find((d) => d.id === line.itemId)
        const printer = routePrinter(printers, 'kot', { ...baseCtx, categoryIds: dishDepartmentIds(dish, categories) })
        linePrinters.push(printer)
        return {
          name: line.note?.trim() ? `${line.name} (${line.note.trim()})` : line.name,
          qty: line.qty,
          itemId: line.itemId,
          status: 'queued' as const,
          stationId:
            printer && stations.some((s) => s.id === printer.id)
              ? printer.id
              : resolveLineStationId(dish, categories, stations, printers),
        }
      })
      const kot: KitchenTicket = {
        id: `kot-${ticketId}`,
        source,
        priority,
        status: 'queued',
        createdAt: nowTime(),
        lines: kotLines,
        branchId: getActiveBranchId(),
      }
      setKitchen((prev) => [kot, ...prev.filter((k) => k.id !== kot.id)])
      void mesaDb.kitchen.put(kot)
      enqueueOutbox(
        'kot.send',
        ticketId,
        { ticketId, source, priority, status: 'queued', lines: kot.lines, branchId: kot.branchId },
        getDeviceId(),
        kot.branchId,
      )
      const lang = activeLang()
      const copy = messages(lang)
      const byPrinter = new Map<string, { printer: PrintStation; group: OrderLine[] }>()
      pending.forEach((line, i) => {
        const printer = linePrinters[i]
        if (!printer) return
        const entry = byPrinter.get(printer.id) ?? { printer, group: [] }
        entry.group.push(line)
        byPrinter.set(printer.id, entry)
      })
      for (const { printer, group } of byPrinter.values()) {
        const title = `${copy.printKotPrefix} · ${source} · ${printer.name}`
        void printEscPos(
          stationPrintJob(
            {
              type: 'kot',
              title,
              lines: group.map((line) => `${line.qty}× ${localizedLineName(line, dishes, lang)}`),
              lang,
            },
            printer,
          ),
          title,
        ).catch(() => undefined)
      }
    },
    [],
  )

  const openTable = useCallback(
    (tableId: string, guests = 2) => {
      if (dayIsClosed) {
        flash('Day is closed — reopen day in Back Office')
        return
      }
      const layout = floorLayout.find((t) => t.id === tableId)
      const branchId = getActiveBranchId()
      const floor = tables.find((t) => t.id === tableId)
      const stale = ticketsRef.current.filter(
        (t) =>
          t.type === 'dine-in' &&
          sameFloorTable(t.tableId, tableId) &&
          t.checkStatus !== 'settled' &&
          (!t.branchId || t.branchId === branchId),
      )

      if (floor?.status === 'free') {
        retireDineTickets(stale)
        const fresh = pushTicket(
          {
            id: newDineTicketId(tableId),
            type: 'dine-in',
            tableId,
            customer: `Table ${layout?.label ?? tableId}`,
            openedAt: nowTime(),
            lines: [],
            guests,
            checkStatus: 'open',
            branchId,
            amount: 0,
            reseated: true,
            replaceLines: true,
          } as OpenTicket,
          'ticket.create',
        )
        setTickets((prev) => [
          fresh,
          ...prev.filter((t) => !stale.some((s) => s.id === t.id)),
        ])
        setKitchen((prev) => prev.filter((k) => !stale.some((s) => k.id === `kot-${s.id}`)))
        if (apiMastersReady()) {
          void apiListTickets(branchId)
            .then((remote) => {
              const extra = (remote as Record<string, unknown>[])
                .map((row) => ticketFromServer(row))
                .filter((t): t is OpenTicket => Boolean(t))
                .filter(
                  (t) =>
                    t.id !== fresh.id &&
                    t.type === 'dine-in' &&
                    sameFloorTable(t.tableId, tableId) &&
                    t.checkStatus !== 'settled',
                )
              if (!extra.length) return
              retireDineTickets(extra)
              setTickets((prev) => prev.filter((t) => !extra.some((s) => s.id === t.id)))
            })
            .catch(() => undefined)
        }
        return
      }

      patchDine(tableId, (t) => ({ ...t, guests, checkStatus: 'open', openedAt: t.openedAt || nowTime() }), true)
    },
    [dayIsClosed, flash, patchDine, floorLayout, tables],
  )

  const setGuests = useCallback(
    (tableId: string, guests: number) => {
      patchDine(tableId, (t) => ({ ...t, guests: Math.max(1, guests) }))
    },
    [patchDine],
  )

  const selectAddToTable = useCallback(
    (tableId: string, item: MenuItem, note?: string) => {
      if (dayIsClosed) {
        flash('Day is closed — cannot add items')
        return
      }
      const existing = dineCheckForTable(ticketsRef.current, tableId)
      if (isMergedCheck(existing)) {
        const label =
          floorLayout.find((t) => t.id === existing?.mergedIntoTableId)?.label ??
          existing?.mergedIntoTableId
        flash(`Table is merged — add items on Table ${label}`, 'err')
        return
      }
      patchDine(tableId, (t) => {
        const current = t.lines
        const noteKey = note ?? ''
        const existingLine = current.find(
          (line) => line.itemId === item.id && !line.sent && (line.note ?? '') === noteKey,
        )
        const lines = collapseOpenLines(
          existingLine
            ? current.map((line) => (line.id === existingLine.id ? { ...line, qty: line.qty + 1 } : line))
            : [
                ...current,
                {
                  id: `u:${item.id}:${noteKey || '_'}:${current.filter((l) => l.itemId === item.id).length}`,
                  itemId: item.id,
                  name: item.name,
                  nameAr: item.alias?.trim() || undefined,
                  qty: 1,
                  price: item.price,
                  note,
                  sent: false,
                },
              ],
        )
        return { ...t, lines, amount: lineTotal(lines) }
      })
    },
    [dayIsClosed, flash, patchDine, floorLayout],
  )

  const setTableLineNote = useCallback(
    (tableId: string, lineId: string, note: string) => {
      const cleaned = note.trim()
      patchDine(tableId, (t) => {
        const display =
          collapseOpenLines(t.lines).find((l) => l.id === lineId) ??
          t.lines.find((l) => l.id === lineId)
        if (!display) return t
        const key = openLineKey(display)
        const lines = t.lines.map((line) => {
          if (display.sent) {
            return line.id === lineId ? { ...line, note: cleaned || undefined } : line
          }
          if (line.sent) return line
          if (line.id === lineId || openLineKey(line) === key) {
            return { ...line, note: cleaned || undefined }
          }
          return line
        })
        return { ...t, lines, amount: lineTotal(lines) }
      })
    },
    [patchDine],
  )

  const setTableTicketNote = useCallback(
    (tableId: string, note: string) => {
      const cleaned = note.trim()
      patchDine(tableId, (t) => ({ ...t, note: cleaned || undefined }))
    },
    [patchDine],
  )

  const changeTableQty = useCallback(
    (tableId: string, lineId: string, delta: number) => {
      patchDine(tableId, (t) => {
        const lines = adjustDisplayQty(t.lines, lineId, delta)
        return { ...t, lines, amount: lineTotal(lines) }
      })
    },
    [patchDine],
  )

  const voidTableLine = useCallback(
    (tableId: string, lineId: string, reason = 'Void', staff?: string) => {
      const display =
        (tableOrders[tableId] ?? []).find((l) => l.id === lineId) ??
        collapseOpenLines(dineCheckForTable(ticketsRef.current, tableId)?.lines ?? []).find(
          (l) => l.id === lineId,
        )
      if (!display) {
        flash('Line not found — refresh and try again', 'err')
        return
      }
      const amount = display.qty * display.price
      const table = tables.find((t) => t.id === tableId)
      let removed = false
      patchDine(tableId, (t) => {
        const lines = removeDisplayLine(t.lines, display)
        removed = lines.length < t.lines.length || lineTotal(lines) < lineTotal(t.lines)
        return { ...t, lines, amount: lineTotal(lines) }
      })
      if (!removed) {
        flash('Could not void line — try again', 'err')
        return
      }
      appendLedger({
        id: `void-${Date.now()}`,
        at: new Date().toISOString(),
        day: todayKey(),
        type: 'void',
        source: `Table ${table?.label ?? tableId}`,
        method: reason,
        subtotal: amount,
        tax: 0,
        total: amount,
        staff,
        voidReason: reason,
        voidLineName: `${display.qty}× ${display.name}`,
        lines: [{ name: display.name, qty: display.qty, price: display.price }],
      })
      appendAudit({
        action: 'void.line',
        staff,
        entityId: tableId,
        detail: `${reason}: ${display.qty}× ${display.name}`,
        amount,
      })
      flash(`Voided ${display.name}`)
    },
    [appendLedger, flash, patchDine, tableOrders, tables],
  )

  const sendTableOrders = useCallback(
    (tableId: string, priority: KitchenPriority) => {
      const table = tables.find((t) => t.id === tableId)
      const ticket = dineCheckForTable(ticketsOpen, tableId)
      const lines = tableOrders[tableId] ?? []
      const unsent = lines.filter((line) => !line.sent)
      if (!unsent.length) {
        flash('Nothing new to send')
        return
      }
      const kitchenUnsent = kitchenPendingLines(lines)
      if (ticket && kitchenUnsent.length) {
        pushKitchen(ticket.id, `Table ${table?.label ?? ''}`, lines, priority, { orderType: 'dine-in', tableId })
      }
      patchDine(tableId, (t) => ({
        ...t,
        lines: t.lines.map((line) => ({ ...line, sent: true })),
        ...(kitchenUnsent.length
          ? { kitchenStatus: 'queued' as const, kitchenPriority: priority, kitchenDismissed: false }
          : {}),
      }))
      flash(
        kitchenUnsent.length
          ? `Orders sent to kitchen (${priority})`
          : 'Ready items marked — no kitchen ticket',
      )
    },
    [flash, pushKitchen, tableOrders, tables, ticketsOpen, patchDine],
  )

  const transferTable = useCallback(
    (fromId: string, toId: string) => {
      const from = dineCheckForTable(ticketsOpen, fromId)
      if (!from) return
      if (isMergedCheck(from)) {
        flash('Cannot transfer a merged table — settle the target first', 'err')
        return
      }
      if (dineCheckForTable(ticketsOpen, toId)) {
        flash('Destination table is occupied', 'err')
        return
      }
      const destLabel = floorLayout.find((t) => t.id === toId)?.label ?? toId
      const transferred = pushTicket(
        {
          ...from,
          tableId: toId,
          customer: `Table ${destLabel}`,
        },
        'ticket.update',
      )
      setTickets((prev) => prev.map((t) => (t.id === from.id ? transferred : t)))
      flash(`Moved to Table ${destLabel}`)
    },
    [flash, ticketsOpen, floorLayout],
  )

  const mergeTables = useCallback(
    (primaryId: string, secondaryId: string) => {
      const primary = dineCheckForTable(ticketsOpen, primaryId)
      const secondary = dineCheckForTable(ticketsOpen, secondaryId)
      const secondaryLayout = floorLayout.find((t) => t.id === secondaryId)
      const primaryLayout = floorLayout.find((t) => t.id === primaryId)
      if (!primary) return
      if (isMergedCheck(primary) || isMergedCheck(secondary)) {
        flash('Cannot merge a table that is already merged', 'err')
        return
      }

      const fromIds = [
        ...new Set([...(primary.mergedFromTableIds ?? []), secondaryId]),
      ]
      const destLabel = primaryLayout?.label ?? primaryId
      const srcLabel = secondaryLayout?.label ?? secondaryId

      // Free / empty table: link as physical MERGED seating (no bill lines to move).
      if (!secondary) {
        const stub = pushTicket(
          {
            id: newDineTicketId(secondaryId),
            type: 'dine-in',
            tableId: secondaryId,
            customer: `Merged → Table ${destLabel}`,
            openedAt: nowTime(),
            lines: [],
            amount: 0,
            guests: 0,
            checkStatus: 'merged',
            mergedIntoTableId: primaryId,
            branchId: getActiveBranchId(),
            kitchenDismissed: true,
          },
          'ticket.create',
        )
        patchDine(primaryId, (t) => ({
          ...t,
          mergedFromTableIds: fromIds,
        }))
        setTickets((prev) => [stub, ...prev.filter((t) => t.id !== stub.id)])
        flash(`Linked free Table ${srcLabel} → Table ${destLabel} · marked MERGED`)
        return
      }

      const merged = [...primary.lines, ...secondary.lines]
      patchDine(primaryId, (t) => ({
        ...t,
        lines: merged,
        guests: (t.guests ?? 0) + (secondary.guests ?? 0),
        amount: lineTotal(merged),
        mergedFromTableIds: fromIds,
      }))
      const stub = pushTicket(
        {
          ...secondary,
          lines: [],
          amount: 0,
          chargeIds: [],
          discountPct: 0,
          checkStatus: 'merged',
          mergedIntoTableId: primaryId,
          mergedFromTableIds: undefined,
          kitchenDismissed: true,
          kitchenStatus: undefined,
          customer: `Merged → Table ${destLabel}`,
        },
        'ticket.update',
      )
      setTickets((prev) => prev.map((t) => (t.id === secondary.id ? stub : t)))
      void mesaDb.kitchen.delete(`kot-${secondary.id}`)
      setKitchen((prev) => prev.filter((k) => k.id !== `kot-${secondary.id}`))
      flash(`Merged Table ${srcLabel} → Table ${destLabel} · source stays MERGED`)
    },
    [flash, ticketsOpen, floorLayout, patchDine],
  )

  const setTableDiscount = useCallback(
    (tableId: string, percent: number) => {
      patchDine(tableId, (t) => ({ ...t, discountPct: Math.min(100, Math.max(0, percent)) }))
    },
    [patchDine],
  )

  const toggleTableCharge = useCallback(
    (tableId: string, chargeId: string) => {
      patchDine(tableId, (t) => {
        const cur = t.chargeIds ?? []
        const chargeIds = cur.includes(chargeId) ? cur.filter((id) => id !== chargeId) : [...cur, chargeId]
        return { ...t, chargeIds }
      })
    },
    [patchDine],
  )

  const getTableChargeLines = useCallback(
    (tableId: string, goodsSubtotal: number) => {
      const ids = tableCharges[tableId] ?? []
      return ids
        .map((id) => {
          return (
            chargeCatalog.find((c) => c.id === id && c.active) ??
            chargeCatalog.find((c) => c.id.startsWith(`${id}__`) && c.active) ??
            chargeCatalog.find((c) => id.startsWith(`${c.id}__`) && c.active)
          )
        })
        .filter(Boolean)
        .map((c) => ({
          id: c!.id,
          name: c!.name,
          amount: c!.percent
            ? Math.round(((goodsSubtotal * c!.amount) / 100) * 100) / 100
            : c!.amount,
          taxPercent: dishTaxPercent(c!.taxIds, taxes),
        }))
    },
    [chargeCatalog, tableCharges, taxes],
  )

  const requestBill = useCallback(
    (tableId: string) => {
      const check = dineCheckForTable(ticketsRef.current, tableId)
      if (isMergedCheck(check)) {
        const label =
          floorLayout.find((t) => t.id === check?.mergedIntoTableId)?.label ??
          check?.mergedIntoTableId
        flash(`Table is merged — bill Table ${label} instead`, 'err')
        return
      }
      patchDine(tableId, (t) => ({ ...t, checkStatus: 'billing', amount: lineTotal(t.lines) }))
      flash('Temporary bill ready')
    },
    [flash, patchDine, floorLayout],
  )

  const settleTable = useCallback(
    (tableId: string, meta?: SettleMeta) => {
      const open = ticketsRef.current
      const primary = dineCheckForTable(open, tableId)
      if (isMergedCheck(primary)) {
        const label =
          floorLayout.find((t) => t.id === primary?.mergedIntoTableId)?.label ??
          primary?.mergedIntoTableId
        flash(`Table is merged — settle Table ${label} instead`, 'err')
        return
      }

      const linkedSources = open.filter(
        (t) =>
          t.type === 'dine-in' &&
          t.checkStatus !== 'settled' &&
          (t.mergedIntoTableId === tableId ||
            (primary?.mergedFromTableIds ?? []).some((id) => sameFloorTable(t.tableId, id))),
      )
      const masterTxnId =
        meta?.masterTxnId ??
        `txn-${primary?.id ?? tableId}-${Date.now().toString(36)}`
      const mergedTableIds = [
        ...new Set([
          ...(meta?.mergedTableIds ?? []),
          ...linkedSources.map((t) => t.tableId).filter(Boolean).map(String),
        ]),
      ]
      const settleMeta: SettleMeta | undefined = meta
        ? withInvoiceUuid(
            { ...meta, masterTxnId, mergedTableIds: mergedTableIds.length ? mergedTableIds : undefined },
            primary?.id ?? tableId,
          )
        : undefined

      if (settleMeta) recordSale(settleMeta)

      const toClose = [
        ...(primary ? [primary] : []),
        ...linkedSources.filter((t) => t.id !== primary?.id),
      ]
      const closeIds = new Set(toClose.map((t) => t.id))

      for (const ticket of toClose) {
        const isMaster = ticket.id === primary?.id
        enqueueOutbox(
          'ticket.settle',
          ticket.id,
          {
            ticketId: ticket.id,
            meta: {
              ...(settleMeta ?? { method: 'settle', source: tableId, subtotal: 0, tax: 0, total: 0, lines: [] }),
              masterTxnId,
              mergedTableIds,
              checkStatus: 'settled',
              ...(isMaster
                ? {}
                : {
                    method: settleMeta?.method ?? 'settle',
                    mergedClose: true,
                    mergedIntoTableId: tableId,
                  }),
            },
          },
          getDeviceId(),
        )
        void ticketsRepo.remove(ticket.id)
        void mesaDb.kitchen.delete(`kot-${ticket.id}`)
      }

      setTickets((prev) => prev.filter((t) => !closeIds.has(t.id)))
      setKitchen((prev) => prev.filter((k) => !toClose.some((t) => k.id === `kot-${t.id}`)))

      const srcLabels = linkedSources
        .map((t) => floorLayout.find((x) => sameFloorTable(x.id, t.tableId))?.label ?? t.tableId)
        .filter(Boolean)
      flash(
        srcLabels.length
          ? `Settlement complete · also closed merged ${srcLabels.map((l) => `T${l}`).join(', ')}`
          : 'Settlement complete',
      )
      appendAudit({
        action: 'settle',
        entityId: tableId,
        detail: settleMeta?.source,
        amount: settleMeta?.total,
        staff: settleMeta?.staff,
      })
      queueZatcaAfterSettle(settleMeta, primary?.id ?? tableId)
    },
    [flash, recordSale, floorLayout],
  )

  const clearEmptyTable = useCallback(
    (tableId: string) => {
      const open = ticketsRef.current
      const ticket = dineCheckForTable(open, tableId)
      if (!ticket) {
        flash('Table is already free')
        return
      }
      if (isMergedCheck(ticket)) {
        const label =
          floorLayout.find((t) => t.id === ticket.mergedIntoTableId)?.label ??
          ticket.mergedIntoTableId
        flash(`Table is merged — clear or settle Table ${label} instead`, 'err')
        return
      }
      const hasItems = ticket.lines.some((l) => (l.qty ?? 0) > 0)
      if (hasItems) {
        flash('Table has items — void or settle instead', 'err')
        return
      }
      const linked = open.filter(
        (t) =>
          t.type === 'dine-in' &&
          t.id !== ticket.id &&
          t.checkStatus !== 'settled' &&
          (t.mergedIntoTableId === tableId ||
            (ticket.mergedFromTableIds ?? []).some((id) => sameFloorTable(t.tableId, id))),
      )
      const stillHaveItems = linked.some((t) => t.lines.some((l) => (l.qty ?? 0) > 0))
      if (stillHaveItems) {
        flash('Linked merged tables still have items', 'err')
        return
      }
      const toClear = [ticket, ...linked]
      for (const row of toClear) {
        enqueueOutbox(
          'ticket.settle',
          row.id,
          {
            ticketId: row.id,
            meta: { method: 'clear-empty', source: `Table ${tableId}` },
          },
          getDeviceId(),
          row.branchId ?? getActiveBranchId(),
        )
        void ticketsRepo.remove(row.id)
        void mesaDb.kitchen.delete(`kot-${row.id}`)
      }
      const ids = new Set(toClear.map((t) => t.id))
      setTickets((prev) => prev.filter((t) => !ids.has(t.id)))
      setKitchen((prev) => prev.filter((k) => !toClear.some((t) => k.id === `kot-${t.id}`)))
      appendAudit({
        action: 'void.line',
        entityId: tableId,
        detail: 'Cleared empty occupied table',
      })
      const label = floorLayout.find((t) => t.id === tableId)?.label ?? tableId
      flash(`Table ${label} cleared · free again`)
    },
    [flash, floorLayout],
  )

  const addTicket = useCallback(
    (ticket: OpenTicket) => {
      if (dayIsClosed) {
        flash('Day is closed')
        return
      }
      const stamped = pushTicket({ ...ticket, branchId: ticket.branchId ?? getActiveBranchId() }, 'ticket.create')
      setTickets((prev) => [stamped, ...prev])
    },
    [dayIsClosed, flash],
  )

  const updateTicket = useCallback((ticketId: string, patch: Partial<OpenTicket>) => {
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? pushTicket({ ...t, ...patch }) : t)))
  }, [])

  const addToTicket = useCallback((ticketId: string, item: MenuItem, note?: string) => {
    setTickets((prev) => {
      const next = prev.map((ticket) => {
        if (ticket.id !== ticketId) return ticket
        const existing = ticket.lines.find(
          (line) => line.itemId === item.id && !line.sent && (line.note ?? '') === (note ?? ''),
        )
        const lines = collapseOpenLines(
          existing
            ? ticket.lines.map((line) =>
                line.id === existing.id ? { ...line, qty: line.qty + 1 } : line,
              )
            : [
                ...ticket.lines,
                {
                  id: `u:${item.id}:${note || '_'}:${ticket.lines.filter((l) => l.itemId === item.id).length}`,
                  itemId: item.id,
                  name: item.name,
                  nameAr: item.alias?.trim() || undefined,
                  qty: 1,
                  price: item.price,
                  note,
                  sent: false,
                },
              ],
        )
        const updated = pushTicket({ ...ticket, lines, amount: lineTotal(lines) })
        return updated
      })
      return next
    })
  }, [])

  const changeTicketQty = useCallback((ticketId: string, lineId: string, delta: number) => {
    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id !== ticketId) return ticket
        const target = ticket.lines.find((line) => line.id === lineId)
        const lines = ticket.lines
          .map((line) => (line.id === lineId ? { ...line, qty: line.qty + delta } : line))
          .filter((line) => line.qty > 0)
        const updated = pushTicket({ ...ticket, lines, amount: lineTotal(lines) })
        const nextLine = lines.find((line) => line.id === lineId)
        if (!nextLine && target) {
          enqueueOutbox('ticket.line.void', ticketId, { ticketId, lineId }, getDeviceId())
        } else if (nextLine) {
          enqueueOutbox('ticket.line.upsert', ticketId, { ticketId, line: nextLine }, getDeviceId())
        }
        return updated
      }),
    )
  }, [])

  const setTicketLineNote = useCallback((ticketId: string, lineId: string, note: string) => {
    const cleaned = note.trim()
    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id !== ticketId) return ticket
        const display =
          collapseOpenLines(ticket.lines).find((l) => l.id === lineId) ??
          ticket.lines.find((l) => l.id === lineId)
        if (!display) return ticket
        const key = openLineKey(display)
        const lines = ticket.lines.map((line) => {
          if (display.sent) {
            return line.id === lineId ? { ...line, note: cleaned || undefined } : line
          }
          if (line.sent) return line
          if (line.id === lineId || openLineKey(line) === key) {
            return { ...line, note: cleaned || undefined }
          }
          return line
        })
        return pushTicket({ ...ticket, lines, amount: lineTotal(lines) })
      }),
    )
  }, [])

  const voidTicketLine = useCallback(
    (ticketId: string, lineId: string, reason = 'Void', staff?: string) => {
      const ticket = ticketsRef.current.find((t) => t.id === ticketId)
      if (!ticket) {
        flash('Ticket not found — refresh and try again', 'err')
        return
      }
      const display =
        collapseOpenLines(ticket.lines).find((l) => l.id === lineId) ??
        ticket.lines.find((l) => l.id === lineId)
      if (!display) {
        flash('Line not found — refresh and try again', 'err')
        return
      }
      const amount = display.qty * display.price
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t
          const lines = removeDisplayLine(t.lines, display)
          enqueueOutbox('ticket.line.void', ticketId, { ticketId, lineId: display.id }, getDeviceId())
          return pushTicket({ ...t, lines, amount: lineTotal(lines) })
        }),
      )
      appendLedger({
        id: `void-${Date.now()}`,
        at: new Date().toISOString(),
        day: todayKey(),
        type: 'void',
        source: `${ticket.type} · ${ticket.customer}`,
        method: reason,
        subtotal: amount,
        tax: 0,
        total: amount,
        staff,
        voidReason: reason,
        voidLineName: `${display.qty}× ${display.name}`,
        lines: [{ name: display.name, qty: display.qty, price: display.price }],
      })
      flash(`Voided ${display.qty}× ${display.name}`)
    },
    [appendLedger, flash],
  )

  const setTicketDiscount = useCallback((ticketId: string, percent: number) => {
    const pct = Math.min(100, Math.max(0, percent))
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? pushTicket({ ...t, discountPct: pct }) : t,
      ),
    )
  }, [])

  const toggleTicketCharge = useCallback((ticketId: string, chargeId: string) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticketId) return t
        const cur = t.chargeIds ?? []
        const chargeIds = cur.includes(chargeId)
          ? cur.filter((id) => id !== chargeId)
          : [...cur, chargeId]
        return pushTicket({ ...t, chargeIds })
      }),
    )
  }, [])

  const getTicketChargeLines = useCallback(
    (ticketId: string, goodsSubtotal: number) => {
      const ticket = ticketsRef.current.find((t) => t.id === ticketId)
      const ids = ticket?.chargeIds ?? []
      return ids
        .map((id) => {
          return (
            chargeCatalog.find((c) => c.id === id && c.active) ??
            chargeCatalog.find((c) => c.id.startsWith(`${id}__`) && c.active) ??
            chargeCatalog.find((c) => id.startsWith(`${c.id}__`) && c.active)
          )
        })
        .filter(Boolean)
        .map((c) => ({
          id: c!.id,
          name: c!.name,
          amount: c!.percent
            ? Math.round(((goodsSubtotal * c!.amount) / 100) * 100) / 100
            : c!.amount,
          taxPercent: dishTaxPercent(c!.taxIds, taxes),
        }))
    },
    [chargeCatalog, taxes],
  )

  const sendTicketOrders = useCallback(
    (ticketId: string, priority: KitchenPriority) => {
      const ticket = tickets.find((t) => t.id === ticketId)
      if (!ticket) return
      const unsent = ticket.lines.filter((line) => !line.sent)
      if (!unsent.length) {
        flash('Nothing new to send')
        return
      }
      const kitchenUnsent = kitchenPendingLines(ticket.lines)
      if (kitchenUnsent.length) {
        pushKitchen(
          ticketId,
          ticket.type === 'takeaway'
            ? `Takeaway ${ticket.customer}`
            : `${ticket.type} · ${ticket.customer}`,
          ticket.lines,
          priority,
          { orderType: ticket.type, tableId: ticket.tableId },
        )
      }
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId
            ? pushTicket({
                ...t,
                lines: t.lines.map((line) => (line.sent ? line : { ...line, sent: true })),
                ...(kitchenUnsent.length
                  ? {
                      kitchenStatus: 'queued' as const,
                      kitchenPriority: priority,
                      kitchenDismissed: false,
                    }
                  : {}),
                ...((t.type === 'delivery' || t.type === 'online') &&
                kitchenUnsent.length &&
                (!t.deliveryStatus || t.deliveryStatus === 'new')
                  ? { deliveryStatus: 'preparing' as const }
                  : {}),
              })
            : t,
        ),
      )
      flash(
        kitchenUnsent.length
          ? `Orders sent to kitchen (${priority})`
          : 'Ready items marked — no kitchen ticket',
      )
    },
    [flash, pushKitchen, tickets],
  )

  const settleTicket = useCallback(
    (ticketId: string, rawMeta?: SettleMeta) => {
      const meta = withInvoiceUuid(rawMeta, ticketId)
      const ticket = ticketsRef.current.find((t) => t.id === ticketId)
      if (ticket) {
        const kitchenUnsent = kitchenPendingLines(ticket.lines)
        if (kitchenUnsent.length) {
          pushKitchen(
            ticketId,
            ticket.type === 'takeaway'
              ? `Takeaway ${ticket.customer}`
              : `${ticket.type} · ${ticket.customer}`,
            ticket.lines,
            ticket.kitchenPriority ?? 'normal',
            { orderType: ticket.type, tableId: ticket.tableId },
          )
        }
      }
      if (meta) recordSale(meta)
      setTickets((prev) => prev.filter((t) => t.id !== ticketId))
      enqueueOutbox('ticket.settle', ticketId, { ticketId, meta }, getDeviceId())
      appendAudit({
        action: 'settle',
        entityId: ticketId,
        detail: meta?.source,
        amount: meta?.total,
        staff: meta?.staff,
      })
      queueZatcaAfterSettle(meta, ticketId)
      flash('Settlement complete')
    },
    [flash, pushKitchen, recordSale],
  )

  const cancelTicket = useCallback(
    (ticketId: string, reason?: string) => {
      const ticket = ticketsRef.current.find((t) => t.id === ticketId)
      if (!ticket) return
      const branchId = ticket.branchId ?? getActiveBranchId()
      setTickets((prev) => prev.filter((t) => t.id !== ticketId))
      setKitchen((prev) => prev.filter((k) => k.id !== `kot-${ticketId}`))
      void mesaDb.kitchen.delete(`kot-${ticketId}`).catch(() => undefined)
      void ticketsRepo.remove(ticketId).catch(() => undefined)
      const payload = {
        ...ticket,
        branchId,
        status: 'cancelled',
        checkStatus: 'settled' as const,
        updatedAt: Date.now(),
        cancelReason: reason || 'Cancelled',
        replaceLines: true,
      }
      enqueueOutbox('ticket.update', ticketId, payload, getDeviceId(), branchId)
      if (apiMastersReady()) {
        void apiPutTicket(payload as unknown as Record<string, unknown>).catch(() => undefined)
      }
      appendAudit({
        action: 'void.line',
        entityId: ticketId,
        detail: reason || `Cancelled · ${ticket.customer}`,
        staff: undefined,
      })
      flash('Ticket cancelled')
    },
    [flash],
  )

  const setKitchenStatus = useCallback((ticketId: string, status: KitchenTicketStatus) => {
    setKitchen((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              status,
              lines: t.lines.map((l) => ({ ...l, status })),
            }
          : t,
      ),
    )
    const entityId = ticketId.replace(/^kot-/, '')
    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id !== entityId) return ticket
        const nextDeliveryStatus =
          status === 'ready'
            ? ticket.type === 'delivery' || ticket.type === 'online'
              ? 'ready'
              : ticket.deliveryStatus
            : status === 'cooking'
              ? ticket.type === 'delivery' || ticket.type === 'online'
                ? ticket.deliveryStatus && ticket.deliveryStatus !== 'new'
                  ? ticket.deliveryStatus
                  : 'preparing'
                : ticket.deliveryStatus
              : ticket.deliveryStatus
        return pushTicket({
          ...ticket,
          kitchenStatus: status,
          kitchenDismissed: false,
          ...(nextDeliveryStatus ? { deliveryStatus: nextDeliveryStatus } : {}),
        })
      }),
    )
    enqueueOutbox('kot.status', entityId, { ticketId: entityId, status }, getDeviceId(), getActiveBranchId())
    void mesaDb.kitchen.update(ticketId, { status })
  }, [])

  const setKitchenLineStatus = useCallback(
    (ticketId: string, lineIndex: number, status: KitchenTicketStatus) => {
      const entityId = ticketId.replace(/^kot-/, '')
      let dismiss = false
      let nextStatus: KitchenTicketStatus = 'queued'
      let nextLines: KitchenTicket['lines'] | null = null
      let found = false

      setKitchen((prev) => {
        const target = prev.find((t) => t.id === ticketId)
        if (!target) return prev
        found = true
        nextLines = target.lines.map((l, i) => (i === lineIndex ? { ...l, status } : l))
        nextStatus = aggregateKitchenStatus(nextLines.map((l) => l.status ?? target.status))
        dismiss = nextStatus === 'done'
        const boardStatus: KitchenTicketStatus = dismiss ? 'ready' : nextStatus
        if (dismiss) {
          void mesaDb.kitchen.delete(ticketId)
          return prev.filter((t) => t.id !== ticketId)
        }
        void mesaDb.kitchen.update(ticketId, { status: boardStatus, lines: nextLines })
        return prev.map((t) =>
          t.id === ticketId ? { ...t, lines: nextLines!, status: boardStatus } : t,
        )
      })

      if (!found || !nextLines) return

      setTickets((ticketsPrev) =>
        ticketsPrev.map((ticket) =>
          ticket.id === entityId
            ? pushTicket({
                ...ticket,
                kitchenStatus: dismiss ? 'ready' : nextStatus,
                kitchenDismissed: dismiss,
              })
            : ticket,
        ),
      )
      enqueueOutbox(
        'kot.status',
        entityId,
        {
          ticketId: entityId,
          status: dismiss ? 'done' : nextStatus,
          lineIndex,
          lineStatus: status,
          lines: nextLines,
        },
        getDeviceId(),
        getActiveBranchId(),
      )
    },
    [],
  )

  const dismissKitchen = useCallback((ticketId: string) => {
    const entityId = ticketId.replace(/^kot-/, '')
    setKitchen((prev) => prev.filter((t) => t.id !== ticketId))
    void mesaDb.kitchen.delete(ticketId)
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === entityId
          ? pushTicket({
              ...ticket,
              kitchenDismissed: true,
              kitchenStatus: ticket.kitchenStatus ?? 'ready',
            })
          : ticket,
      ),
    )
  }, [])

  const closeDay = useCallback(
    (countedCash: number, staff?: string) => {
      const day = todayKey()
      const branchId = getActiveBranchId()
      const openTables = tables.filter((t) => t.status === 'occupied' || t.status === 'billing')
      if (openTables.length > 0 || qsTickets.length > 0) {
        return {
          ok: false,
          message: `Close ${openTables.length} open table(s) and ${qsTickets.length} ticket(s) first`,
        }
      }
      const dayEntries = branchLedger.filter((e) => e.day === day && e.type === 'sale')
      const expectedCash = cashFromLedger(dayEntries)
      appendLedger({
        id: `close-${Date.now()}`,
        at: new Date().toISOString(),
        day,
        type: 'sale',
        source: 'Day Close',
        method: `Day close · counted ${countedCash.toFixed(2)} · expected ${expectedCash.toFixed(2)}`,
        subtotal: 0,
        tax: 0,
        total: countedCash - expectedCash,
        staff,
      })
      setDayClosedOn(day)
      saveDayClosed(day, branchId)
      enqueueOutbox('day.close', day, { dayKey: day, countedCash, staff, branchId }, getDeviceId(), branchId)
      if (apiMastersReady()) {
        void apiDayClose({ branchId, dayKey: day, countedCash, staff }).catch(() => undefined)
      }
      appendAudit({
        action: 'day.close',
        staff,
        entityId: day,
        detail: `counted ${countedCash.toFixed(2)} · expected ${expectedCash.toFixed(2)}`,
        amount: countedCash - expectedCash,
        branchId,
      })
      flash('Day closed')
      return { ok: true, message: `Day closed · cash variance ${(countedCash - expectedCash).toFixed(2)}` }
    },
    [appendLedger, flash, branchLedger, tables, qsTickets],
  )

  const reopenDay = useCallback(() => {
    const day = dayClosedOn ?? todayKey()
    const branchId = getActiveBranchId()
    setDayClosedOn(null)
    saveDayClosed(null, branchId)
    enqueueOutbox('day.reopen', day, { dayKey: day, branchId }, getDeviceId(), branchId)
    appendAudit({
      action: 'day.reopen',
      entityId: day,
      branchId,
    })
    flash('Day reopened')
  }, [flash, dayClosedOn])

  const saveFloorTable = useCallback(
    (row: { id?: string; label: string; seats: number; area: string; note?: string; sort?: number }) => {
      const label = row.label.trim()
      const area = row.area.trim()
      const note = row.note?.trim() ?? ''
      const seats = Math.max(1, Math.min(40, Math.round(Number(row.seats) || 2)))
      if (!label) {
        flash('Table number is required', 'err')
        return false
      }
      if (!/^\d+$/.test(label)) {
        flash('Table number must contain digits only', 'err')
        return false
      }
      if (!area) {
        flash('Choose a table area', 'err')
        return false
      }
      const branchId = getActiveBranchId()
      const id = row.id?.trim()
        ? scopedFloorId(row.id.trim(), branchId)
        : scopedFloorId(`t-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`, branchId)

      const live = row.id
        ? tables.find((t) => t.id === id || sameFloorTable(t.id, id))
        : undefined
      if (live && (live.status === 'occupied' || live.status === 'billing')) {
        flash('Settle or clear the table before editing', 'err')
        return false
      }

      const labelKey = String(Number.parseInt(label, 10)).padStart(2, '0')

      let ok = true
      setFloorLayout((prev) => {
        const targetId = id
        const existing = prev.find((t) => t.id === targetId || sameFloorTable(t.id, targetId))
        const clash = prev.some((t) => {
          if (existing && t.id === existing.id) return false
          if (sameFloorTable(t.id, targetId)) return false
          const otherKey = String(Number.parseInt(t.label.replace(/\D/g, ''), 10)).padStart(2, '0')
          return otherKey === labelKey
        })
        if (clash) {
          ok = false
          return prev
        }
        const nextRow: Table = {
          id: existing?.id ?? targetId,
          label: labelKey,
          seats,
          area,
          note: note || undefined,
          status: 'free',
        }
        const next = existing
          ? prev.map((t) =>
              t.id === existing.id ? { ...t, label: labelKey, seats, area, note: note || undefined } : t,
            )
          : [...prev, nextRow]
        void floorRepo.put({ ...nextRow, branchId }, branchId)
        pushFloor({ ...nextRow, sort: row.sort })
        ensureAreasFromTables(
          next.map((t) => t.area),
          undefined,
          branchId,
        )
        return next
      })
      if (!ok) {
        flash('Table number already exists', 'err')
        return false
      }
      flash(row.id ? `Table ${labelKey} saved` : `Table ${labelKey} added`)
      return true
    },
    [flash, tables],
  )

  const deleteFloorTable = useCallback(
    (tableId: string) => {
      const branchId = getActiveBranchId()
      const id = scopedFloorId(tableId, branchId)
      const live = tables.find((t) => t.id === id || sameFloorTable(t.id, tableId))
      if (live && (live.status === 'occupied' || live.status === 'billing')) {
        flash('Settle or clear the table before deleting', 'err')
        return false
      }
      const open = dineCheckForTable(ticketsOpen, id, branchId)
      if (open) {
        flash('Open check on this table — settle first', 'err')
        return false
      }
      setFloorLayout((prev) => prev.filter((t) => t.id !== id && !sameFloorTable(t.id, tableId)))
      void floorRepo.remove(id, branchId)
      if (apiMastersReady()) {
        void apiDeleteFloor(id).catch(() => undefined)
      }
      flash('Table deleted')
      return true
    },
    [flash, tables, ticketsOpen],
  )

  const value = useMemo(
    () => ({
      tables,
      tableOrders,
      tickets: qsTickets,
      kitchen: branchKitchen,
      toast: toastState.message,
      toastKind: toastState.kind,
      flash,
      dismissFlash,
      ledger: branchLedger,
      dayClosedOn,
      dayIsClosed,
      stock,
      ingredients: branchIngredients,
      chargeCatalog,
      tableCharges,
      openTable,
      setGuests,
      selectAddToTable,
      setTableLineNote,
      setTableTicketNote,
      changeTableQty,
      voidTableLine,
      sendTableOrders,
      transferTable,
      mergeTables,
      tableDiscounts,
      tableTicketNotes,
      setTableDiscount,
      toggleTableCharge,
      getTableChargeLines,
      requestBill,
      settleTable,
      clearEmptyTable,
      addTicket,
      updateTicket,
      addToTicket,
      changeTicketQty,
      setTicketLineNote,
      voidTicketLine,
      setTicketDiscount,
      toggleTicketCharge,
      getTicketChargeLines,
      sendTicketOrders,
      settleTicket,
      cancelTicket,
      setKitchenStatus,
      setKitchenLineStatus,
      dismissKitchen,
      recordSale,
      upsertLedger: appendLedger,
      closeDay,
      reopenDay,
      deductRecipeStock,
      saveIngredient,
      deleteIngredient,
      receiveStock,
      transferStockLocation,
      adjustStock,
      upsertStockItem,
      saveFloorTable,
      deleteFloorTable,
    }),
    [
      tables,
      tableOrders,
      qsTickets,
      branchKitchen,
      toastState.message,
      toastState.kind,
      flash,
      dismissFlash,
      branchLedger,
      dayClosedOn,
      dayIsClosed,
      stock,
      branchIngredients,
      chargeCatalog,
      tableCharges,
      openTable,
      setGuests,
      selectAddToTable,
      setTableLineNote,
      setTableTicketNote,
      changeTableQty,
      voidTableLine,
      sendTableOrders,
      transferTable,
      mergeTables,
      tableDiscounts,
      tableTicketNotes,
      setTableDiscount,
      toggleTableCharge,
      getTableChargeLines,
      requestBill,
      settleTable,
      clearEmptyTable,
      addTicket,
      updateTicket,
      addToTicket,
      changeTicketQty,
      setTicketLineNote,
      voidTicketLine,
      setTicketDiscount,
      toggleTicketCharge,
      getTicketChargeLines,
      sendTicketOrders,
      settleTicket,
      cancelTicket,
      setKitchenStatus,
      setKitchenLineStatus,
      dismissKitchen,
      recordSale,
      appendLedger,
      closeDay,
      reopenDay,
      deductRecipeStock,
      saveIngredient,
      deleteIngredient,
      receiveStock,
      transferStockLocation,
      adjustStock,
      upsertStockItem,
      saveFloorTable,
      deleteFloorTable,
    ],
  )

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>
}

export function usePos() {
  const ctx = useContext(PosContext)
  if (!ctx) throw new Error('usePos must be used within PosProvider')
  return ctx
}
