import { addMonths } from './giftCards'
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
import { dropPendingUpsertsFor, enqueueOutbox } from '../sync/outbox'
import { getDeviceId } from '../sync/deviceId'

export type FoodVoucherBatch = {
  id: string
  name: string
  expiryDate: string
  count: number
  amount: number
  createdAt: string
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
  }
}

export function loadBatches(): FoodVoucherBatch[] {
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

export function saveBatches(rows: FoodVoucherBatch[]) {
  tenantSetItem(
    BATCH_KEY,
    JSON.stringify(rows.filter((b) => !isDemoFoodVoucher(b.id)).slice(0, 200)),
  )
}

export function loadCodes(): FoodVoucherCode[] {
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

export function saveCodes(rows: FoodVoucherCode[]) {
  tenantSetItem(
    CODE_KEY,
    JSON.stringify(
      rows.filter((c) => !isDemoFoodVoucher(c.id) && !isDemoFoodVoucher(c.batchId)).slice(0, 2000),
    ),
  )
}

export function voucherStats(codes: FoodVoucherCode[] = loadCodes()) {
  const total = codes.length
  const used = codes.filter((c) => c.status === 'used').length
  return { total, used, available: total - used }
}

export function codesForBatch(batchId: string, codes = loadCodes()) {
  return codes.filter((c) => c.batchId === batchId)
}

export function findFoodVoucher(query: string): FoodVoucherCode | undefined {
  const q = query.trim()
  if (!q) return undefined
  const today = new Date().toISOString().slice(0, 10)
  return loadCodes().find(
    (c) => c.code === q && c.status === 'available' && c.expiryDate >= today,
  )
}

function genCode(): string {
  return String(Math.floor(1000000 + Math.random() * 9000000))
}

export function generateCodesForBatch(batch: FoodVoucherBatch, existing: FoodVoucherCode[]): FoodVoucherCode[] {
  const used = new Set(existing.map((c) => c.code))
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
    })
  }
  return created
}

function pushBatch(batch: FoodVoucherBatch, codes: FoodVoucherCode[]) {
  if (isDemoFoodVoucher(batch.id)) return
  const scoped = codes.filter((c) => c.batchId === batch.id)
  const body = { batch, codes: scoped }
  if (apiMastersReady()) {
    void apiPutFoodVoucher(body)
      .then(() => dropPendingUpsertsFor(batch.id, 'foodVoucher.upsert'))
      .catch(() => enqueueOutbox('foodVoucher.upsert', batch.id, body, getDeviceId(), null))
  } else {
    enqueueOutbox('foodVoucher.upsert', batch.id, body, getDeviceId(), null)
  }
}

export async function hydrateFoodVouchersFromApi() {
  if (!apiMastersReady()) return { batches: loadBatches(), codes: loadCodes() }
  const remote = await apiListFoodVouchers()
  const remoteBatches = (remote.batches ?? [])
    .map(fromApiBatch)
    .filter((b) => !isDemoFoodVoucher(b.id))
  const remoteCodes = (remote.codes ?? [])
    .map(fromApiCode)
    .filter((c) => !isDemoFoodVoucher(c.id) && !isDemoFoodVoucher(c.batchId))
  const localBatches = loadBatches()
  const localCodes = loadCodes()
  // Empty API must not wipe local batches (offline creates / sync lag).
  if (!remoteBatches.length && !remoteCodes.length) {
    return { batches: localBatches, codes: localCodes }
  }
  const remoteBatchIds = new Set(remoteBatches.map((b) => b.id))
  const remoteCodeIds = new Set(remoteCodes.map((c) => c.id))
  const batches = [
    ...remoteBatches,
    ...localBatches.filter((b) => !remoteBatchIds.has(b.id)),
  ]
  const codes = [
    ...remoteCodes,
    ...localCodes.filter((c) => !remoteCodeIds.has(c.id)),
  ]
  saveBatches(batches)
  saveCodes(codes)
  return { batches, codes }
}

export function persistBatchLocal(nextBatches: FoodVoucherBatch[], nextCodes: FoodVoucherCode[]) {
  saveBatches(nextBatches)
  saveCodes(nextCodes)
}

export function saveFoodVoucherBatch(
  batch: FoodVoucherBatch,
  allBatches: FoodVoucherBatch[],
  allCodes: FoodVoucherCode[],
  createdCodes?: FoodVoucherCode[],
) {
  const batches = allBatches.some((b) => b.id === batch.id)
    ? allBatches.map((b) => (b.id === batch.id ? batch : b))
    : [batch, ...allBatches]
  let codes = allCodes
  if (createdCodes?.length) {
    codes = [...createdCodes, ...allCodes]
  } else {
    codes = allCodes.map((c) =>
      c.batchId === batch.id && c.status === 'available'
        ? { ...c, name: batch.name, expiryDate: batch.expiryDate, amount: batch.amount }
        : c,
    )
  }
  persistBatchLocal(batches, codes)
  pushBatch(batch, codes)
  return { batches, codes }
}

export function deleteFoodVoucherBatch(
  id: string,
  allBatches: FoodVoucherBatch[],
  allCodes: FoodVoucherCode[],
) {
  const batches = allBatches.filter((b) => b.id !== id)
  const codes = allCodes.filter((c) => c.batchId !== id)
  persistBatchLocal(batches, codes)
  if (apiMastersReady()) {
    void apiDeleteFoodVoucher(id).catch(() =>
      enqueueOutbox('foodVoucher.delete', id, { id }, getDeviceId(), null),
    )
  } else {
    enqueueOutbox('foodVoucher.delete', id, { id }, getDeviceId(), null)
  }
  return { batches, codes }
}

export function redeemFoodVoucher(codeId: string): { ok: boolean; amount: number } {
  const rows = loadCodes()
  const idx = rows.findIndex((c) => c.id === codeId)
  if (idx < 0) return { ok: false, amount: 0 }
  const row = rows[idx]
  const today = new Date().toISOString().slice(0, 10)
  if (row.status !== 'available' || row.expiryDate < today) return { ok: false, amount: 0 }
  const next = [...rows]
  next[idx] = { ...row, status: 'used', usedAt: new Date().toISOString() }
  saveCodes(next)
  if (apiMastersReady()) {
    void apiRedeemFoodVoucher(codeId).catch(() =>
      enqueueOutbox('foodVoucher.redeem', codeId, { id: codeId }, getDeviceId(), null),
    )
  } else {
    enqueueOutbox('foodVoucher.redeem', codeId, { id: codeId }, getDeviceId(), null)
  }
  return { ok: true, amount: row.amount }
}

export { addMonths }
