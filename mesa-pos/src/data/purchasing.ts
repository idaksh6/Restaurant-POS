import { getActiveBranchId } from './company'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type Supplier = {
  id: string
  name: string
  /** Mobile No1 */
  phone: string
  /** Mobile No2 */
  phone2?: string
  email?: string
  /** VAT / Tax Identification No (KSA) */
  taxId?: string
  address?: string
  city: string
  active: boolean
}

export type VendorLedgerKind = 'opening' | 'invoice' | 'cash' | 'card' | 'adjust'

export type VendorLedgerEntry = {
  id: string
  supplierId: string
  date: string
  description: string
  debit: number
  credit: number
  kind: VendorLedgerKind
}

export type POLine = {
  stockId: string
  qtyOrdered: number
  qtyReceived: number
  unitCost: number
}

export type POStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled'

export type PurchaseOrder = {
  id: string
  branchId?: string
  supplierId: string
  status: POStatus
  createdAt: string
  lines: POLine[]
  notes?: string
}

export const PO_KEY = 'mesa-purchase-orders'
export const DEMO_PO_IDS = new Set(['po-1001'])
export const DEMO_VENDOR_IDS = new Set(['sup-1', 'sup-2', 'sup-3'])

/** Default vendors so Inventory / PO pickers work before staff create their own. */
export const DEFAULT_SUPPLIERS: Supplier[] = [
  { id: 'vnd-meat', name: 'Al Nakheel Meats', phone: '', city: 'Riyadh', active: true },
  { id: 'vnd-seafood', name: 'Red Sea Catch', phone: '', city: 'Jeddah', active: true },
  { id: 'vnd-dairy', name: 'Najd Dairy Co', phone: '', city: 'Riyadh', active: true },
  { id: 'vnd-produce', name: 'Farm Fresh KSA', phone: '', city: 'Riyadh', active: true },
  { id: 'vnd-bev', name: 'Gulf Beverages', phone: '', city: 'Riyadh', active: true },
  { id: 'vnd-dry', name: 'Riyadh Dry Store', phone: '', city: 'Riyadh', active: true },
  { id: 'vnd-general', name: 'General Supplier', phone: '', city: 'Riyadh', active: true },
]

const PO_STATUSES: POStatus[] = ['draft', 'ordered', 'partial', 'received', 'cancelled']

export function isDemoVendor(id: string) {
  return DEMO_VENDOR_IDS.has(id)
}

export function ensureDefaultSuppliers(existing: Supplier[]): Supplier[] {
  const real = existing.filter((s) => !isDemoVendor(s.id))
  if (real.length) return real
  return DEFAULT_SUPPLIERS.map((s) => ({ ...s }))
}

function asStatus(value: unknown): POStatus {
  const s = String(value ?? 'draft')
  return PO_STATUSES.includes(s as POStatus) ? (s as POStatus) : 'draft'
}

export function fromApiPO(row: Record<string, unknown>): PurchaseOrder {
  const created =
    typeof row.createdAt === 'string'
      ? row.createdAt
      : new Date(String(row.createdAt ?? Date.now())).toISOString()
  const lines = Array.isArray(row.lines) ? (row.lines as POLine[]) : []
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    supplierId: String(row.supplierId ?? ''),
    status: asStatus(row.status),
    createdAt: created,
    notes: row.notes ? String(row.notes) : undefined,
    lines,
  }
}

export function loadAllPOs(): PurchaseOrder[] {
  try {
    const raw = tenantGetItem(PO_KEY)
    const parsed = raw ? (JSON.parse(raw) as PurchaseOrder[]) : []
    if (!Array.isArray(parsed)) return []
    const branchId = getActiveBranchId()
    return parsed
      .filter((p) => !DEMO_PO_IDS.has(p.id) && !isDemoVendor(p.supplierId))
      .map((p) => (p.branchId ? p : { ...p, branchId }))
  } catch {
    return []
  }
}

export function saveAllPOs(rows: PurchaseOrder[]) {
  tenantSetItem(PO_KEY, JSON.stringify(rows.slice(0, 500)))
}

export function posForBranch(rows: PurchaseOrder[], branchId = getActiveBranchId()) {
  return rows.filter((p) => !p.branchId || p.branchId === branchId)
}

export function mergeRemotePOs(
  all: PurchaseOrder[],
  remote: PurchaseOrder[],
  branchId: string,
  pending: PurchaseOrder[] = [],
): PurchaseOrder[] {
  const others = all.filter((p) => p.branchId && p.branchId !== branchId)
  const localBranch = all.filter((p) => !p.branchId || p.branchId === branchId)
  const byId = new Map<string, PurchaseOrder>()
  const source = remote.length ? remote : localBranch
  for (const row of source) {
    if (DEMO_PO_IDS.has(row.id) || isDemoVendor(row.supplierId)) continue
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
  return [...others, ...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500)
}

export function deriveStatus(lines: POLine[], current: POStatus): POStatus {
  if (current === 'cancelled' || current === 'draft') return current
  const allReceived = lines.every((l) => l.qtyReceived >= l.qtyOrdered)
  const anyReceived = lines.some((l) => l.qtyReceived > 0)
  if (allReceived) return 'received'
  if (anyReceived) return 'partial'
  return current === 'partial' ? 'ordered' : current
}

