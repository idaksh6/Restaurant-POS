import { getActiveBranchId } from './company'
import { tenantGetItem, tenantSetItem } from './repos/db'

export type StockReceiptLine = {
  stockId: string
  code: string
  name: string
  salePrice: number
  costPrice: number
  taxPct: number
  qty: number
  taxAmount: number
  total: number
}

export type StockReceipt = {
  id: string
  branchId?: string
  receiveNumber: string
  receivingDate: string
  invoiceNumber: string
  invoiceDate: string
  supplierId: string
  receivingPerson: string
  packingQty: number
  notes?: string
  lines: StockReceiptLine[]
  netAmount: number
  createdAt: string
}

export const RECEIPTS_KEY = 'mesa-stock-receipts'
const COST_KEY = 'mesa-stock-cost-history'

export function fromApiReceipt(row: Record<string, unknown>): StockReceipt {
  const created =
    typeof row.createdAt === 'string'
      ? row.createdAt
      : new Date(String(row.createdAt ?? Date.now())).toISOString()
  const lines = Array.isArray(row.lines) ? (row.lines as StockReceiptLine[]) : []
  return {
    id: String(row.id),
    branchId: row.branchId ? String(row.branchId) : undefined,
    receiveNumber: String(row.receiveNumber ?? ''),
    receivingDate: String(row.receivingDate ?? ''),
    invoiceNumber: String(row.invoiceNumber ?? ''),
    invoiceDate: String(row.invoiceDate ?? ''),
    supplierId: String(row.supplierId ?? ''),
    receivingPerson: String(row.receivingPerson ?? ''),
    packingQty: Number(row.packingQty ?? 1),
    notes: row.notes ? String(row.notes) : undefined,
    lines,
    netAmount: Number(row.netAmount ?? 0),
    createdAt: created,
  }
}

export function loadAllReceipts(): StockReceipt[] {
  try {
    const raw = tenantGetItem(RECEIPTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as StockReceipt[]) : []
    if (!Array.isArray(parsed)) return []
    const branchId = getActiveBranchId()
    return parsed.map((r) => (r.branchId ? r : { ...r, branchId }))
  } catch {
    return []
  }
}

export function saveAllReceipts(rows: StockReceipt[]) {
  tenantSetItem(RECEIPTS_KEY, JSON.stringify(rows.slice(0, 300)))
}

export function receiptsForBranch(rows: StockReceipt[], branchId = getActiveBranchId()) {
  return rows.filter((r) => !r.branchId || r.branchId === branchId)
}

export function loadReceipts(branchId = getActiveBranchId()): StockReceipt[] {
  return receiptsForBranch(loadAllReceipts(), branchId).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
}

export function saveReceipts(rows: StockReceipt[]) {
  const branchId = getActiveBranchId()
  const others = loadAllReceipts().filter((r) => r.branchId && r.branchId !== branchId)
  saveAllReceipts([...others, ...rows.map((r) => ({ ...r, branchId: r.branchId ?? branchId }))])
}

export function mergeRemoteReceipts(
  all: StockReceipt[],
  remote: StockReceipt[],
  branchId: string,
  pending: StockReceipt[] = [],
): StockReceipt[] {
  const others = all.filter((r) => r.branchId && r.branchId !== branchId)
  const localBranch = all.filter((r) => !r.branchId || r.branchId === branchId)
  const byId = new Map<string, StockReceipt>()
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
  return [...others, ...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 300)
}

export function nextReceiveNumber(rows: StockReceipt[]) {
  const nums = rows.map((r) => Number(r.receiveNumber)).filter((n) => !Number.isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  return String(max + 1)
}

type CostHist = Record<string, number[]>

function loadCostHistory(): CostHist {
  try {
    const raw = tenantGetItem(COST_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as CostHist
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch {
    /* ignore */
  }
  return {}
}

export function lastCostsFromReceipts(stockId: string, receipts: StockReceipt[], limit = 3): number[] {
  const costs: number[] = []
  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      if (line.stockId === stockId && line.costPrice > 0) {
        costs.push(Math.round(line.costPrice * 100) / 100)
        if (costs.length >= limit) return costs
      }
    }
  }
  return costs
}

export function getLastCosts(stockId: string, limit = 3, receipts?: StockReceipt[]): number[] {
  if (receipts?.length) return lastCostsFromReceipts(stockId, receipts, limit)
  const fromDocs = lastCostsFromReceipts(stockId, loadReceipts(), limit)
  if (fromDocs.length) return fromDocs
  const hist = loadCostHistory()
  return (hist[stockId] ?? []).slice(0, limit)
}

export function pushCostHistory(stockId: string, cost: number) {
  if (!stockId || !(cost > 0)) return
  const hist = loadCostHistory()
  const prev = hist[stockId] ?? []
  hist[stockId] = [Math.round(cost * 100) / 100, ...prev].slice(0, 12)
  tenantSetItem(COST_KEY, JSON.stringify(hist))
}

export function lineTotals(costPrice: number, qty: number, taxPct: number) {
  const base = Math.round(costPrice * qty * 100) / 100
  const taxAmount = Math.round(base * (taxPct / 100) * 100) / 100
  const total = Math.round((base + taxAmount) * 100) / 100
  return { taxAmount, total, base }
}
