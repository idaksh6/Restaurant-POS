import { getApiBaseUrl } from './apiBase'
import { apiMastersReady } from './apiMasters'

const API_BASE = () => getApiBaseUrl()

function token() {
  return sessionStorage.getItem('mesa-token')
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

async function zatcaFetch(path: string, init?: RequestInit) {
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
  if (res.status === 404) return null
  if (!res.ok) throw new Error(await parseError(res))
  if (res.status === 204) return null
  return res.json()
}

export type ZatcaPhase2Config = {
  zatcaEnabled: boolean
  phase2Enabled: boolean
  environment: 'sandbox' | 'production'
  hasCsid: boolean
  hasPrivateKey: boolean
  hasBinaryToken: boolean
  pih: string | null
  sellerVat: string | null
  sellerName: string | null
  proxyConfigured: boolean
}

export type ZatcaRemoteInvoice = {
  id: string
  companyId?: string
  status: string
  totalSar: number
  vatSar: number
  sellerVat: string
  sellerName?: string
  timestamp: string
  tlvBase64?: string | null
  invoiceHash?: string | null
  zatcaUuid?: string | null
  message?: string | null
}

export function apiZatcaReady() {
  return apiMastersReady()
}

export async function apiGetZatcaConfig(): Promise<ZatcaPhase2Config> {
  return zatcaFetch('/zatca/config') as Promise<ZatcaPhase2Config>
}

export async function apiPutZatcaConfig(body: {
  phase2Enabled?: boolean
  environment?: 'sandbox' | 'production'
  csid?: string | null
  privateKey?: string | null
  binaryToken?: string | null
}): Promise<ZatcaPhase2Config> {
  return zatcaFetch('/zatca/config', {
    method: 'PUT',
    body: JSON.stringify(body),
  }) as Promise<ZatcaPhase2Config>
}

export async function apiSubmitZatcaInvoice(body: {
  invoiceUuid: string
  totalSar: number
  vatSar: number
  sellerVat: string
  sellerName?: string
  timestamp?: string
  tlvBase64?: string
}): Promise<ZatcaRemoteInvoice> {
  return zatcaFetch('/zatca/invoices', {
    method: 'PUT',
    body: JSON.stringify(body),
  }) as Promise<ZatcaRemoteInvoice>
}

export async function apiGetZatcaInvoice(id: string): Promise<ZatcaRemoteInvoice | null> {
  return zatcaFetch(`/zatca/invoices/${encodeURIComponent(id)}`) as Promise<ZatcaRemoteInvoice | null>
}
