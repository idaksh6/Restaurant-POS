import { addMonths } from './giftCards'
import { getActiveBranchId } from './company'
import { isHeadOfficeBranchId } from '../lib/stockBranch'
import { tenantGetItem, tenantSetItem } from './repos/db'
import {
  apiDeleteFoodVoucher,
  apiListFoodVouchers,
  apiMastersReady,
  apiPutFoodVoucher,
  apiRedeemFoodVoucher,
  type ApiFoodVoucherBatch,
  type ApiFoodVoucherCode,
} from '../lib/apiMasters'
import { dropPendingUpsertsFor, enqueueOutbox, loadOutbox } from '../sync/outbox'
import { getDeviceId } from '../sync/deviceId'

export type FoodVoucherBatch = {
  id: string
  name: string
  expiryDate: string
  count: number
  amount: number
  createdAt: string
  /** Branch that owns this batch — required for new rows. */
  branchId?: string
}

export type FoodVoucherCode = {
  id: string
  batchId: string
  name: string
  code: string
  expiryDate: string
  amount: number
  status: 'available' | 'used'
  usedAt?: string
  branchId?: string
}

const BATCH_KEY = 'mesa-food-voucher-batches'
const CODE_KEY = 'mesa-food-voucher-codes'
const DEMO_BATCH_IDS = new Set(['fvb-1'])
const DEMO_CODE_IDS = new Set(['fvc-1', 'fvc-2', 'fvc-3'])

export function isDemoFoodVoucher(id: string) {
  return DEMO_BATCH_IDS.has(id) || DEMO_CODE_IDS.has(id)
}

function toIso(value: string | Date | null | undefined) {
  if (!value) return undefined
  if (typeof value === 'string') return value
  return value.toISOString()
}

function fromApiBatch(row: ApiFoodVoucherBatch): FoodVoucherBatch {
  return {
    id: row.id,
    name: row.name,
    expiryDate: row.expiryDate,
    count: row.count,
    amount: row.amount,
    createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
    branchId: row.branchId ? String(row.branchId) : undefined,
  }
}

function fromApiCode(row: ApiFoodVoucherCode): FoodVoucherCode {
  return {
    id: row.id,
    batchId: row.batchId,
    name: row.name,
    code: row.code,
    expiryDate: row.expiryDate,
    amount: row.amount,
    status: row.status === 'used' ? 'used' : 'available',
    usedAt: toIso(row.usedAt) ?? undefined,
    branchId: row.branchId ? String(row.branchId) : undefined,
  }
}

