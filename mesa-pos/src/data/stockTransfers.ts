import { getActiveBranchId } from './company'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type StockTransferKind = 'location' | 'branch' | 'production'
export type StockTransferStatus = 'requested' | 'in_transit' | 'received' | 'completed'

export type StockTransfer = {
  id: string
  branchId?: string
  kind?: StockTransferKind
  status?: StockTransferStatus
  stockId?: string
  fromLocation?: string
  toLocation?: string
  fromBranchId?: string
  toBranchId?: string
  fromBranchName?: string
  toBranchName?: string
  fromStockId: string
  toStockId: string
  fromName: string
  toName: string
  fromSku?: string
  toSku?: string
  qty: number
  unit: string
  /** Production: raw input consumed */
  rawQty?: number
  /** Production: finished output produced */
  outputQty?: number
  /** Production: output / raw (e.g. 0.6 = 60% yield) */
  yieldRatio?: number
  note?: string
  staff?: string
  createdAt: string
  receivedAt?: string
}

export const TRANSFERS_KEY = 'mesa-stock-transfers'

function parseKind(value: unknown): StockTransferKind {
  if (value === 'location' || value === 'branch' || value === 'production') return value
  return 'location'
}

function parseStatus(value: unknown): StockTransferStatus | undefined {
  if (value === 'requested' || value === 'in_transit' || value === 'received' || value === 'completed') {
    return value
  }
  return undefined
}

export function fromApiTransfer(row: Record<string, unknown>): StockTransfer {
  const created =
    typeof row.createdAt === 'string'
      ? row.createdAt
      : new Date(String(row.createdAt ?? Date.now())).toISOString()
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    kind: parseKind(row.kind),
    status: parseStatus(row.status) ?? (row.kind === 'branch' ? 'in_transit' : 'completed'),
    stockId: row.stockId ? String(row.stockId) : undefined,
    fromLocation: row.fromLocation ? String(row.fromLocation) : undefined,
    toLocation: row.toLocation ? String(row.toLocation) : undefined,
    fromBranchId: row.fromBranchId ? String(row.fromBranchId) : undefined,
    toBranchId: row.toBranchId ? String(row.toBranchId) : undefined,
    fromBranchName: row.fromBranchName ? String(row.fromBranchName) : undefined,
    toBranchName: row.toBranchName ? String(row.toBranchName) : undefined,
    fromStockId: String(row.fromStockId ?? ''),
    toStockId: String(row.toStockId ?? ''),
    fromName: String(row.fromName ?? ''),
    toName: String(row.toName ?? ''),
    fromSku: row.fromSku ? String(row.fromSku) : undefined,
    toSku: row.toSku ? String(row.toSku) : undefined,
    qty: Number(row.qty ?? row.outputQty ?? 0),
    unit: String(row.unit ?? 'pcs'),
    rawQty: row.rawQty != null ? Number(row.rawQty) : undefined,
    outputQty: row.outputQty != null ? Number(row.outputQty) : undefined,
    yieldRatio: row.yieldRatio != null ? Number(row.yieldRatio) : undefined,
    note: row.note ? String(row.note) : undefined,
    staff: row.staff ? String(row.staff) : undefined,
    createdAt: created,
    receivedAt: row.receivedAt ? String(row.receivedAt) : undefined,
  }
}

export function loadAllTransfers(): StockTransfer[] {
  try {
    const raw = tenantGetItem(TRANSFERS_KEY)
    const parsed = raw ? (JSON.parse(raw) as StockTransfer[]) : []
    if (!Array.isArray(parsed)) return []
    const branchId = getActiveBranchId()
    return parsed.map((r) => (r.branchId ? r : { ...r, branchId }))
  } catch {
    return []
  }
}

export function saveAllTransfers(rows: StockTransfer[]) {
  tenantSetItem(TRANSFERS_KEY, JSON.stringify(rows.slice(0, 300)))
}

/** Transfers owned by or addressed to this branch. */
export function transfersForBranch(rows: StockTransfer[], branchId = getActiveBranchId()) {
  return rows.filter(
    (r) =>
      !r.branchId ||
      r.branchId === branchId ||
      r.fromBranchId === branchId ||
      r.toBranchId === branchId,
  )
}

export function incomingBranchTransfers(branchId = getActiveBranchId()) {
  return loadAllTransfers().filter(
    (r) => r.kind === 'branch' && r.toBranchId === branchId && r.status === 'in_transit',
  )
}

/** Requests this branch sent to another branch (awaiting their dispatch). */
export function outgoingBranchRequests(branchId = getActiveBranchId()) {
  return loadAllTransfers().filter(
    (r) => r.kind === 'branch' && r.toBranchId === branchId && r.status === 'requested',
  )
}

/** Requests from other branches that this branch must approve and dispatch. */
export function pendingBranchDispatch(branchId = getActiveBranchId()) {
  return loadAllTransfers().filter(
    (r) => r.kind === 'branch' && r.fromBranchId === branchId && r.status === 'requested',
  )
}

export function loadTransfers(branchId = getActiveBranchId()): StockTransfer[] {
  return transfersForBranch(loadAllTransfers(), branchId).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
}

export function mergeRemoteTransfers(
  all: StockTransfer[],
  remote: StockTransfer[],
  branchId: string,
  pending: StockTransfer[] = [],
): StockTransfer[] {
  const others = all.filter(
    (r) =>
      r.branchId &&
      r.branchId !== branchId &&
      r.fromBranchId !== branchId &&
      r.toBranchId !== branchId,
  )
  const localBranch = transfersForBranch(all, branchId)
  const byId = new Map<string, StockTransfer>()
  const source = remote.length ? remote : localBranch
  for (const row of source) {
    byId.set(row.id, { ...row, branchId: row.branchId ?? branchId })
  }
  if (remote.length) {
    for (const local of localBranch) {
      if (!byId.has(local.id)) byId.set(local.id, { ...local, branchId: local.branchId ?? branchId })
    }
  }
  for (const payload of pending) {
    if (!payload?.id) continue
    if (
      payload.branchId &&
      payload.branchId !== branchId &&
      payload.fromBranchId !== branchId &&
      payload.toBranchId !== branchId
    ) {
      continue
    }
    byId.set(payload.id, { ...payload, branchId: payload.branchId ?? branchId })
  }
  return [...others, ...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 300)
}

export function upsertTransfer(doc: StockTransfer) {
  saveAllTransfers([doc, ...loadAllTransfers().filter((r) => r.id !== doc.id)])
}

export function patchTransfer(id: string, patch: Partial<StockTransfer>) {
  saveAllTransfers(
    loadAllTransfers().map((r) => (r.id === id ? { ...r, ...patch } : r)),
  )
}
