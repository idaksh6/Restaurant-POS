import { getActiveBranchId } from '../data/company'
import { mesaDb, tenantGetItem, tenantSetItem } from '../data/repos/db'
import { apiMastersReady } from '../lib/apiMasters'

export type OutboxOpType =
  | 'ticket.create'
  | 'ticket.update'
  | 'ticket.settle'
  | 'ticket.line.upsert'
  | 'ticket.line.void'
  | 'kot.send'
  | 'kot.status'
  | 'customer.upsert'
  | 'foodVoucher.upsert'
  | 'foodVoucher.delete'
  | 'foodVoucher.redeem'
  | 'vendor.upsert'
  | 'vendor.delete'
  | 'vendorLedger.upsert'
  | 'stock.adjust'
  | 'masters.upsert'
  | 'masters.delete'
  | 'catalog.upsert'
  | 'catalog.delete'
  | 'giftCard.redeem'
  | 'day.close'
  | 'day.reopen'
  | 'shift.upsert'
  | 'receipt.upsert'
  | 'po.upsert'
  | 'stockTransfer.upsert'
  | 'ledger.upsert'
  | 'floor.upsert'
  | 'company.upsert'
  | 'branch.upsert'
  | 'branch.delete'
  | 'zatca.submit'
  | 'role.upsert'
  | 'role.delete'
  | 'user.upsert'
  | 'audit.upsert'
  | 'seq.upsert'

export type OutboxOp = {
  id: string
  type: OutboxOpType
  entityId: string
  payload: unknown
  createdAt: string
  deviceId: string
  branchId?: string
  status: 'pending' | 'syncing' | 'acked' | 'poison'
  attempts: number
  lastError?: string
}

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const LS_KEY = 'mesa-outbox'
const ZATCA_STORE_KEY = 'mesa-zatca-invoices'
export const OUTBOX_EVENT = 'mesa-outbox-changed'

