import { getActiveBranchId } from './company'
import { tenantGetItem, tenantSetItem } from './repos/db'

/** Public guest ordering tokens → branch / table. */

export type GuestOrderToken = {
  token: string
  branchId: string
  tableId?: string
  label?: string
  active: boolean
}

const KEY = 'mesa-guest-order-tokens'

function shortToken() {
  return Math.random().toString(36).slice(2, 8)
}

export function loadGuestTokens(): GuestOrderToken[] {
  try {
    const raw = tenantGetItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as GuestOrderToken[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveGuestTokens(rows: GuestOrderToken[]) {
  tenantSetItem(KEY, JSON.stringify(rows))
}

export function findGuestToken(token: string) {
  return loadGuestTokens().find((t) => t.token === token && t.active)
}

/** Ensure a storefront token exists for the active branch. */
export function ensureBranchGuestToken(branchId = getActiveBranchId(), label = 'QR menu') {
  const rows = loadGuestTokens()
  const existing = rows.find((t) => t.branchId === branchId && !t.tableId && t.active)
  if (existing) return existing
  const next: GuestOrderToken = {
    token: shortToken(),
    branchId,
    label,
    active: true,
  }
  saveGuestTokens([next, ...rows])
  return next
}

export function ensureTableGuestToken(
  tableId: string,
  branchId = getActiveBranchId(),
  label?: string,
) {
  const rows = loadGuestTokens()
  const existing = rows.find((t) => t.branchId === branchId && t.tableId === tableId && t.active)
  if (existing) return existing
  const next: GuestOrderToken = {
    token: shortToken(),
    branchId,
    tableId,
    label: label ?? `Table ${tableId}`,
    active: true,
  }
  saveGuestTokens([next, ...rows])
  return next
}

export function guestOrderUrl(branchId: string, opts?: { tableId?: string; companyId?: string }) {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const hash = /electron/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
  const q = new URLSearchParams()
  if (opts?.tableId) q.set('table', opts.tableId)
  if (opts?.companyId) q.set('co', opts.companyId)
  const qs = q.toString()
  const path = `/order/${encodeURIComponent(branchId)}${qs ? `?${qs}` : ''}`
  return hash ? `${base}/#${path}` : `${base}${path}`
}
