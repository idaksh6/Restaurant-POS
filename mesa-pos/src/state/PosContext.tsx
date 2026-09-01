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
import { chargesForBranch, seedCharges, type ExtraCharge } from '../data/charges'
import { useCatalog } from './CatalogContext'
import { mesaDb, migrateLocalStorageToDexie, tenantGetItem, tenantSetItem } from '../data/repos/db'
import { alignFloorTableId, floorRepo, sameFloorTable, scopedFloorId } from '../data/repos/floorRepo'
import { collapseOpenLines, dineCheckForTable, mergeRemoteTickets, TICKETS_SYNC_EVENT, ticketsRepo } from '../data/repos/ticketsRepo'
import { kitchenFromTicket, ticketFromServer } from '../sync/applyIncoming'
import { enrichStockVendors } from '../lib/stockVendor'
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
  ensureIngredientsFromStock,
  ensureMissingIngredientsFromStock,
  fromApiIngredient,
  loadIngredients,
  mergeRemoteIngredients,
  migrateIngredientReorderFromStock,
  migrateIngredientVendorsFromStock,
  normalizeIngredient,
  normalizeIngredients,
  remapStockIngredientIds,
  saveIngredients,
  type Ingredient,
} from '../data/ingredients'
import {
  lineTotal,
  nowTime,
  stock as seedStock,
  tables as seedTables,
  type KitchenPriority,
  type KitchenTicket,
  type KitchenTicketStatus,
  type MenuItem,
  type OpenTicket,
  type OrderLine,
  type StockItem,
  type Table,
} from '../data/mock'
import { ensureAreasFromTables } from '../data/tableAreas'
import { appendAudit } from '../hardware/audit'
import { isZatcaEnabled, newZatcaInvoiceUuid, prepareZatcaPhase1, queueZatcaPhase2, peekZatcaPhase2Config, refreshZatcaPhase2Config } from '../hardware/zatca'
import { kotStation, loadAllPrinters } from '../data/printers'
import { kotPrintJob, printEscPos } from '../hardware/printer'
import { localizedLineName } from '../lib/branding'
import { activeLang, messages } from '../locale/i18n'
import { peekDishes } from '../data/repos/mastersRepo'
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

function inferFlashKind(message: string): FlashKind {
  return /required|cannot|could not|couldn’t|invalid|fail|error|not enough|locked|must |choose |enter |pick |keep at least|reassign|no access|day is closed|min |wrong|not found|already used|no data|select a |add at least|image must/i.test(
    message,
  )
    ? 'err'
    : 'ok'
}

export type AppliedCharge = { id: string; name: string; amount: number }