function zatcaInvoiceSynced(entityId: string) {
  try {
    const raw = tenantGetItem(ZATCA_STORE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Array<{ invoiceUuid?: string; phase2Status?: string }>
    if (!Array.isArray(parsed)) return false
    const row = parsed.find((r) => r.invoiceUuid === entityId)
    return row?.phase2Status === 'sandbox' || row?.phase2Status === 'reported'
  } catch {
    return false
  }
}

/** Master-data ops already saved via REST when online — outbox copies are redundant. */
const PRUNE_WHEN_ONLINE = new Set<OutboxOpType>([
  'stock.adjust',
  'role.upsert',
  'role.delete',
  'user.upsert',
  'vendor.upsert',
  'vendor.delete',
  'vendorLedger.upsert',
  'po.upsert',
  'receipt.upsert',
  'masters.upsert',
  'masters.delete',
  'catalog.upsert',
  'catalog.delete',
  'floor.upsert',
  'company.upsert',
  'branch.upsert',
  'branch.delete',
  'customer.upsert',
  'foodVoucher.upsert',
  'foodVoucher.delete',
  'shift.upsert',
  'stockTransfer.upsert',
  'ledger.upsert',
  'audit.upsert',
  'seq.upsert',
])

let outboxWriteGen = 0

export function loadOutbox(): OutboxOp[] {
  try {
    const raw = tenantGetItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as OutboxOp[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function notifyOutboxChanged() {
  if (typeof window === 'undefined') return
  // Defer so enqueueOutbox() during PosProvider work never setStates SyncProvider mid-render.
  queueMicrotask(() => {
    window.dispatchEvent(new Event(OUTBOX_EVENT))
  })
}

export function saveOutbox(ops: OutboxOp[]) {
  tenantSetItem(LS_KEY, JSON.stringify(ops))
  const gen = ++outboxWriteGen
  void mesaDb.outbox
    .clear()
    .then(async () => {
      if (gen !== outboxWriteGen) return
      if (ops.length) await mesaDb.outbox.bulkPut(ops)
    })
    .catch(() => undefined)
}

export async function hydrateOutboxFromDexie() {
  const hasLs = tenantGetItem(LS_KEY) != null
  const ls = loadOutbox()
  try {
    const rows = await mesaDb.outbox.toArray()
    // localStorage wins when present — prevents stale Dexie rows resurrecting a pruned queue.
    if (hasLs) {
      await mesaDb.outbox.clear()
      if (ls.length) await mesaDb.outbox.bulkPut(ls)
      return ls
    }
    if (rows.length) {
      tenantSetItem(LS_KEY, JSON.stringify(rows))
      return rows
    }
  } catch {
    /* ignore */
  }
  if (ls.length) {
    try {
      await mesaDb.outbox.bulkPut(ls)
    } catch {
      /* ignore */
    }
  }
  return ls
}

export function enqueueOutbox(
  type: OutboxOpType,
  entityId: string,
  payload: unknown,
  deviceId: string,
  /** Pass `null` for company-wide ops (visible on every branch pull). */
  branchId?: string | null,
): OutboxOp {
  const op: OutboxOp = {
    id: uuid(),
    type,
    entityId,
    payload,
    createdAt: new Date().toISOString(),
    deviceId,
    branchId: branchId === null ? undefined : (branchId ?? getActiveBranchId()),
    status: 'pending',
    attempts: 0,
  }
  const ticketSnapshot = type === 'ticket.create' || type === 'ticket.update'
  // Latest pending upsert wins — avoids pile-up from repeated master/stock/PO saves.
  const coalesceUpsert =
    type.endsWith('.upsert') ||
    type === 'stock.adjust' ||
    type === 'ticket.update' ||
    type === 'kot.status' ||
    type === 'zatca.submit'
  const isDelete =
    type === 'masters.delete' ||
    type === 'catalog.delete' ||
    type === 'vendor.delete' ||
    type === 'foodVoucher.delete' ||
    type === 'branch.delete' ||
    type === 'role.delete'
  const upsertTwin: Partial<Record<OutboxOpType, OutboxOpType>> = {
    'masters.delete': 'masters.upsert',
    'catalog.delete': 'catalog.upsert',
    'vendor.delete': 'vendor.upsert',
    'foodVoucher.delete': 'foodVoucher.upsert',
    'branch.delete': 'branch.upsert',
    'role.delete': 'role.upsert',
  }
  const dropUpsert = isDelete ? upsertTwin[type] : undefined
  const kept = loadOutbox().filter((o) => {
    if (
      ticketSnapshot &&
      (o.type === 'ticket.create' || o.type === 'ticket.update') &&
      o.entityId === entityId &&
      (o.status === 'pending' || o.status === 'syncing')
    ) {
      return false
    }
    // Latest upsert wins — avoids pile-up from repeated master/stock saves.
    if (
      coalesceUpsert &&
      o.type === type &&
      o.entityId === entityId &&
      (o.status === 'pending' || o.status === 'syncing')
    ) {
      return false
    }
    // Delete must win over a pending upsert of the same row (otherwise peers re-create it).
    if (
      dropUpsert &&
      o.type === dropUpsert &&
      o.entityId === entityId &&
      (o.status === 'pending' || o.status === 'syncing')
    ) {
      return false
    }
    return true
  })
  saveOutbox([...kept, op])
  notifyOutboxChanged()
  return op
}

/** Drop pending/syncing upserts for an entity (peer delete wins). */
export function dropPendingUpsertsFor(entityId: string, upsertType: OutboxOpType) {
  const prev = loadOutbox()
  const next = prev.filter(
    (o) =>
      !(
        o.type === upsertType &&
        o.entityId === entityId &&
        (o.status === 'pending' || o.status === 'syncing')
      ),
  )
  if (next.length !== prev.length) {
    saveOutbox(next)
    notifyOutboxChanged()
  }
}

/** Remove all outbox rows for an entity + type (including poison / acked cleanup). */
export function clearOutboxEntity(entityId: string, opType: OutboxOpType) {
  const prev = loadOutbox()
  const next = prev.filter((o) => o.type !== opType || o.entityId !== entityId)
  if (next.length !== prev.length) {
    saveOutbox(next)
    notifyOutboxChanged()
  }
}

export function pendingOps() {
  return loadOutbox().filter((o) => o.status === 'pending' || o.status === 'syncing')
}

export function pendingCount() {
  return pendingOps().length
}

export function markOutboxStatuses(
  ids: string[],
  status: OutboxOp['status'],
  lastError?: string,
) {
  const next = loadOutbox().map((op) =>
    ids.includes(op.id)
      ? { ...op, status, lastError, attempts: op.attempts + (status === 'syncing' ? 1 : 0) }
      : op,
  )
  saveOutbox(next)
  return next
}

export function clearAckedOutbox() {
  saveOutbox(loadOutbox().filter((o) => o.status !== 'acked'))
}

/**
 * Drop non-critical poison ops. Optionally requeue the rest (hydrate / manual sync).
 * Do NOT requeue on every automatic flush — that loops rejected ops forever.
 */
/** Catalog kinds that are branch-scoped (must carry branchId on SyncOps). */
const BRANCH_SCOPED_CATALOG = new Set([
  'expenseDetail',
  'timetable',
  'extraCharge',
  'deliveryRider',
  'printStation',
  'tableArea',
  'beveragePrice',
  'ingredient',
  'stockLocation',
  'yieldLink',
])

/**
 * Stamp active branch onto payloads that the API requires.
 * Do NOT stamp company-wide catalog (tax, unit, giftCard, …) — peers on other
 * branches must still receive those SyncOps via pull (`branchId IS NULL`).
 */
export function withBranchStamped(op: OutboxOp): OutboxOp {
  const bid = op.branchId || getActiveBranchId()
  if (!bid) return op
  const payload = op.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return op.branchId ? op : { ...op, branchId: bid }
  }
  const p = { ...(payload as Record<string, unknown>) }
  if (op.type === 'foodVoucher.upsert') {
    const batch = { ...((p.batch as Record<string, unknown> | undefined) ?? p) }
    if (!batch.branchId) batch.branchId = bid
    if (p.batch && typeof p.batch === 'object') p.batch = batch
    else Object.assign(p, batch)
    if (!p.branchId) p.branchId = bid
    return { ...op, branchId: bid, payload: p }
  }
  if (op.type === 'masters.upsert') {
    if (p.kind === 'dish' && p.dish && typeof p.dish === 'object') {
      const dish = { ...(p.dish as Record<string, unknown>) }
      if (!dish.branchId) dish.branchId = bid
      return { ...op, branchId: bid, payload: { ...p, dish } }
    }
    if (p.kind === 'category' && p.cat && typeof p.cat === 'object') {
      const cat = { ...(p.cat as Record<string, unknown>) }
      if (!cat.branchId) cat.branchId = bid
      return { ...op, branchId: bid, payload: { ...p, cat } }
    }
  }
  if (op.type === 'catalog.upsert') {
    const kind = String(p.kind ?? '')
    const row =
      p.row && typeof p.row === 'object' && !Array.isArray(p.row)
        ? { ...(p.row as Record<string, unknown>) }
        : null
    if (!BRANCH_SCOPED_CATALOG.has(kind)) {
      // Company-wide: keep SyncOp visible on every branch pull.
      return { ...op, branchId: undefined, payload: p }
    }
    if (row) {
      if (!row.branchId) row.branchId = bid
      return { ...op, branchId: op.branchId ?? bid, payload: { ...p, row } }
    }
    if (!p.branchId) {
      return { ...op, branchId: bid, payload: { ...p, branchId: bid } }
    }
    return { ...op, branchId: op.branchId ?? bid, payload: p }
  }
  if (op.type === 'catalog.delete') {
    const kind = String(p.kind ?? '')
    if (!BRANCH_SCOPED_CATALOG.has(kind)) {
      return { ...op, branchId: undefined, payload: p }
    }
    return { ...op, branchId: op.branchId ?? bid, payload: p }
  }
  // Branch-scoped ops that already have branchId — leave as-is.
  if (op.branchId) return op
  // Default: stamp for branch-required entity types only.
  const needsBranch = new Set<OutboxOpType>([
    'ticket.create',
    'ticket.update',
    'ticket.settle',
    'ticket.line.upsert',
    'ticket.line.void',
    'kot.send',
    'kot.status',
    'customer.upsert',
    'foodVoucher.upsert',
    'foodVoucher.delete',
    'foodVoucher.redeem',
    'stock.adjust',
    'masters.upsert',
    'masters.delete',
    'day.close',
    'day.reopen',
    'shift.upsert',
    'receipt.upsert',
    'po.upsert',
    'stockTransfer.upsert',
    'ledger.upsert',
    'floor.upsert',
    'audit.upsert',
    'seq.upsert',
  ])
  if (!needsBranch.has(op.type)) return op
  return { ...op, branchId: bid }
}

/** Drop redundant master-data ops when online (REST already persisted them). */
export function pruneRedundantOutbox() {
  if (!apiMastersReady()) return loadOutbox()
  const ops = loadOutbox()
  const next = ops.filter((op) => {
    if (op.status !== 'pending' && op.status !== 'syncing' && op.status !== 'poison') return true
    if (op.type === 'zatca.submit' && zatcaInvoiceSynced(op.entityId)) return false
    if (!PRUNE_WHEN_ONLINE.has(op.type)) return true
    // Keep qty-changing stock adjusts that may not have reached the server yet.
    if (op.type === 'stock.adjust') {
      const delta = Number((op.payload as { delta?: unknown })?.delta)
      if (Number.isFinite(delta) && delta !== 0) return true
    }
    return false
  })
  if (next.length !== ops.length) {
    saveOutbox(next)
    notifyOutboxChanged()
  }
  return next
}

/** @deprecated use pruneRedundantOutbox */
export function dropRedundantStockAdjusts() {
  return pruneRedundantOutbox()
}

export function sanitizePoisonOutbox(opts?: { requeue?: boolean }) {
  const requeue = opts?.requeue === true
  const ops = loadOutbox()
  let changed = false
  const next = ops.flatMap((op) => {
    if (op.status !== 'poison') return [op]
    if (op.type === 'stock.adjust') {
      const delta = Number((op.payload as { delta?: unknown })?.delta)
      // Vendor/metadata backfills (no qty change) are safe to drop locally.
      if (!Number.isFinite(delta) || delta === 0) {
        changed = true
        return []
      }
    }
    // Discount catalog 400'd before DiscountRate table existed — drop poison so the chip clears.
    if (
      (op.type === 'catalog.upsert' || op.type === 'catalog.delete') &&
      String((op.payload as { kind?: unknown })?.kind ?? '') === 'discount'
    ) {
      changed = true
      if (requeue) {
        return [{ ...op, status: 'pending' as const, lastError: undefined }]
      }
      return []
    }
    // Beverage catalog — local list already saved; drop stuck poison (or retry once when forced).
    {
      const catalogKind = String((op.payload as { kind?: unknown })?.kind ?? '')
      if (
        (op.type === 'catalog.upsert' || op.type === 'catalog.delete') &&
        (catalogKind === 'beverageQty' || catalogKind === 'beveragePrice')
      ) {
        changed = true
        if (requeue) {
          return [{ ...withBranchStamped(op), status: 'pending' as const, lastError: undefined }]
        }
        return []
      }
    }
    if (/Unknown catalog kind/i.test(String(op.lastError ?? '')) && /beverage/i.test(String(op.lastError ?? ''))) {
      changed = true
      return []
    }
    // PrintStation.templateId migration lag — retry once the column exists.
    if (
      (op.type === 'catalog.upsert' || op.type === 'catalog.delete') &&
      String((op.payload as { kind?: unknown })?.kind ?? '') === 'printStation' &&
      /templateId/i.test(String(op.lastError ?? ''))
    ) {
      changed = true
      return [{ ...op, status: 'pending' as const, lastError: undefined }]
    }
    if (op.type === 'zatca.submit' && zatcaInvoiceSynced(op.entityId)) {
      changed = true
      return []
    }
    if (op.type === 'ticket.settle' && /not found/i.test(String(op.lastError ?? ''))) {
      changed = true
      return []
    }
    // Gift card redeem already applied server-side (or card empty/gone) — replay is meaningless.
    if (
      op.type === 'giftCard.redeem' &&
      /nothing to redeem|not found/i.test(String(op.lastError ?? ''))
    ) {
      changed = true
      return []
    }
    // Old ops rejected for missing branchId — stamp active branch and retry.
    if (/branchId required/i.test(String(op.lastError ?? ''))) {
      changed = true
      return [{ ...withBranchStamped(op), status: 'pending' as const, lastError: undefined }]
    }
    if (!requeue) return [op]
    changed = true
    return [{ ...withBranchStamped(op), status: 'pending' as const, lastError: undefined }]
  })
  if (changed) {
    saveOutbox(next)
    notifyOutboxChanged()
  }
  return next
}
