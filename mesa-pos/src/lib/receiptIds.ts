import { nextSeq } from '../data/sequences'
import { loadManagedUsers } from '../data/staffUsers'
import { loadCompanyProfile } from '../data/company'

/** Next branch-scoped bill number for receipts / tax invoices. */
export function allocateBillNo(): number {
  return nextSeq('bill')
}

/**
 * Compact order id for the receipt header.
 * Prefers the live ticket id; falls back to a short generated token.
 */
export function formatOrderId(ticketId?: string | null): string {
  const raw = String(ticketId || '').trim()
  if (!raw) return `ORD-${Date.now().toString(36).toUpperCase()}`
  // Keep the human-readable tail (e.g. dine:…:1789629744376 → …4376 / tk-42-…)
  if (raw.length <= 28) return raw
  return `…${raw.slice(-20)}`
}

/** Login username when available; otherwise display name. */
export function resolveReceiptUser(staff?: {
  id?: string
  name?: string
  username?: string
} | null): string | undefined {
  if (!staff) return undefined
  const direct = staff.username?.trim()
  if (direct) return direct
  try {
    const companyId = loadCompanyProfile().id
    if (staff.id && companyId) {
      const row = loadManagedUsers(companyId).find((u) => u.id === staff.id)
      if (row?.username) return row.username
    }
  } catch {
    /* offline / unbound */
  }
  return staff.name?.trim() || undefined
}

export type ReceiptIdentity = {
  billNo: number
  orderId: string
  user?: string
  tableLabel?: string
}

export function buildReceiptIdentity(input: {
  ticketId?: string | null
  staff?: { id?: string; name?: string; username?: string } | null
  tableLabel?: string | null
}): ReceiptIdentity {
  return {
    billNo: allocateBillNo(),
    orderId: formatOrderId(input.ticketId),
    user: resolveReceiptUser(input.staff),
    tableLabel: input.tableLabel?.trim() || undefined,
  }
}
