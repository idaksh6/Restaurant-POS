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

async function zatcaFetch(path: string, init?: RequestInit & { allowNotFound?: boolean }) {
  const base = API_BASE()
  if (!base) throw new Error('API not configured')
  const auth = token()
  if (!auth) throw new Error('Sign in required')
  const allowNotFound = init?.allowNotFound === true
  const { allowNotFound: _a, ...fetchInit } = init ?? {}
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...fetchInit,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth}`,
        ...(fetchInit.headers ?? {}),
      },
    })
  } catch {
    throw new Error('Could not reach the server')
  }
  if (res.status === 404) {
    if (allowNotFound) return null
    throw new Error(`ZATCA API not found (${path}) — redeploy mesa-api or check API URL`)
  }
  if (!res.ok) throw new Error(await parseError(res))
  if (res.status === 204) return null
  const data = await res.json()
  if (data == null) throw new Error('Empty response from ZATCA API')
  return data
}

export type ZatcaEnvironment = 'sandbox' | 'simulation' | 'production'

export function asZatcaEnvironment(v: unknown): ZatcaEnvironment {
  return v === 'production' || v === 'simulation' ? v : 'sandbox'
}

export type ZatcaPhase2Config = {
  zatcaEnabled: boolean
  phase2Enabled: boolean
  environment: ZatcaEnvironment
  mode?: 'fatoora' | 'proxy'
  hasCsid: boolean
  hasPrivateKey: boolean
  hasBinaryToken: boolean
  hasSecret?: boolean
  csidKind?: string | null
  complianceRequestId?: string | null
  pih: string | null
  icv?: number
  sellerVat: string | null
  sellerName: string | null
  proxyConfigured: boolean
  proxyReachable?: boolean
  proxyName?: string | null
  proxyVersion?: string | null
  proxyMessage?: string
  fatooraReachable?: boolean
  fatooraBase?: string
  fatooraMessage?: string
  allowLocalSandbox?: boolean
  gatewayReady?: boolean
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
  qrPhase2Base64?: string | null
  message?: string | null
}

export type ZatcaProxyStatus = {
  mode?: string
  configured: boolean
  reachable: boolean
  name: string | null
  version: string | null
  message: string
  fatooraBase?: string
}

export type ZatcaOnboardResult = {
  ok: boolean
  message: string
  requestId?: string
  csid?: string
  binaryToken?: string
  config?: ZatcaPhase2Config
}

export function apiZatcaReady() {
  return apiMastersReady()
}

export async function apiGetZatcaConfig(): Promise<ZatcaPhase2Config> {
  return zatcaFetch('/zatca/config') as Promise<ZatcaPhase2Config>
}

export async function apiPutZatcaConfig(body: {
  phase2Enabled?: boolean
  environment?: ZatcaEnvironment
  csid?: string | null
  privateKey?: string | null
  binaryToken?: string | null
  secret?: string | null
}): Promise<ZatcaPhase2Config> {
  return zatcaFetch('/zatca/config', {
    method: 'PUT',
    body: JSON.stringify(body),
  }) as Promise<ZatcaPhase2Config>
}

export async function apiGetZatcaProxyStatus(): Promise<ZatcaProxyStatus> {
  return zatcaFetch('/zatca/proxy') as Promise<ZatcaProxyStatus>
}

export async function apiZatcaCompliance(body: Record<string, unknown> = {}): Promise<ZatcaOnboardResult> {
  return zatcaFetch('/zatca/onboard/compliance-check', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<ZatcaOnboardResult>
}

/** OTP from Fatoora → server generates CSR → Compliance CSID */
export async function apiZatcaOnboardCsr(body: {
  otp: string
  environment?: ZatcaEnvironment
  vatNumber?: string
  commonName?: string
  branchName?: string
  csrPem?: string
  privateKeyPem?: string
}): Promise<ZatcaOnboardResult> {
  return zatcaFetch('/zatca/onboard/csr', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<ZatcaOnboardResult>
}

export async function apiZatcaOnboardProduction(): Promise<ZatcaOnboardResult> {
  return zatcaFetch('/zatca/onboard/production', {
    method: 'POST',
    body: JSON.stringify({}),
  }) as Promise<ZatcaOnboardResult>
}

/** @deprecated use apiZatcaOnboardProduction */
export async function apiZatcaOnboardCsid(_body: {
  requestId: string
  otp: string
}): Promise<ZatcaOnboardResult> {
  return apiZatcaOnboardProduction()
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

export async function apiListZatcaInvoices(take = 50): Promise<ZatcaRemoteInvoice[]> {
  const rows = await zatcaFetch(`/zatca/invoices?take=${take}`)
  return Array.isArray(rows) ? (rows as ZatcaRemoteInvoice[]) : []
}

export async function apiGetZatcaInvoice(id: string): Promise<ZatcaRemoteInvoice | null> {
  return zatcaFetch(`/zatca/invoices/${encodeURIComponent(id)}`, {
    allowNotFound: true,
  }) as Promise<ZatcaRemoteInvoice | null>
}
