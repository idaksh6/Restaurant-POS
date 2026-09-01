import { loadOutbox, markOutboxStatuses, clearAckedOutbox, sanitizePoisonOutbox, pruneRedundantOutbox, type OutboxOp } from './outbox'
import { getActiveBranchId } from '../data/company'
import { tenantGetItem, tenantSetItem } from '../data/repos/db'

const CURSOR_KEY = 'mesa-sync-cursor'
const TOKEN_KEY = 'mesa-token'
const BRANCH_KEY = 'mesa-active-branch-id'

function token() {
  return sessionStorage.getItem(TOKEN_KEY)
}

function branchId() {
  // localStorage can be missing early (first app load / branch switch / new install).
  // If we send /sync/pull without branchId, the server returns ops across branches.
  return localStorage.getItem(BRANCH_KEY) ?? getActiveBranchId()
}

function authHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {}
  if (json) headers['Content-Type'] = 'application/json'
  const auth = token()
  if (auth) headers.Authorization = `Bearer ${auth}`
  return headers
}

export function getSyncCursor() {
  return tenantGetItem(CURSOR_KEY) ?? '0'
}

export function setSyncCursor(cursor: string) {
  tenantSetItem(CURSOR_KEY, cursor)
}

const PUSH_BATCH = 8

function requeueStuckSyncing() {
  const stuck = loadOutbox().filter((o) => o.status === 'syncing')
  if (stuck.length) {
    markOutboxStatuses(
      stuck.map((o) => o.id),
      'pending',
      'retry',
    )
  }
}

async function pushBatch(apiBase: string, deviceId: string, batch: OutboxOp[]) {
  const res = await fetch(`${apiBase}/sync/push`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({
      deviceId,
      ops: batch.map((o: OutboxOp) => ({
        id: o.id,
        type: o.type,
        entityId: o.entityId,
        payload: o.payload,
        createdAt: o.createdAt,
        branchId: o.branchId ?? branchId(),
      })),
    }),
  })
  if (res.status === 413 && batch.length > 1) {
    const mid = Math.ceil(batch.length / 2)
    await pushBatch(apiBase, deviceId, batch.slice(0, mid))
    await pushBatch(apiBase, deviceId, batch.slice(mid))
    return
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text.slice(0, 160)
    try {
      const json = JSON.parse(text) as { message?: string | string[] }
      const msg = Array.isArray(json.message) ? json.message.join(', ') : json.message
      if (msg) detail = msg
    } catch {
      /* keep raw */
    }
    if (res.status === 401) throw new Error('Session expired — sign in again')
    throw new Error(detail ? `push ${res.status}: ${detail}` : `push ${res.status}`)
  }
  const data = (await res.json()) as {
    accepted?: string[]
    rejected?: { id: string; reason?: string }[]
  }
  const accepted = data.accepted ?? []
  const rejected = data.rejected ?? []
  markOutboxStatuses(accepted, 'acked')
  for (const r of rejected) {
    markOutboxStatuses([r.id], 'poison', r.reason)
  }
  const done = new Set([...accepted, ...rejected.map((r) => r.id)])
  const leftover = batch.filter((p) => !done.has(p.id))
  if (leftover.length) {
    markOutboxStatuses(
      leftover.map((o) => o.id),
      'pending',
      'not accepted',
    )
  }
  clearAckedOutbox()
}

export async function flushOutbox(apiBase: string, deviceId: string) {
  if (!token()) {
    const blocked = loadOutbox().filter((o) => o.status === 'pending' || o.status === 'syncing')
    if (blocked.length) {
      markOutboxStatuses(
        blocked.map((o) => o.id),
        'pending',
        'Sign in required to sync',
      )
    }
    return { accepted: [] as string[] }
  }
  sanitizePoisonOutbox()
  pruneRedundantOutbox()
  requeueStuckSyncing()
  const attempted = new Set<string>()

  while (true) {
    const pending = loadOutbox().filter((o) => o.status === 'pending' && !attempted.has(o.id))
    if (!pending.length) return { accepted: [...attempted] }
    const batch = pending.slice(0, PUSH_BATCH)
    for (const op of batch) attempted.add(op.id)
    markOutboxStatuses(
      batch.map((o) => o.id),
      'syncing',
    )
    try {
      await pushBatch(apiBase, deviceId, batch)
    } catch (err) {
      markOutboxStatuses(
        batch.map((o) => o.id),
        'pending',
        err instanceof Error ? err.message : 'push failed',
      )
      for (const op of batch) attempted.delete(op.id)
      throw err
    }
  }
}

export async function pullSync(apiBase: string) {
  if (!token()) return { cursor: getSyncCursor(), entities: [] as unknown[] }
  const since = getSyncCursor()
  const br = branchId()
  const qs = new URLSearchParams({ since })
  if (br) qs.set('branchId', br)
  const res = await fetch(`${apiBase}/sync/pull?${qs}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`pull ${res.status}`)
  const data = (await res.json()) as { cursor?: string; entities?: unknown[] }
  if (data.cursor) setSyncCursor(data.cursor)
  return data
}

export async function bootstrapSync(apiBase: string) {
  if (!token()) throw new Error('Sign in required')
  const br = branchId()
  const qs = br ? `?branchId=${encodeURIComponent(br)}` : ''
  const res = await fetch(`${apiBase}/sync/bootstrap${qs}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`bootstrap ${res.status}`)
  return res.json() as Promise<{
    serverTime: string
    cursor: string
    masters?: { categories?: unknown[]; products?: unknown[] }
    tickets?: unknown[]
    customers?: unknown[]
    floorTables?: unknown[]
    stockItems?: unknown[]
    dayClose?: { dayKey?: string } | null
    shifts?: unknown[]
    receipts?: unknown[]
    purchaseOrders?: unknown[]
    ledger?: unknown[]
    roles?: unknown[]
    stockTransfers?: unknown[]
    audit?: unknown[]
    company?: unknown
    branches?: unknown
  }>
}
