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
/** Drop redundant master-data ops when online (REST already persisted them). */
export function pruneRedundantOutbox() {
  if (!apiMastersReady()) return loadOutbox()
  const ops = loadOutbox()
  const next = ops.filter((op) => {
    if (op.status !== 'pending' && op.status !== 'syncing') return true
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
    if (!requeue) return [op]
    changed = true
    return [{ ...op, status: 'pending' as const, lastError: undefined }]
  })
  if (changed) {
    saveOutbox(next)
    notifyOutboxChanged()
  }
  return next
}