export function loadAllBatches(): FoodVoucherBatch[] {
  try {
    const raw = tenantGetItem(BATCH_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FoodVoucherBatch[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((b) => !isDemoFoodVoucher(b.id))
  } catch {
    return []
  }
}

export function loadAllCodes(): FoodVoucherCode[] {
  try {
    const raw = tenantGetItem(CODE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FoodVoucherCode[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((c) => !isDemoFoodVoucher(c.id) && !isDemoFoodVoucher(c.batchId))
  } catch {
    return []
  }
}

/** Batches for one branch. Unscoped legacy rows only on Head Office. */
export function loadBatches(branchId = getActiveBranchId()): FoodVoucherBatch[] {
  const all = loadAllBatches()
  const scoped = all.filter((b) => b.branchId === branchId)
  if (scoped.length) return scoped
  if (isHeadOfficeBranchId(branchId)) return all.filter((b) => !b.branchId)
  return []
}

export function loadCodes(branchId = getActiveBranchId()): FoodVoucherCode[] {
  const all = loadAllCodes()
  const scoped = all.filter((c) => c.branchId === branchId)
  if (scoped.length) return scoped
  if (isHeadOfficeBranchId(branchId)) return all.filter((c) => !c.branchId)
  return []
}

export function saveBatches(rows: FoodVoucherBatch[], branchId = getActiveBranchId()) {
  const scoped = rows
    .map((b) => ({ ...b, branchId: b.branchId ?? branchId }))
    .filter((b) => !isDemoFoodVoucher(b.id) && b.branchId === branchId)
    .slice(0, 200)
  const all = loadAllBatches()
  const others = all.filter((b) => {
    if (b.branchId === branchId) return false
    if (!b.branchId) {
      if (isHeadOfficeBranchId(branchId) && scoped.length) return false
      return true
    }
    return true
  })
  tenantSetItem(BATCH_KEY, JSON.stringify([...others, ...scoped].slice(0, 200)))
  return scoped.length ? scoped : isHeadOfficeBranchId(branchId) ? all.filter((b) => !b.branchId) : []
}

export function saveCodes(rows: FoodVoucherCode[], branchId = getActiveBranchId()) {
  const scoped = rows
    .map((c) => ({ ...c, branchId: c.branchId ?? branchId }))
    .filter((c) => !isDemoFoodVoucher(c.id) && !isDemoFoodVoucher(c.batchId) && c.branchId === branchId)
    .slice(0, 2000)
  const all = loadAllCodes()
  const others = all.filter((c) => {
    if (c.branchId === branchId) return false
    if (!c.branchId) {
      if (isHeadOfficeBranchId(branchId) && scoped.length) return false
      return true
    }
    return true
  })
  tenantSetItem(CODE_KEY, JSON.stringify([...others, ...scoped].slice(0, 2000)))
  return scoped.length ? scoped : isHeadOfficeBranchId(branchId) ? all.filter((c) => !c.branchId) : []
}

export function voucherStats(codes: FoodVoucherCode[] = loadCodes()) {
  const total = codes.length
  const used = codes.filter((c) => c.status === 'used').length
  return { total, used, available: total - used }
}

export function codesForBatch(batchId: string, codes = loadCodes()) {
  return codes.filter((c) => c.batchId === batchId)
}

export function findFoodVoucher(
  query: string,
  codes: FoodVoucherCode[] = loadCodes(),
): FoodVoucherCode | undefined {
  const q = query.trim()
  if (!q) return undefined
  const today = new Date().toISOString().slice(0, 10)
  const available = codes.filter(
    (c) => c.status === 'available' && String(c.expiryDate).slice(0, 10) >= today,
  )
  const exact = available.find((c) => c.code === q)
  if (exact) return exact
  const qLower = q.toLowerCase()
  const codeHits = available.filter((c) => c.code.toLowerCase().includes(qLower))
  if (codeHits.length === 1) return codeHits[0]
  const nameHits = available.filter((c) => c.name.toLowerCase().includes(qLower))
  if (nameHits.length === 1) return nameHits[0]
  return undefined
}

/** Ranked suggestions for settle lookup (code or batch name). */
export function suggestFoodVouchers(
  query: string,
  codes: FoodVoucherCode[] = loadCodes(),
  limit = 8,
): FoodVoucherCode[] {
  const today = new Date().toISOString().slice(0, 10)
  const available = codes.filter(
    (c) => c.status === 'available' && String(c.expiryDate).slice(0, 10) >= today,
  )
  const q = query.trim().toLowerCase()
  if (!q) return available.slice(0, limit)
  return available
    .filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q),
    )
    .slice(0, limit)
}

function genCode(): string {
  return String(Math.floor(1000000 + Math.random() * 9000000))
}

export function generateCodesForBatch(batch: FoodVoucherBatch, existing: FoodVoucherCode[]): FoodVoucherCode[] {
  const used = new Set(existing.map((c) => c.code))
  const branchId = batch.branchId ?? getActiveBranchId()
  const created: FoodVoucherCode[] = []
  for (let i = 0; i < batch.count; i++) {
    let code = genCode()
    while (used.has(code)) code = genCode()
    used.add(code)
    created.push({
      id: `fvc-${batch.id}-${i}-${Date.now()}-${i}`,
      batchId: batch.id,
      name: batch.name,
      code,
      expiryDate: batch.expiryDate,
      amount: batch.amount,
      status: 'available',
      branchId,
    })
  }
  return created
}

function pushBatch(batch: FoodVoucherBatch, codes: FoodVoucherCode[]) {
  if (isDemoFoodVoucher(batch.id)) return
  const branchId = batch.branchId ?? getActiveBranchId()
  const stamped = { ...batch, branchId }
  const scoped = codes
    .filter((c) => c.batchId === batch.id)
    .map((c) => ({ ...c, branchId: c.branchId ?? branchId }))
  const body = { batch: stamped, codes: scoped, branchId }
  if (apiMastersReady()) {
    void apiPutFoodVoucher(body)
      .then(() => dropPendingUpsertsFor(batch.id, 'foodVoucher.upsert'))
      .catch(() => enqueueOutbox('foodVoucher.upsert', batch.id, body, getDeviceId(), branchId))
  } else {
    enqueueOutbox('foodVoucher.upsert', batch.id, body, getDeviceId(), branchId)
  }
}

export async function hydrateFoodVouchersFromApi(branchId = getActiveBranchId()) {
  if (!apiMastersReady()) {
    return { batches: loadBatches(branchId), codes: loadCodes(branchId) }
  }
  const remote = await apiListFoodVouchers(branchId)
  const remoteBatches = (remote.batches ?? [])
    .map(fromApiBatch)
    .filter((b) => !isDemoFoodVoucher(b.id))
    .map((b) => ({ ...b, branchId: b.branchId || branchId }))
  const remoteCodes = (remote.codes ?? [])
    .map(fromApiCode)
    .filter((c) => !isDemoFoodVoucher(c.id) && !isDemoFoodVoucher(c.batchId))
    .map((c) => ({ ...c, branchId: c.branchId || branchId }))

  // Pending offline creates — keep until the server acknowledges them.
  const pendingUpsertIds = new Set(
    loadOutbox()
      .filter(
        (o) =>
          o.type === 'foodVoucher.upsert' &&
          (o.status === 'pending' || o.status === 'syncing'),
      )
      .map((o) => o.entityId),
  )

  // Empty API: only keep local rows that are still queued to create (not deletions).
  if (!remoteBatches.length && !remoteCodes.length) {
    const localBatches = loadBatches(branchId).filter((b) => pendingUpsertIds.has(b.id))
    const localCodes = loadCodes(branchId).filter((c) => pendingUpsertIds.has(c.batchId))
    saveBatches(localBatches, branchId)
    saveCodes(localCodes, branchId)
    return { batches: localBatches, codes: localCodes }
  }

  const remoteBatchIds = new Set(remoteBatches.map((b) => b.id))
  const remoteCodeIds = new Set(remoteCodes.map((c) => c.id))
  const localBatches = loadBatches(branchId)
  const localCodes = loadCodes(branchId)
  // Remote is source of truth — do NOT resurrect locally deleted batches.
  const batches = [
    ...remoteBatches,
    ...localBatches.filter((b) => !remoteBatchIds.has(b.id) && pendingUpsertIds.has(b.id)),
  ]
  const codes = [
    ...remoteCodes,
    ...localCodes.filter(
      (c) => !remoteCodeIds.has(c.id) && pendingUpsertIds.has(c.batchId),
    ),
  ]
  saveBatches(batches, branchId)
  saveCodes(codes, branchId)
  return { batches: loadBatches(branchId), codes: loadCodes(branchId) }
}

export function persistBatchLocal(
  nextBatches: FoodVoucherBatch[],
  nextCodes: FoodVoucherCode[],
  branchId = getActiveBranchId(),
) {
  saveBatches(nextBatches, branchId)
  saveCodes(nextCodes, branchId)
}

export function saveFoodVoucherBatch(
  batch: FoodVoucherBatch,
  allBatches: FoodVoucherBatch[],
  allCodes: FoodVoucherCode[],
  createdCodes?: FoodVoucherCode[],
  branchId = getActiveBranchId(),
) {
  const stamped = { ...batch, branchId: batch.branchId ?? branchId }
  const batches = allBatches.some((b) => b.id === stamped.id)
    ? allBatches.map((b) => (b.id === stamped.id ? stamped : { ...b, branchId: b.branchId ?? branchId }))
    : [stamped, ...allBatches]
  let codes = allCodes
  if (createdCodes?.length) {
    codes = [
      ...createdCodes.map((c) => ({ ...c, branchId: c.branchId ?? branchId })),
      ...allCodes,
    ]
  } else {
    codes = allCodes.map((c) =>
      c.batchId === stamped.id && c.status === 'available'
        ? {
            ...c,
            name: stamped.name,
            expiryDate: stamped.expiryDate,
            amount: stamped.amount,
            branchId: c.branchId ?? branchId,
          }
        : c,
    )
  }
  persistBatchLocal(batches, codes, branchId)
  pushBatch(stamped, codes)
  return { batches: loadBatches(branchId), codes: loadCodes(branchId) }
}

export function deleteFoodVoucherBatch(
  id: string,
  allBatches: FoodVoucherBatch[],
  allCodes: FoodVoucherCode[],
  branchId = getActiveBranchId(),
) {
  const batches = allBatches.filter((b) => b.id !== id)
  const codes = allCodes.filter((c) => c.batchId !== id)
  persistBatchLocal(batches, codes, branchId)
  dropPendingUpsertsFor(id, 'foodVoucher.upsert')
  if (apiMastersReady()) {
    void apiDeleteFoodVoucher(id)
      .then(() => dropPendingUpsertsFor(id, 'foodVoucher.upsert'))
      .catch(() =>
        enqueueOutbox('foodVoucher.delete', id, { id, branchId }, getDeviceId(), branchId),
      )
  } else {
    enqueueOutbox('foodVoucher.delete', id, { id, branchId }, getDeviceId(), branchId)
  }
  return { batches: loadBatches(branchId), codes: loadCodes(branchId) }
}

export function redeemFoodVoucher(
  codeId: string,
  branchId = getActiveBranchId(),
): { ok: boolean; amount: number } {
  const rows = loadCodes(branchId)
  const idx = rows.findIndex((c) => c.id === codeId)
  if (idx < 0) return { ok: false, amount: 0 }
  const row = rows[idx]
  const today = new Date().toISOString().slice(0, 10)
  if (row.status !== 'available' || String(row.expiryDate).slice(0, 10) < today) {
    return { ok: false, amount: 0 }
  }
  const next = [...rows]
  next[idx] = { ...row, status: 'used', usedAt: new Date().toISOString() }
  saveCodes(next, branchId)
  if (apiMastersReady()) {
    void apiRedeemFoodVoucher(codeId).catch(() =>
      enqueueOutbox('foodVoucher.redeem', codeId, { id: codeId }, getDeviceId(), branchId),
    )
  } else {
    enqueueOutbox('foodVoucher.redeem', codeId, { id: codeId }, getDeviceId(), branchId)
  }
  return { ok: true, amount: row.amount }
}

export { addMonths }
