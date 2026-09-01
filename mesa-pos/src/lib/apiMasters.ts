import type { Branch, CompanyProfile } from '../data/company'
import type { ApiCompany } from './apiAuth'
import { getApiBaseUrl } from './apiBase'

const API_BASE = () => getApiBaseUrl()

function token() {
  return sessionStorage.getItem('mesa-token')
}

export function apiMastersReady() {
  return Boolean(API_BASE() && token() && navigator.onLine)
}

async function parseError(res: Response) {
  const text = await res.text()
  try {
    const json = JSON.parse(text) as { message?: string | string[] }
    const msg = Array.isArray(json.message) ? json.message.join(', ') : json.message
    return msg || text || `Request failed (${res.status})`
  } catch {
    return text || `Request failed (${res.status})`
  }
}

async function mastersFetch(path: string, init?: RequestInit) {
  const base = API_BASE()
  if (!base) throw new Error('API not configured')
  const auth = token()
  if (!auth) throw new Error('Sign in required')
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth}`,
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new Error('Could not reach the server')
  }
  if (!res.ok) throw new Error(await parseError(res))
  if (res.status === 204) return null
  return res.json()
}

export function toCompanyProfile(row: {
  id: string
  companyName: string
  aliasName?: string | null
  taxId?: string | null
  enableTax?: boolean
  zatcaEnabled?: boolean
  currency?: string
  hqPhone?: string | null
  logoDataUrl?: string | null
}): CompanyProfile {
  return {
    id: row.id,
    companyName: row.companyName,
    aliasName: row.aliasName ?? '',
    taxId: row.taxId ?? '',
    enableTax: row.enableTax ?? true,
    ...(row.zatcaEnabled !== undefined ? { zatcaEnabled: !!row.zatcaEnabled } : {}),
    currency: row.currency ?? 'Saudi Arabia · SAR',
    hqPhone: row.hqPhone ?? undefined,
    logoDataUrl: row.logoDataUrl ?? undefined,
  }
}

export async function apiGetCompany(): Promise<ApiCompany> {
  return mastersFetch('/masters/company') as Promise<ApiCompany>
}

export async function apiPutCompany(body: CompanyProfile): Promise<ApiCompany> {
  return mastersFetch('/masters/company', {
    method: 'PUT',
    body: JSON.stringify(body),
  }) as Promise<ApiCompany>
}

export async function apiListBranches(): Promise<ApiCompany['branches']> {
  return mastersFetch('/masters/branches') as Promise<ApiCompany['branches']>
}

export type ApiCategory = {
  id: string
  companyId: string
  name: string
  alias?: string | null
  parentId?: string | null
  active: boolean
  sort: number
  branchId?: string | null
  meta?: Record<string, unknown> | null
}

export async function apiListCategories(branchId?: string): Promise<ApiCategory[]> {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/masters/categories${qs}`) as Promise<ApiCategory[]>
}

export async function apiPutCategory(cat: Record<string, unknown>) {
  return mastersFetch('/masters/categories', {
    method: 'PUT',
    body: JSON.stringify(cat),
  })
}

