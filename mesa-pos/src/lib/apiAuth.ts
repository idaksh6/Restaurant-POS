import type { RoleKey } from '../auth/roles'
import { getApiBaseUrl } from './apiBase'

export type ApiCompany = {
  id: string
  companyName: string
  aliasName?: string | null
  taxId?: string | null
  hqPhone?: string | null
  enableTax?: boolean
  zatcaEnabled?: boolean
  currency?: string
  logoDataUrl?: string | null
  branches?: Array<{
    id: string
    companyId?: string
    name: string
    nameAr?: string | null
    code: string
    address?: string | null
    addressAr?: string | null
    phone?: string | null
    active?: boolean
  }>
  _count?: { users?: number; branches?: number }
}

export type ApiStaff = {
  id: string
  username: string
  name: string
  nameAr?: string | null
  role: string
  branchId?: string | null
  companyId?: string | null
  pinHash?: string
  company?: { companyName?: string; aliasName?: string | null } | null
}

export type ApiLoginResult = {
  accessToken: string
  user: {
    id: string
    name: string
    role: string
    username: string
    branchId?: string | null
    companyId?: string | null
    riderId?: string
  }
  company?: {
    id: string
    companyName: string
    aliasName?: string | null
    taxId?: string | null
    hqPhone?: string | null
    enableTax?: boolean
    zatcaEnabled?: boolean
    currency?: string
    logoDataUrl?: string | null
  } | null
  branches?: Array<{
    id: string
    companyId?: string
    name: string
    nameAr?: string | null
    code: string
    address?: string | null
    addressAr?: string | null
    phone?: string | null
    active?: boolean
  }>
}

const API_BASE = () => getApiBaseUrl()

export function apiConfigured() {
  return Boolean(API_BASE())
}

export function mapApiRole(role: string): RoleKey {
  if (role === 'kitchen') return 'kitchen-manager'
  if (role === 'rider') return 'rider'
  return role as RoleKey
}

export function roleLabel(role: RoleKey) {
  if (role === 'food-server') return 'Food Server'
  if (role === 'kitchen-manager') return 'Kitchen Manager'
  if (role === 'admin') return 'Admin'
  if (role === 'cashier') return 'Cashier'
  if (role === 'custom') return 'Custom'
  return role
    .split('-')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ')
}

export async function apiHealth(timeoutMs = 2500): Promise<boolean> {
  const base = API_BASE()
  if (!base || !navigator.onLine) return false
  const ctrl = new AbortController()
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}/health`, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean }
    return body.ok === true
  } catch {
    return false
  } finally {
    window.clearTimeout(t)
  }
}

export async function apiLogin(
  username: string,
  pin: string,
  companyId?: string,
): Promise<ApiLoginResult> {
  const base = API_BASE()
  if (!base) throw new Error('API not configured')
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, pin, companyId }),
  })
  if (!res.ok) {
    const text = await res.text()
    let detail = text.slice(0, 240)
    try {
      const json = JSON.parse(text) as { message?: string | string[] }
      const msg = Array.isArray(json.message) ? json.message.join(', ') : json.message
      if (msg) detail = msg
    } catch {
      /* keep raw */
    }
    const err = new Error(detail || `Login failed (${res.status})`) as Error & { code?: string }
    if (/inactive/i.test(detail)) err.code = 'inactive'
    throw err
  }
  return res.json() as Promise<ApiLoginResult>
}

export async function apiRiderLogin(pin: string, companyId: string): Promise<ApiLoginResult> {
  const base = API_BASE()
  if (!base) throw new Error('API not configured')
  const res = await fetch(`${base}/auth/rider`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, companyId }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Rider login failed (${res.status})`)
  }
  return res.json() as Promise<ApiLoginResult>
}

export async function apiActivateTerminal(taxId: string): Promise<ApiCompany> {
  const base = API_BASE()
  if (!base) throw new Error('API not configured')
  const res = await fetch(`${base}/auth/terminal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taxId }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Activate failed (${res.status})`)
  }
  return res.json() as Promise<ApiCompany>
}

export async function apiListStaff(companyId: string): Promise<ApiStaff[]> {
  const base = API_BASE()
  if (!base) throw new Error('API not configured')
  const res = await fetch(`${base}/auth/staff?companyId=${encodeURIComponent(companyId)}`)
  if (!res.ok) throw new Error(`Staff list failed (${res.status})`)
  return res.json() as Promise<ApiStaff[]>
}
