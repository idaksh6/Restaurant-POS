import { tenantGetItem, tenantSetItem } from './repos/db'

export type GiftCard = {
  id: string
  number: string
  customerId?: string
  customerName: string
  phone: string
  description: string
  expiryDate: string
  issueAmount: number
  extraCharges: number
  usedAmount: number
  active: boolean
  createdAt: string
}

const KEY = 'mesa-gift-cards'
const DEMO_IDS = new Set(['gc-1', 'gc-2', 'gc-3'])

export function isDemoGiftCard(id: string) {
  return DEMO_IDS.has(id)
}

export function loadGiftCards(): GiftCard[] {
  try {
    const raw = tenantGetItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as GiftCard[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((g) => !isDemoGiftCard(g.id))
  } catch {
    return []
  }
}

export function saveGiftCards(rows: GiftCard[]) {
  tenantSetItem(KEY, JSON.stringify(rows.filter((g) => !isDemoGiftCard(g.id)).slice(0, 500)))
}

export function giftBalance(g: GiftCard) {
  return Math.max(0, Math.round((g.issueAmount + g.extraCharges - g.usedAmount) * 100) / 100)
}

export function findGiftCard(query: string, rows: GiftCard[] = loadGiftCards()): GiftCard | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  return rows.find(
    (g) =>
      g.active &&
      (g.number.toLowerCase() === q ||
        g.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
        g.customerName.toLowerCase().includes(q)),
  )
}

export function addMonths(isoDate: string, months: number) {
  const d = new Date(isoDate || new Date().toISOString().slice(0, 10))
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export function fromApiGiftCard(row: Record<string, unknown>): GiftCard {
  return {
    id: String(row.id),
    number: String(row.number ?? ''),
    customerId: row.customerId ? String(row.customerId) : undefined,
    customerName: String(row.customerName ?? ''),
    phone: String(row.phone ?? ''),
    description: String(row.description ?? ''),
    expiryDate: String(row.expiryDate ?? ''),
    issueAmount: Number(row.issueAmount ?? 0),
    extraCharges: Number(row.extraCharges ?? 0),
    usedAmount: Number(row.usedAmount ?? 0),
    active: row.active !== false,
    createdAt: row.createdAt ? String(row.createdAt) : new Date().toISOString(),
  }
}