export async function apiDeleteCategory(id: string) {
  return mastersFetch(`/masters/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function apiPutBranch(branch: Branch) {
  return mastersFetch('/masters/branches', {
    method: 'PUT',
    body: JSON.stringify(branch),
  })
}

export async function apiDeleteBranch(id: string) {
  return mastersFetch(`/masters/branches/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export type ApiCustomer = {
  id: string
  companyId: string
  branchId?: string | null
  name: string
  phone: string
  address?: string | null
  email?: string | null
  visits: number
  spent: number
  points: number
  updatedAt?: string
}

export async function apiListCustomers(branchId?: string): Promise<ApiCustomer[]> {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/masters/customers${qs}`) as Promise<ApiCustomer[]>
}

export async function apiPutCustomer(row: {
  id: string
  branchId?: string
  name: string
  phone: string
  address?: string
  email?: string
  visits?: number
  spent?: number
  points?: number
}): Promise<ApiCustomer> {
  return mastersFetch('/masters/customers', {
    method: 'PUT',
    body: JSON.stringify(row),
  }) as Promise<ApiCustomer>
}

export type ApiFoodVoucherBatch = {
  id: string
  companyId: string
  name: string
  expiryDate: string
  count: number
  amount: number
  createdAt: string
}

export type ApiFoodVoucherCode = {
  id: string
  companyId: string
  batchId: string
  name: string
  code: string
  expiryDate: string
  amount: number
  status: 'available' | 'used' | string
  usedAt?: string | null
}

export async function apiListFoodVouchers(): Promise<{
  batches: ApiFoodVoucherBatch[]
  codes: ApiFoodVoucherCode[]
}> {
  return mastersFetch('/masters/food-vouchers') as Promise<{
    batches: ApiFoodVoucherBatch[]
    codes: ApiFoodVoucherCode[]
  }>
}

export async function apiPutFoodVoucher(body: {
  batch: {
    id: string
    name: string
    expiryDate: string
    count: number
    amount: number
    createdAt?: string
  }
  codes?: Array<{
    id: string
    batchId: string
    name: string
    code: string
    expiryDate: string
    amount: number
    status: string
    usedAt?: string
  }>
}) {
  return mastersFetch('/masters/food-vouchers', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function apiDeleteFoodVoucher(id: string) {
  return mastersFetch(`/masters/food-vouchers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function apiRedeemFoodVoucher(id: string) {
  return mastersFetch('/masters/food-vouchers/redeem', {
    method: 'PUT',
    body: JSON.stringify({ id }),
  })
}

export type ApiVendor = {
  id: string
  companyId: string
  name: string
  phone: string
  phone2?: string | null
  email?: string | null
  taxId?: string | null
  address?: string | null
  city: string
  active: boolean
}

export type ApiVendorLedger = {
  id: string
  companyId: string
  vendorId: string
  date: string
  description: string
  debit: number
  credit: number
  kind: string
}

export async function apiListVendors(): Promise<{
  vendors: ApiVendor[]
  ledger: ApiVendorLedger[]
}> {
  return mastersFetch('/masters/vendors') as Promise<{
    vendors: ApiVendor[]
    ledger: ApiVendorLedger[]
  }>
}

export async function apiPutVendor(row: {
  id: string
  name: string
  phone: string
  phone2?: string
  email?: string
  taxId?: string
  address?: string
  city: string
  active: boolean
}) {
  return mastersFetch('/masters/vendors', {
    method: 'PUT',
    body: JSON.stringify(row),
  })
}

export async function apiDeleteVendor(id: string) {
  return mastersFetch(`/masters/vendors/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function apiPutVendorLedger(row: {
  id: string
  vendorId?: string
  supplierId?: string
  date: string
  description: string
  debit: number
  credit: number
  kind: string
}) {
  return mastersFetch('/masters/vendors/ledger', {
    method: 'PUT',
    body: JSON.stringify(row),
  })
}

export async function apiListProducts(branchId?: string): Promise<ApiProduct[]> {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/masters/products${qs}`) as Promise<ApiProduct[]>
}

export type ApiProduct = {
  id: string
  companyId: string
  name: string
  alias?: string | null
  categoryId: string
  category: string
  price: number
  cost: number
  code: string
  active: boolean
  branchId?: string | null
  meta?: Record<string, unknown> | null
}

export async function apiPutProduct(product: Record<string, unknown>) {
  return mastersFetch('/masters/products', {
    method: 'PUT',
    body: JSON.stringify(product),
  })
}

export async function apiDeleteProduct(id: string) {
  return mastersFetch(`/masters/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export type CatalogKind =
  | 'giftCard'
  | 'tax'
  | 'discount'
  | 'unit'
  | 'paymentType'
  | 'expenseType'
  | 'expenseDetail'
  | 'timetable'
  | 'extraCharge'
  | 'deliveryRider'
  | 'printStation'

export type ApiCatalog = {
  giftCards: Record<string, unknown>[]
  taxes: Record<string, unknown>[]
  discounts?: Record<string, unknown>[]
  units: Record<string, unknown>[]
  paymentTypes: Record<string, unknown>[]
  expenseTypes: Record<string, unknown>[]
  expenseDetails: Record<string, unknown>[]
  timetables: Record<string, unknown>[]
  extraCharges: Record<string, unknown>[]
  deliveryRiders: Record<string, unknown>[]
  printStations: Record<string, unknown>[]
}

export async function apiListCatalog(): Promise<ApiCatalog> {
  return mastersFetch('/masters/catalog') as Promise<ApiCatalog>
}

export async function apiPutCatalog(kind: CatalogKind, row: Record<string, unknown>) {
  return mastersFetch(`/masters/catalog/${encodeURIComponent(kind)}`, {
    method: 'PUT',
    body: JSON.stringify(row),
  })
}

export async function apiDeleteCatalog(kind: CatalogKind, id: string) {
  return mastersFetch(`/masters/catalog/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function apiRedeemGiftCard(id: string, amount: number) {
  return mastersFetch('/masters/gift-cards/redeem', {
    method: 'PUT',
    body: JSON.stringify({ id, amount }),
  })
}

export async function apiListFloor(branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/masters/floor${qs}`) as Promise<Record<string, unknown>[]>
}

export async function apiPutFloor(row: Record<string, unknown>) {
  return mastersFetch('/masters/floor', { method: 'PUT', body: JSON.stringify(row) })
}

export async function apiDeleteFloor(id: string) {
  return mastersFetch(`/masters/floor/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function apiListStock(branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/masters/stock${qs}`) as Promise<Record<string, unknown>[]>
}

export async function apiPutStock(row: Record<string, unknown>) {
  return mastersFetch('/masters/stock', { method: 'PUT', body: JSON.stringify(row) })
}

export async function apiListIngredients() {
  return mastersFetch('/masters/ingredients') as Promise<Record<string, unknown>[]>
}

export async function apiPutIngredient(row: Record<string, unknown>) {
  return mastersFetch('/masters/ingredients', { method: 'PUT', body: JSON.stringify(row) })
}

export async function apiDeleteIngredient(id: string) {
  return mastersFetch(`/masters/ingredients/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function apiListReceipts(branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/masters/receipts${qs}`) as Promise<Record<string, unknown>[]>
}

export async function apiPutReceipt(row: Record<string, unknown>) {
  return mastersFetch('/masters/receipts', { method: 'PUT', body: JSON.stringify(row) })
}

export async function apiListPurchaseOrders(branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/masters/purchase-orders${qs}`) as Promise<Record<string, unknown>[]>
}

export async function apiPutPurchaseOrder(row: Record<string, unknown>) {
  return mastersFetch('/masters/purchase-orders', { method: 'PUT', body: JSON.stringify(row) })
}

export async function apiListTransfers(branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/masters/stock-transfers${qs}`) as Promise<Record<string, unknown>[]>
}

export async function apiPutTransfer(row: Record<string, unknown>) {
  return mastersFetch('/masters/stock-transfers', { method: 'PUT', body: JSON.stringify(row) })
}

export async function apiListTickets(branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/orders${qs}`) as Promise<Record<string, unknown>[]>
}

export async function apiPutTicket(row: Record<string, unknown>) {
  const id = String(row.id ?? '')
  return mastersFetch(`/orders/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(row),
  })
}

export async function apiIngestDelivery(body: {
  branchId: string
  channel?: string
  externalOrderId?: string
  customer?: string
  phone?: string
  address?: string
  deliveryFee?: number
  lines?: Array<{ name?: string; qty?: number; price?: number; itemId?: string }>
}) {
  return mastersFetch('/orders/delivery/ingest', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<Record<string, unknown>>
}

export async function apiDayClose(body: {
  branchId: string
  dayKey: string
  countedCash: number
  staff?: string
}) {
  const base = API_BASE()
  if (!base) throw new Error('API not configured')
  const auth = token()
  if (!auth) throw new Error('Sign in required')
  const res = await fetch(`${base}/orders/day-close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function apiLatestDayClose(branchId?: string) {
  const base = API_BASE()
  if (!base) throw new Error('API not configured')
  const auth = token()
  if (!auth) throw new Error('Sign in required')
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  const res = await fetch(`${base}/orders/day-close${qs}`, {
    headers: { Authorization: `Bearer ${auth}` },
  })
  if (!res.ok) throw new Error(await parseError(res))
  if (res.status === 204) return null
  return res.json()
}

export async function apiListShifts(branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/orders/shifts${qs}`) as Promise<Record<string, unknown>[]>
}

export async function apiPutShift(row: Record<string, unknown>) {
  return mastersFetch('/orders/shifts', { method: 'PUT', body: JSON.stringify(row) })
}

export async function apiListLedger(branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/orders/ledger${qs}`) as Promise<Record<string, unknown>[]>
}

export async function apiPutLedger(row: Record<string, unknown>) {
  return mastersFetch('/orders/ledger', { method: 'PUT', body: JSON.stringify(row) })
}

export async function apiListAudit(branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/orders/audit${qs}`) as Promise<Record<string, unknown>[]>
}

export async function apiPutAudit(row: Record<string, unknown>) {
  return mastersFetch('/orders/audit', { method: 'PUT', body: JSON.stringify(row) })
}

export async function apiListSequences(branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return mastersFetch(`/orders/sequences${qs}`) as Promise<Record<string, unknown>[]>
}

export async function apiPutSequence(row: Record<string, unknown>) {
  return mastersFetch('/orders/sequences', { method: 'PUT', body: JSON.stringify(row) })
}