type PosContextValue = {
  tables: Table[]
  tableOrders: Record<string, OrderLine[]>
  tickets: OpenTicket[]
  kitchen: KitchenTicket[]
  toast: string
  toastKind: 'ok' | 'err'
  flash: (message: string, kind?: 'ok' | 'err') => void
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
  changeTableQty: (tableId: string, lineId: string, delta: number) => void
  voidTableLine: (tableId: string, lineId: string, reason?: string, staff?: string) => void
  sendTableOrders: (tableId: string, priority: KitchenPriority) => void
  transferTable: (fromId: string, toId: string) => void
  mergeTables: (primaryId: string, secondaryId: string) => void
  tableDiscounts: Record<string, number>
  setTableDiscount: (tableId: string, percent: number) => void
  toggleTableCharge: (tableId: string, chargeId: string) => void
  getTableChargeLines: (tableId: string, goodsSubtotal: number) => AppliedCharge[]
  requestBill: (tableId: string) => void
  settleTable: (tableId: string, meta?: SettleMeta) => void
  addTicket: (ticket: OpenTicket) => void
  updateTicket: (ticketId: string, patch: Partial<OpenTicket>) => void
  addToTicket: (ticketId: string, item: MenuItem, note?: string) => void
  changeTicketQty: (ticketId: string, lineId: string, delta: number) => void
  sendTicketOrders: (ticketId: string, priority: KitchenPriority) => void
  settleTicket: (ticketId: string, meta?: SettleMeta) => void
  cancelTicket: (ticketId: string, reason?: string) => void
  setKitchenStatus: (ticketId: string, status: KitchenTicketStatus) => void
  dismissKitchen: (ticketId: string) => void
  recordSale: (meta: SettleMeta) => void
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

function layoutSeed(branchId = getActiveBranchId()): Table[] {
  return seedTables.map(({ id, label, seats, area }) => ({
    id: scopedFloorId(id, branchId),
    label,
    seats,
    area,
    status: 'free' as const,
  }))
}

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
  const payload = {
    id,
    label: table.label,
    seats: table.seats,
    area: table.area,
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
  const payload = {
    ...item,
    branchId: getActiveBranchId(),
    ...(delta != null && delta !== 0 ? { delta } : {}),
  }
  if (apiMastersReady()) {
    void apiPutStock(payload)
      .then(() => dropPendingUpsertsFor(item.id, 'stock.adjust'))
      .catch(() => enqueueOutbox('stock.adjust', item.id, payload, getDeviceId()))
  } else {
    enqueueOutbox('stock.adjust', item.id, payload, getDeviceId())
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
        .map((l) => `${l.id}:${l.qty}:${l.sent ? 1 : 0}`)
        .join(',')
      return `${t.id}:${t.checkStatus}:${t.kitchenStatus ?? ''}:${t.deliveryStatus ?? ''}:${t.kitchenDismissed ? 1 : 0}:${Math.round((t.amount ?? 0) * 100)}:${lines}`
    })
    .sort()
    .join('|')
}

const KITCHEN_KEY = 'mesa-kitchen'
const DEMO_KITCHEN_IDS = new Set(['k1', 'k2', 'k3'])

