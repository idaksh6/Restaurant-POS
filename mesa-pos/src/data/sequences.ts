import { getActiveBranchId } from './company'
import { apiListSequences, apiMastersReady, apiPutSequence } from '../lib/apiMasters'
import { getDeviceId } from '../sync/deviceId'
import { dropPendingUpsertsFor, enqueueOutbox, loadOutbox } from '../sync/outbox'
import { tenantGetItem, tenantRemoveItem, tenantSetItem } from './repos/db'

export type SeqKind = 'delivery' | 'driveThru' | 'takeaway' | 'quickServe'

export const SEQ_KINDS: SeqKind[] = ['delivery', 'driveThru', 'takeaway', 'quickServe']

export type BranchSeq = {
  kind: SeqKind
  value: number
  branchId: string
}

const KEY = 'mesa-sequences'
const LEGACY_DEL = 'mesa-del-seq'
const LEGACY_DT = 'mesa-dt-seq'

type SeqStore = Record<string, Partial<Record<SeqKind, number>>>

function asKind(value: unknown): SeqKind | null {
  return SEQ_KINDS.includes(value as SeqKind) ? (value as SeqKind) : null
}

function loadStore(): SeqStore {
  migrateLegacy()
  try {
    const raw = tenantGetItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as SeqStore) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveStore(store: SeqStore) {
  tenantSetItem(KEY, JSON.stringify(store))
}

function migrateLegacy() {
  try {
    if (tenantGetItem(KEY)) return
    const branchId = getActiveBranchId()
    const store: SeqStore = { [branchId]: {} }
    const del = Number(tenantGetItem(LEGACY_DEL) || '')
    const dt = Number(tenantGetItem(LEGACY_DT) || '')
    if (Number.isFinite(del) && del > 0) store[branchId].delivery = del
    if (Number.isFinite(dt) && dt > 0) store[branchId].driveThru = dt
    saveStore(store)
    tenantRemoveItem(LEGACY_DEL)
    tenantRemoveItem(LEGACY_DT)
  } catch {
    /* ignore */
  }
}

export function fromApiSeq(row: Record<string, unknown>): BranchSeq | null {
  const kind = asKind(row.kind)
  const branchId = row.branchId ? String(row.branchId) : ''
  if (!kind || !branchId) return null
  return { kind, branchId, value: Math.max(0, Number(row.value ?? 0)) }
}

export function getSeq(kind: SeqKind, branchId = getActiveBranchId()): number {
  return loadStore()[branchId]?.[kind] ?? 0
}

export function setSeq(kind: SeqKind, value: number, branchId = getActiveBranchId()) {
  const store = loadStore()
  const current = store[branchId]?.[kind] ?? 0
  const next = Math.max(current, Math.max(0, value))
  store[branchId] = { ...store[branchId], [kind]: next }
  saveStore(store)
  return next
}

export function applySeq(row: BranchSeq) {
  return setSeq(row.kind, row.value, row.branchId)
}

export function persistSeq(kind: SeqKind, value: number, branchId = getActiveBranchId()) {
  const next = setSeq(kind, value, branchId)
  const payload: BranchSeq = { kind, value: next, branchId }
  const entityId = `${kind}:${branchId}`
  if (apiMastersReady()) {
    void apiPutSequence(payload)
      .then((row) => {
        dropPendingUpsertsFor(entityId, 'seq.upsert')
        if (!row || typeof row !== 'object') return
        const parsed = fromApiSeq(row as Record<string, unknown>)
        if (parsed) applySeq(parsed)
      })
      .catch(() => enqueueOutbox('seq.upsert', entityId, payload, getDeviceId(), branchId))
  } else {
    enqueueOutbox('seq.upsert', entityId, payload, getDeviceId(), branchId)
  }
  return next
}

export function nextSeq(kind: SeqKind, branchId = getActiveBranchId()): number {
  return persistSeq(kind, getSeq(kind, branchId) + 1, branchId)
}

export function mergeRemoteSeqs(
  remote: BranchSeq[],
  pending: BranchSeq[],
  branchId: string,
) {
  for (const row of remote) {
    if (row.branchId === branchId) applySeq(row)
  }
  for (const row of pending) {
    if (row.branchId === branchId) applySeq(row)
  }
}

function pendingSeqs(): BranchSeq[] {
  return loadOutbox()
    .filter((o) => o.type === 'seq.upsert' && (o.status === 'pending' || o.status === 'syncing'))
    .map((o) => fromApiSeq((o.payload ?? {}) as Record<string, unknown>))
    .filter((row): row is BranchSeq => Boolean(row))
}

function backfillLocalSeqs(remote: BranchSeq[], pending: BranchSeq[], branchId: string) {
  for (const kind of SEQ_KINDS) {
    const local = getSeq(kind, branchId)
    if (local <= 0) continue
    const remoteVal = remote.find((r) => r.kind === kind && r.branchId === branchId)?.value ?? 0
    const pendingVal = pending.find((r) => r.kind === kind && r.branchId === branchId)?.value ?? 0
    if (local > remoteVal && local > pendingVal) persistSeq(kind, local, branchId)
  }
}

export function hydrateSequences(
  remoteRows: Record<string, unknown>[] | undefined,
  branchId = getActiveBranchId(),
) {
  const remote = (remoteRows ?? [])
    .map(fromApiSeq)
    .filter((row): row is BranchSeq => Boolean(row))
  const pending = pendingSeqs()
  mergeRemoteSeqs(remote, pending, branchId)
  backfillLocalSeqs(remote, pending, branchId)
}

export async function hydrateSequencesFromApi(branchId = getActiveBranchId()) {
  if (!apiMastersReady()) return
  const rows = await apiListSequences(branchId)
  hydrateSequences(rows, branchId)
}
