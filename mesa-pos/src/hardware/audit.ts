/** Audit trail for voids, comps, discounts, day close — Phase 4. */

import { getActiveBranchId } from '../data/company'
import { apiMastersReady, apiPutAudit } from '../lib/apiMasters'
import { getDeviceId } from '../sync/deviceId'
import { dropPendingUpsertsFor, enqueueOutbox } from '../sync/outbox'

export type AuditAction =
  | 'void.line'
  | 'comp.line'
  | 'discount.apply'
  | 'day.close'
  | 'day.reopen'
  | 'settle'
  | 'sync.poison'

export type AuditEntry = {
  id: string
  branchId?: string
  at: string
  action: AuditAction
  staff?: string
  entityId?: string
  detail?: string
  amount?: number
}

const KEY = 'mesa-audit-log'
const AUDIT_ACTIONS: AuditAction[] = [
  'void.line',
  'comp.line',
  'discount.apply',
  'day.close',
  'day.reopen',
  'settle',
  'sync.poison',
]

function asAction(value: unknown): AuditAction {
  const a = String(value ?? '')
  return AUDIT_ACTIONS.includes(a as AuditAction) ? (a as AuditAction) : 'settle'
}

function iso(value: unknown, fallback?: string) {
  if (!value) return fallback
  if (typeof value === 'string' && value.includes('T')) return value
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString()
}

export function fromApiAudit(row: Record<string, unknown>): AuditEntry {
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    at: iso(row.at, new Date().toISOString()) ?? new Date().toISOString(),
    action: asAction(row.action),
    staff: row.staff ? String(row.staff) : undefined,
    entityId: row.entityId ? String(row.entityId) : undefined,
    detail: row.detail ? String(row.detail) : undefined,
    amount: row.amount != null ? Number(row.amount) : undefined,
  }
}

export function loadAllAudit(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AuditEntry[]
    if (!Array.isArray(parsed)) return []
    const branchId = getActiveBranchId()
    return parsed.map((e) => (e.branchId ? e : { ...e, branchId }))
  } catch {
    return []
  }
}

export function loadAuditLog(branchId = getActiveBranchId()): AuditEntry[] {
  return loadAllAudit().filter((e) => !e.branchId || e.branchId === branchId)
}

export function saveAuditLog(entries: AuditEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 2000)))
}

export function mergeRemoteAudit(
  all: AuditEntry[],
  remote: AuditEntry[],
  branchId: string,
  pending: AuditEntry[] = [],
): AuditEntry[] {
  const others = all.filter((e) => e.branchId && e.branchId !== branchId)
  const localBranch = all.filter((e) => !e.branchId || e.branchId === branchId)
  const byId = new Map<string, AuditEntry>()
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
    if (payload.branchId && payload.branchId !== branchId) continue
    byId.set(payload.id, { ...payload, branchId: payload.branchId ?? branchId })
  }
  return [...others, ...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 2000)
}

export function appendAudit(entry: Omit<AuditEntry, 'id' | 'at'> & { at?: string; id?: string }) {
  const branchId = entry.branchId ?? getActiveBranchId()
  const row: AuditEntry = {
    id: entry.id ?? `aud-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    branchId,
    at: entry.at ?? new Date().toISOString(),
    action: entry.action,
    staff: entry.staff,
    entityId: entry.entityId,
    detail: entry.detail,
    amount: entry.amount,
  }
  saveAuditLog([row, ...loadAllAudit().filter((e) => e.id !== row.id)])
  if (apiMastersReady()) {
    void apiPutAudit(row as unknown as Record<string, unknown>)
      .then(() => dropPendingUpsertsFor(row.id, 'audit.upsert'))
      .catch(() => enqueueOutbox('audit.upsert', row.id, row, getDeviceId(), branchId))
  } else {
    enqueueOutbox('audit.upsert', row.id, row, getDeviceId(), branchId)
  }
  return row
}

export type { ZatcaPayload, ZatcaSubmitResult, ZatcaPhase2Status } from './zatca'
export {
  submitZatcaInvoice,
  peekLastZatcaInvoice,
  prepareZatcaPhase1,
  isZatcaEnabled,
  queueZatcaPhase2,
  refreshZatcaPhase2Config,
} from './zatca'