function kitchenStatusRank(status?: KitchenTicketStatus) {
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
            lines: kot.lines.length ? kot.lines : cur.lines,
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

function queueZatcaAfterSettle(meta?: SettleMeta, entityId?: string) {
  if (!meta || !isZatcaEnabled()) return
  try {
    const company = loadCompanyProfile()
    const invoice = prepareZatcaPhase1({
      invoiceUuid: newZatcaInvoiceUuid(entityId),
      totalSar: meta.total,
      vatSar: meta.tax,
      sellerVat: company.taxId,
      sellerName: company.companyName,
    })
    if (!invoice) return
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
    status: stamped.checkStatus === 'settled' ? 'settled' : 'open',
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
  return layout.map((t) => {
    const check = dineCheckForTable(tickets, t.id, branchId)
    if (!check) {
      return { id: t.id, label: t.label, seats: t.seats, area: t.area, status: 'free' as const }
    }
    return {
      ...t,
      status: check.checkStatus === 'billing' ? 'billing' : 'occupied',
      guests: check.guests,
      openedAt: check.openedAt,
      amount: check.amount ?? lineTotal(check.lines),
    }
  })
}

function loadStock(): StockItem[] {
  try {
    const raw = tenantGetItem(STOCK_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StockItem[]
      if (Array.isArray(parsed) && parsed.length) {
        return enrichStockVendors(parsed.map(migrateStockItem))
      }
    }
  } catch {
    /* ignore */
  }
  return enrichStockVendors(seedStock.map((s) => migrateStockItem({ ...s })))
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
  const { extraCharges } = useCatalog()
  const floorSeeded = useRef(false)
  const persistEpoch = useRef(-1)
  const ticketsRef = useRef<OpenTicket[]>([])
  const [floorLayout, setFloorLayout] = useState<Table[]>([])
  const [tickets, setTickets] = useState<OpenTicket[]>([])
  const [ticketsReady, setTicketsReady] = useState(false)
  const [kitchen, setKitchen] = useState<KitchenTicket[]>(loadKitchen)
  const [stock, setStock] = useState<StockItem[]>(loadStock)
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => loadIngredients())
  const [ledger, setLedger] = useState<LedgerEntry[]>(loadAllLedger)
  const [dayClosedOn, setDayClosedOn] = useState<string | null>(() => loadDayClosed())
  const [toastState, setToastState] = useState<Toast>({ message: '', kind: 'ok', at: 0 })
  const chargeCatalog = useMemo(() => {
    const branch = chargesForBranch(extraCharges, activeBranchId).filter((c) => c.active)
    return branch.length
      ? branch
      : seedCharges.map((c) => ({ ...c, branchId: activeBranchId, active: true }))
  }, [extraCharges, activeBranchId])

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
    persistEpoch.current = -1
    ;(async () => {
      await migrateLocalStorageToDexie()
      const branchId = getActiveBranchId()
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
              remote.map((row) => ({
                id: String(row.id),
                label: String(row.label ?? ''),
                seats: Number(row.seats ?? 2),
                area: String(row.area ?? 'Main Hall'),
                status: 'free' as const,
                branchId: String(row.branchId ?? branchId),
              })),
              branchId,
            )
          }
        } catch {
          /* keep local floor */
        }
      }
      if (cancelled) return
      if (layout.length) {
        setFloorLayout(layout)
        floorSeeded.current = true
        ensureAreasFromTables(layout.map((t) => t.area))
      } else if (!floorSeeded.current) {
        floorSeeded.current = true
        const seed = layoutSeed(branchId)
        setFloorLayout(seed)
        ensureAreasFromTables(seed.map((t) => t.area))
        await floorRepo.replace(
          seed.map((t) => ({ ...t, branchId })),
          branchId,
        )
        seed.forEach(pushFloor)
      } else {
        setFloorLayout([])
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
      const scopedStock = stockRows.filter((s) => !s.branchId || s.branchId === branchId)
      if (apiMastersReady()) {
        try {
          const remoteStock = (await apiListStock(branchId)) as StockItem[]
          if (remoteStock.length) {
            const others = stockRows.filter((s) => s.branchId && s.branchId !== branchId)
            const prevById = new Map(stockRows.map((s) => [s.id, s]))
            const incoming = enrichStockVendors(
              remoteStock.map((s) => {
                const prev = prevById.get(s.id)
                return {
                  ...s,
                  branchId: s.branchId ?? branchId,
                  vendor: s.vendor?.trim() || prev?.vendor,
                  vendorId: s.vendorId || prev?.vendorId,
                }
              }),
            )
            await mesaDb.stock.clear()
            await mesaDb.stock.bulkPut([...others, ...incoming])
            setStock(incoming)
            saveStock(incoming)
          } else if (scopedStock.length) {
            const enriched = enrichStockVendors(scopedStock)
            setStock(enriched)
            saveStock(enriched)
          }
        } catch {
          if (scopedStock.length) {
            const enriched = enrichStockVendors(scopedStock)
            setStock(enriched)
            saveStock(enriched)
          }
        }
      } else if (scopedStock.length) {
        const enriched = enrichStockVendors(scopedStock)
        setStock(enriched)
        saveStock(enriched)
      }
      let ingRows = loadIngredients()
      if (apiMastersReady()) {
        try {
          const remoteRaw = (await apiListIngredients()) as Record<string, unknown>[]
          const remote = remoteRaw.map(fromApiIngredient)
          ingRows = mergeRemoteIngredients(ingRows, remote)
          const remoteIds = new Set(remote.map((r) => r.id))
          for (const row of ingRows) {
            if (!remoteIds.has(row.id)) {
              void apiPutIngredient(row as unknown as Record<string, unknown>).catch(() => undefined)
            }
          }
          saveIngredients(ingRows)
        } catch {
          /* keep local ingredients */
        }
      }
      setStock((prev) => {
        const linked = prev.map((s) => ({
          ...s,
          ingredientId: s.ingredientId || s.id,
        }))
        if (!ingRows.length) ingRows = ensureIngredientsFromStock(linked)
        else ingRows = ensureMissingIngredientsFromStock(ingRows, linked)
        ingRows = migrateIngredientVendorsFromStock(ingRows, linked)
        ingRows = migrateIngredientReorderFromStock(ingRows, linked)
        ingRows = normalizeIngredients(ingRows)
        const deduped = dedupeIngredientsByName(ingRows)
        ingRows = deduped.ingredients
        const remapped = remapStockIngredientIds(linked, deduped.idMap)
        const synced = applyIngredientFieldsToStock(remapped, ingRows)
        const droppedIds = [...deduped.idMap.entries()]
          .filter(([from, to]) => from !== to)
          .map(([from]) => from)
        if (droppedIds.length && apiMastersReady()) {
          for (const id of droppedIds) {
            void apiDeleteIngredient(id).catch(() => undefined)
          }
          for (const row of ingRows) {
            void apiPutIngredient(row as unknown as Record<string, unknown>).catch(() => undefined)
          }
        }
        setIngredients(ingRows)
        saveIngredients(ingRows)
        saveStock(synced)
        void mesaDb.stock.bulkPut(synced)
        return synced
      })
      if (ingRows.length && !loadIngredients().length) {
        saveIngredients(ingRows)
        setIngredients(ingRows)
      }
      const reconciled = mergeKitchenFromTickets(
        kotRows
          .filter((k) => !DEMO_KITCHEN_IDS.has(k.id))
          .map((k) => ({ ...k, branchId: k.branchId ?? branchId })),
        nextTickets,
      )
      setKitchen(reconciled)
      void persistKitchenBoard(reconciled, branchId)
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
    const onIngredientsChanged = () => setIngredients(loadIngredients())
    window.addEventListener('mesa:ingredients-changed', onIngredientsChanged)
    return () => window.removeEventListener('mesa:ingredients-changed', onIngredientsChanged)
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
        setKitchen((prev) => {
          const merged = mergeKitchenFromTickets(prev, next)
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
  const dayIsClosed = dayClosedOn === todayKey()

  const flash = useCallback((message: string, kind?: FlashKind) => {
    const resolved = kind ?? inferFlashKind(message)
    const at = Date.now()
    setToastState({ message, kind: resolved, at })
    window.setTimeout(() => {
      setToastState((prev) => (prev.at === at ? { message: '', kind: 'ok', at: 0 } : prev))
    }, 2800)
  }, [])

  const dismissFlash = useCallback(() => {
    setToastState({ message: '', kind: 'ok', at: 0 })
  }, [])

  const appendLedger = useCallback((entry: LedgerEntry) => {
    const stamped = { ...entry, branchId: entry.branchId ?? getActiveBranchId() }
    setLedger((prev) => {
      const next = [stamped, ...prev]
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
    const stamped = normalizeIngredient({
      ...row,
      name: row.name.trim(),
      sku: row.sku.trim(),
      unit: row.unit.trim() || 'pcs',
    })
    const { vendorId, vendor } = stamped
    const reorderAt = stamped.reorderAt ?? 0
    const homeLoc = resolveReceiveLocationId(stamped.defaultLocationId)
    setIngredients((prev) => {
      const next = prev.some((r) => r.id === stamped.id)
        ? prev.map((r) => (r.id === stamped.id ? stamped : r))
        : [...prev, stamped].sort((a, b) => a.name.localeCompare(b.name))
      saveIngredients(next)
      return next
    })
    const branchId = getActiveBranchId()
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
        // New item home location is recorded even at 0 so transfers know where it lives.
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
      void apiPutIngredient(stamped as unknown as Record<string, unknown>).catch(() => undefined)
    }
  }, [])

  const deleteIngredient = useCallback((id: string) => {
    setIngredients((prev) => {
      const next = prev.filter((r) => r.id !== id)
      saveIngredients(next)
      return next
    })
    if (apiMastersReady()) {
      void apiDeleteIngredient(id).catch(() => undefined)
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
      setStock((prev) => {
        const next = prev.map((s) => {
          if (s.id !== stockId) return s
          const balances = normalizeLocationBalances(s)
          const ing = ingredients.find((r) => r.id === s.ingredientId || r.id === s.id)
          const recv = resolveReceiveLocationId(ing?.defaultLocationId)
          balances[recv] = roundStockQty(Math.max(0, (balances[recv] ?? 0) + delta))
          const onHand = totalOnHand(balances)
          return { ...s, locationBalances: balances, onHand }
        })
        saveStock(next)
        void mesaDb.stock.bulkPut(next)
        const item = next.find((s) => s.id === stockId)
        if (item) pushStock(item, delta)
        return next
      })
      if (!opts?.quiet) flash(reason ? `Stock adjusted · ${reason}` : 'Stock adjusted')
    },
    [flash, ingredients],
  )

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
    (ticketId: string, source: string, lines: OrderLine[], priority: KitchenPriority) => {
      const pending = lines.filter((line) => !line.sent)
      if (pending.length === 0) return
      const kot: KitchenTicket = {
        id: `kot-${ticketId}`,
        source,
        priority,
        status: 'queued',
        createdAt: nowTime(),
        lines: pending.map((line) => ({ name: line.name, qty: line.qty, itemId: line.itemId })),
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
      if (kotStation(loadAllPrinters())) {
        const lang = activeLang()
        const copy = messages(lang)
        const dishes = peekDishes()
        void printEscPos(
          kotPrintJob({
            title: `${copy.printKotPrefix} · ${source}`,
            lines: pending.map(
              (line) => `${line.qty}× ${localizedLineName(line, dishes, lang)}`,
            ),
            lang,
          }),
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
      patchDine(tableId, (t) => {
        const current = t.lines
        const noteKey = note ?? ''
        const existing = current.find(
          (line) => line.itemId === item.id && !line.sent && (line.note ?? '') === noteKey,
        )
        const lines = collapseOpenLines(
          existing
            ? current.map((line) => (line.id === existing.id ? { ...line, qty: line.qty + 1 } : line))
            : [
                ...current,
                {
                  id: `u:${item.id}:${noteKey || '_'}:${current.filter((l) => l.itemId === item.id).length}`,
                  itemId: item.id,
                  name: item.name,
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
    [dayIsClosed, flash, patchDine],
  )

  const setTableLineNote = useCallback(
    (tableId: string, lineId: string, note: string) => {
      patchDine(tableId, (t) => ({
        ...t,
        lines: t.lines.map((line) => (line.id === lineId ? { ...line, note } : line)),
      }))
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
      if (ticket) pushKitchen(ticket.id, `Table ${table?.label ?? ''}`, lines, priority)
      patchDine(tableId, (t) => ({
        ...t,
        lines: t.lines.map((line) => ({ ...line, sent: true })),
        kitchenStatus: 'queued',
        kitchenPriority: priority,
        kitchenDismissed: false,
      }))
      flash(`Orders sent to kitchen (${priority})`)
    },
    [flash, pushKitchen, tableOrders, tables, ticketsOpen, patchDine],
  )

  const transferTable = useCallback(
    (fromId: string, toId: string) => {
      const from = dineCheckForTable(ticketsOpen, fromId)
      if (!from) return
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
      if (!primary || !secondary) return
      const merged = [...primary.lines, ...secondary.lines]
      patchDine(primaryId, (t) => ({
        ...t,
        lines: merged,
        guests: (t.guests ?? 0) + (secondary.guests ?? 0),
        amount: lineTotal(merged),
      }))
      setTickets((prev) => prev.filter((t) => t.id !== secondary.id))
      enqueueOutbox('ticket.settle', secondary.id, { ticketId: secondary.id, meta: { method: 'merge' } }, getDeviceId())
      flash(`Merged Table ${secondaryLayout?.label ?? secondaryId} → Table ${floorLayout.find((t) => t.id === primaryId)?.label}`)
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
          const fromCat =
            chargeCatalog.find((c) => c.id === id && c.active) ??
            chargeCatalog.find((c) => c.id.startsWith(`${id}__`) && c.active)
          return fromCat ?? seedCharges.find((c) => c.id === id && c.active)
        })
        .filter(Boolean)
        .map((c) => ({
          id: c!.id,
          name: c!.name,
          amount: c!.percent
            ? Math.round(((goodsSubtotal * c!.amount) / 100) * 100) / 100
            : c!.amount,
        }))
    },
    [chargeCatalog, tableCharges],
  )

  const requestBill = useCallback(
    (tableId: string) => {
      patchDine(tableId, (t) => ({ ...t, checkStatus: 'billing', amount: lineTotal(t.lines) }))
      flash('Temporary bill ready')
    },
    [flash, patchDine],
  )

  const settleTable = useCallback(
    (tableId: string, meta?: SettleMeta) => {
      if (meta) recordSale(meta)
      const ticket = dineCheckForTable(ticketsOpen, tableId)
      if (ticket) {
        enqueueOutbox('ticket.settle', ticket.id, { ticketId: ticket.id, meta }, getDeviceId())
        void ticketsRepo.remove(ticket.id)
        void mesaDb.kitchen.delete(`kot-${ticket.id}`)
        setTickets((prev) => prev.filter((t) => t.id !== ticket.id))
        setKitchen((prev) => prev.filter((k) => k.id !== `kot-${ticket.id}`))
      }
      flash('Settlement complete')
      appendAudit({
        action: 'settle',
        entityId: tableId,
        detail: meta?.source,
        amount: meta?.total,
        staff: meta?.staff,
      })
      queueZatcaAfterSettle(meta, ticket?.id ?? tableId)
    },
    [flash, recordSale, ticketsOpen],
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

  const sendTicketOrders = useCallback(
    (ticketId: string, priority: KitchenPriority) => {
      const ticket = tickets.find((t) => t.id === ticketId)
      if (!ticket) return
      pushKitchen(
        ticketId,
        ticket.type === 'takeaway'
          ? `Takeaway ${ticket.customer}`
          : `${ticket.type} · ${ticket.customer}`,
        ticket.lines,
        priority,
      )
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId
            ? pushTicket({
                ...t,
                lines: t.lines.map((line) => ({ ...line, sent: true })),
                kitchenStatus: 'queued',
                kitchenPriority: priority,
                kitchenDismissed: false,
                ...((t.type === 'delivery' || t.type === 'online') &&
                (!t.deliveryStatus || t.deliveryStatus === 'new')
                  ? { deliveryStatus: 'preparing' as const }
                  : {}),
              })
            : t,
        ),
      )
      flash(`Orders sent to kitchen (${priority})`)
    },
    [flash, pushKitchen, tickets],
  )

  const settleTicket = useCallback(
    (ticketId: string, meta?: SettleMeta) => {
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
    [flash, recordSale],
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
    setKitchen((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status } : t)))
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
        ensureAreasFromTables(next.map((t) => t.area))
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
      ingredients,
      chargeCatalog,
      tableCharges,
      openTable,
      setGuests,
      selectAddToTable,
      setTableLineNote,
      changeTableQty,
      voidTableLine,
      sendTableOrders,
      transferTable,
      mergeTables,
      tableDiscounts,
      setTableDiscount,
      toggleTableCharge,
      getTableChargeLines,
      requestBill,
      settleTable,
      addTicket,
      updateTicket,
      addToTicket,
      changeTicketQty,
      sendTicketOrders,
      settleTicket,
      cancelTicket,
      setKitchenStatus,
      dismissKitchen,
      recordSale,
      closeDay,
      reopenDay,
      deductRecipeStock,
      saveIngredient,
      deleteIngredient,
      receiveStock,
      transferStockLocation,
      adjustStock,
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
      ingredients,
      chargeCatalog,
      tableCharges,
      openTable,
      setGuests,
      selectAddToTable,
      setTableLineNote,
      changeTableQty,
      voidTableLine,
      sendTableOrders,
      transferTable,
      mergeTables,
      tableDiscounts,
      setTableDiscount,
      toggleTableCharge,
      getTableChargeLines,
      requestBill,
      settleTable,
      addTicket,
      updateTicket,
      addToTicket,
      changeTicketQty,
      sendTicketOrders,
      settleTicket,
      cancelTicket,
      setKitchenStatus,
      dismissKitchen,
      recordSale,
      closeDay,
      reopenDay,
      deductRecipeStock,
      saveIngredient,
      deleteIngredient,
      receiveStock,
      transferStockLocation,
      adjustStock,
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
