/**
 * Certified Fatoora / ZATCA gateway adapter.
 *
 * Mesa never talks to ZATCA directly. Set `ZATCA_PROXY_URL` to a compliant
 * EGS/proxy that implements this HTTP contract. Optional shared secret:
 * `ZATCA_PROXY_SECRET` → header `x-zatca-proxy-secret`.
 *
 * Contract (all JSON):
 *   GET  {base}/health
 *        → { ok: true, name?: string, version?: string }
 *   POST {base}/report
 *        ← { environment, invoiceUuid, invoiceHash, xml, signature?, csid, binaryToken, pih }
 *        → { ok, uuid?, message?, invoiceHash?, qrTlvBase64?,
 *            ecdsaSignature?, publicKey?, stampSignature?, clearedXml? }
 *   POST {base}/compliance
 *        ← { environment, xml, invoiceHash? }
 *        → { ok, message?, errors?: string[] }
 *   POST {base}/onboard/csr
 *        ← { environment, csrPem, otp?, vatNumber?, commonName? }
 *        → { ok, requestId?, csid?, binaryToken?, message? }
 *   POST {base}/onboard/csid
 *        ← { environment, requestId, otp }
 *        → { ok, csid?, binaryToken?, message? }
 */

export type ZatcaProxyEnvironment = 'sandbox' | 'production'

export type ZatcaProxyReportRequest = {
  environment: ZatcaProxyEnvironment
  invoiceUuid: string
  invoiceHash: string
  xml: string
  signature?: string | null
  csid: string
  binaryToken: string
  pih: string
}

export type ZatcaProxyReportResult = {
  ok: boolean
  statusCode: number
  uuid?: string
  message: string
  invoiceHash?: string
  /** Full Phase-2 TLV (tags 1–9) Base64 — preferred when gateway builds QR. */
  qrTlvBase64?: string
  ecdsaSignature?: string
  publicKey?: string
  stampSignature?: string
  clearedXml?: string
}

export type ZatcaProxyComplianceResult = {
  ok: boolean
  message: string
  errors: string[]
}

export type ZatcaProxyOnboardResult = {
  ok: boolean
  message: string
  requestId?: string
  csid?: string
  binaryToken?: string
}

function proxyBase(): string | null {
  const raw = process.env.ZATCA_PROXY_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

function proxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const secret = process.env.ZATCA_PROXY_SECRET?.trim()
  if (secret) headers['x-zatca-proxy-secret'] = secret
  return headers
}

export function isZatcaProxyConfigured() {
  return Boolean(proxyBase())
}

/** Demo-only: allow local “sandbox” status without a gateway. Off by default (path A). */
export function allowLocalZatcaSandbox() {
  const v = (process.env.ZATCA_ALLOW_LOCAL_SANDBOX || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

async function proxyFetch(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  const base = proxyBase()
  if (!base) {
    return { ok: false, status: 0, json: {}, text: 'ZATCA_PROXY_URL not set' }
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12_000)
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...proxyHeaders(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    })
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      /* plain text body */
    }
    return { ok: res.ok, status: res.status, json, text }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      status: 0,
      json: {},
      text: aborted
        ? 'Gateway timed out'
        : err instanceof Error
          ? err.message
          : 'Proxy unreachable',
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function proxyHealth(): Promise<{
  configured: boolean
  reachable: boolean
  name: string | null
  version: string | null
  message: string
}> {
  if (!isZatcaProxyConfigured()) {
    return {
      configured: false,
      reachable: false,
      name: null,
      version: null,
      message: 'Set ZATCA_PROXY_URL on the API to a certified Fatoora gateway',
    }
  }
  const res = await proxyFetch('/health', { method: 'GET' })
  if (!res.ok) {
    return {
      configured: true,
      reachable: false,
      name: null,
      version: null,
      message: res.text.slice(0, 240) || `Gateway health failed (${res.status})`,
    }
  }
  return {
    configured: true,
    reachable: true,
    name: res.json.name ? String(res.json.name) : null,
    version: res.json.version ? String(res.json.version) : null,
    message: String(res.json.message ?? 'Gateway reachable'),
  }
}

export async function proxyReport(body: ZatcaProxyReportRequest): Promise<ZatcaProxyReportResult> {
  const res = await proxyFetch('/report', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const message = String(
    res.json.message ?? (res.text.slice(0, 240) || (res.ok ? 'Reported' : `Proxy ${res.status}`)),
  )
  return {
    ok: res.ok && res.json.ok !== false,
    statusCode: res.status,
    uuid: res.json.uuid
      ? String(res.json.uuid)
      : res.json.zatcaUuid
        ? String(res.json.zatcaUuid)
        : undefined,
    message,
    invoiceHash: res.json.invoiceHash ? String(res.json.invoiceHash) : undefined,
    qrTlvBase64: res.json.qrTlvBase64
      ? String(res.json.qrTlvBase64)
      : res.json.qrBase64
        ? String(res.json.qrBase64)
        : undefined,
    ecdsaSignature: res.json.ecdsaSignature
      ? String(res.json.ecdsaSignature)
      : res.json.signature
        ? String(res.json.signature)
        : undefined,
    publicKey: res.json.publicKey ? String(res.json.publicKey) : undefined,
    stampSignature: res.json.stampSignature ? String(res.json.stampSignature) : undefined,
    clearedXml: res.json.clearedXml
      ? String(res.json.clearedXml)
      : res.json.xml
        ? String(res.json.xml)
        : undefined,
  }
}

export async function proxyCompliance(body: {
  environment: ZatcaProxyEnvironment
  xml: string
  invoiceHash?: string
}): Promise<ZatcaProxyComplianceResult> {
  const res = await proxyFetch('/compliance', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const errors = Array.isArray(res.json.errors)
    ? (res.json.errors as unknown[]).map((e) => String(e))
    : []
  return {
    ok: res.ok && res.json.ok !== false && errors.length === 0,
    message: String(
      res.json.message ?? (res.text.slice(0, 240) || (res.ok ? 'Compliance OK' : 'Compliance failed')),
    ),
    errors,
  }
}

export async function proxyOnboardCsr(body: {
  environment: ZatcaProxyEnvironment
  csrPem: string
  otp?: string
  vatNumber?: string
  commonName?: string
}): Promise<ZatcaProxyOnboardResult> {
  const res = await proxyFetch('/onboard/csr', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return {
    ok: res.ok && res.json.ok !== false,
    message: String(
      res.json.message ?? (res.text.slice(0, 240) || (res.ok ? 'CSR accepted' : 'CSR failed')),
    ),
    requestId: res.json.requestId ? String(res.json.requestId) : undefined,
    csid: res.json.csid ? String(res.json.csid) : undefined,
    binaryToken: res.json.binaryToken ? String(res.json.binaryToken) : undefined,
  }
}

export async function proxyOnboardCsid(body: {
  environment: ZatcaProxyEnvironment
  requestId: string
  otp: string
}): Promise<ZatcaProxyOnboardResult> {
  const res = await proxyFetch('/onboard/csid', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return {
    ok: res.ok && res.json.ok !== false,
    message: String(
      res.json.message ?? (res.text.slice(0, 240) || (res.ok ? 'CSID issued' : 'CSID failed')),
    ),
    requestId: body.requestId,
    csid: res.json.csid ? String(res.json.csid) : undefined,
    binaryToken: res.json.binaryToken ? String(res.json.binaryToken) : undefined,
  }
}
