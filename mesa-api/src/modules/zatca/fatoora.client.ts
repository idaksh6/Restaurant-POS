/**
 * Direct ZATCA Fatoora HTTP client (Option B).
 * Specs: Accept-Version V2, Basic auth = base64(binaryToken:secret).
 *
 * Bases:
 *   sandbox     → …/e-invoicing/developer-portal
 *   simulation  → …/e-invoicing/simulation
 *   production  → …/e-invoicing/core
 */

export type FatooraEnv = 'sandbox' | 'simulation' | 'production'

const BASES: Record<FatooraEnv, string> = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
}

export function fatooraBase(env: FatooraEnv): string {
  const override = process.env.ZATCA_FATOORA_BASE?.trim()
  if (override) return override.replace(/\/$/, '')
  return BASES[env]
}

export function mapUiEnvToFatoora(env: string): FatooraEnv {
  if (env === 'production') return 'production'
  if (env === 'simulation') return 'simulation'
  return 'sandbox'
}

export function fatooraBasicAuth(binaryToken: string, secret: string): string {
  return Buffer.from(`${binaryToken}:${secret}`, 'utf8').toString('base64')
}

type FatooraJson = Record<string, unknown>

async function fatooraFetch(
  env: FatooraEnv,
  path: string,
  init: {
    method?: string
    headers?: Record<string, string>
    body?: unknown
    timeoutMs?: number
  } = {},
): Promise<{ ok: boolean; status: number; json: FatooraJson; text: string }> {
  const base = fatooraBase(env)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30_000)
  try {
    const res = await fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'Accept-Version': 'V2',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const text = await res.text()
    let json: FatooraJson = {}
    try {
      json = JSON.parse(text) as FatooraJson
    } catch {
      /* plain */
    }
    return { ok: res.ok, status: res.status, json, text }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      status: 0,
      json: {},
      text: aborted
        ? 'Fatoora timed out'
        : err instanceof Error
          ? err.message
          : 'Fatoora unreachable',
    }
  } finally {
    clearTimeout(timer)
  }
}

type ValidationMsg = { code?: unknown; message?: unknown }
type ValidationResults = {
  status?: unknown
  warningMessages?: ValidationMsg[]
  errorMessages?: ValidationMsg[]
}

function fmtMsgs(list: ValidationMsg[] | undefined, max = 3): string {
  if (!list?.length) return ''
  const shown = list
    .slice(0, max)
    .map((m) => `${m.code ? `${String(m.code)}: ` : ''}${String(m.message ?? '').slice(0, 140)}`)
  const more = list.length > max ? ` (+${list.length - max} more)` : ''
  return shown.join(' | ') + more
}

/** Human-readable summary of a Fatoora validation response (no raw JSON dumps). */
function summarizeValidation(json: FatooraJson): string | null {
  const vr = json.validationResults as ValidationResults | undefined
  if (!vr || typeof vr !== 'object') return null
  const status = String(vr.status ?? '').toUpperCase() || 'UNKNOWN'
  const reporting = json.reportingStatus ? String(json.reportingStatus) : ''
  const clearance = json.clearanceStatus ? String(json.clearanceStatus) : ''
  const warnings = vr.warningMessages ?? []
  const errors = vr.errorMessages ?? []
  const head = [
    `Validation ${status}`,
    reporting ? `reporting ${reporting}` : '',
    clearance ? `clearance ${clearance}` : '',
    `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
    `${errors.length} error${errors.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const details = [errors.length ? `Errors → ${fmtMsgs(errors)}` : '', warnings.length ? `Warnings → ${fmtMsgs(warnings)}` : '']
    .filter(Boolean)
    .join(' ')
  return details ? `${head}. ${details}` : head
}

/**
 * Strict acceptance check for compliance / reporting responses.
 * Fatoora answers 200/202 even when validation fails and the invoice is
 * NOT_REPORTED, so HTTP status alone is not enough — and a loose regex on
 * "REPORTED" would also match "NOT_REPORTED".
 */
function fatooraAccepted(res: { ok: boolean; json: FatooraJson }): boolean {
  const vr = res.json.validationResults as ValidationResults | undefined
  const validation = String(vr?.status ?? '').toUpperCase()
  const reporting = String(res.json.reportingStatus ?? '').toUpperCase()
  const clearance = String(res.json.clearanceStatus ?? '').toUpperCase()
  if (reporting === 'NOT_REPORTED' || clearance === 'NOT_CLEARED') return false
  if (validation === 'ERROR' || (vr?.errorMessages?.length ?? 0) > 0) return false
  if (reporting === 'REPORTED' || clearance === 'CLEARED') return true
  if (validation === 'PASS' || validation === 'WARNING') return true
  // No validation block at all (unexpected shape) — trust the HTTP status.
  return res.ok && !vr
}

function pickMessage(json: FatooraJson, text: string, fallback: string): string {
  if (typeof json.message === 'string' && json.message.trim()) return json.message
  const summary = summarizeValidation(json)
  if (summary) return summary
  const errs = json.errors
  if (Array.isArray(errs) && errs.length) {
    return errs
      .map((e) =>
        typeof e === 'string'
          ? e
          : e && typeof e === 'object' && 'message' in e
            ? String((e as { message: unknown }).message)
            : JSON.stringify(e),
      )
      .join('; ')
      .slice(0, 500)
  }
  // Plain-text (non-JSON) bodies are worth surfacing; JSON blobs are not.
  const looksJson = text.trim().startsWith('{') || text.trim().startsWith('[')
  return (!looksJson && text.trim().slice(0, 400)) || fallback
}

export type CsidResponse = {
  ok: boolean
  message: string
  requestId?: string
  binarySecurityToken?: string
  secret?: string
  dispositionMessage?: string
  raw?: FatooraJson
}

/** POST /compliance — OTP + Base64 CSR → Compliance CSID */
export async function requestComplianceCsid(input: {
  env: FatooraEnv
  otp: string
  csrBase64: string
}): Promise<CsidResponse> {
  const res = await fatooraFetch(input.env, '/compliance', {
    method: 'POST',
    headers: { OTP: input.otp.trim() },
    body: { csr: input.csrBase64 },
  })
  const token =
    (res.json.binarySecurityToken as string | undefined) ??
    (res.json.binary_security_token as string | undefined)
  const secret = (res.json.secret as string | undefined) ?? undefined
  const requestId =
    (res.json.requestID as string | undefined) ??
    (res.json.requestId as string | undefined) ??
    (res.json.compliance_request_id as string | undefined)
  const issued = res.ok && Boolean(token && secret)
  return {
    ok: issued,
    message: issued
      ? `Compliance CSID issued${res.json.dispositionMessage ? ` (${String(res.json.dispositionMessage)})` : ''}${requestId ? ` · request ${String(requestId)}` : ''}`
      : pickMessage(res.json, res.text, 'Compliance CSID failed'),
    requestId: requestId ? String(requestId) : undefined,
    binarySecurityToken: token ? String(token) : undefined,
    secret: secret ? String(secret) : undefined,
    dispositionMessage: res.json.dispositionMessage
      ? String(res.json.dispositionMessage)
      : undefined,
    raw: res.json,
  }
}

/** POST /compliance/invoices — compliance sample submission */
export async function submitComplianceInvoice(input: {
  env: FatooraEnv
  binaryToken: string
  secret: string
  invoiceHash: string
  uuid: string
  invoiceBase64: string
}): Promise<{ ok: boolean; message: string; raw?: FatooraJson }> {
  const res = await fatooraFetch(input.env, '/compliance/invoices', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${fatooraBasicAuth(input.binaryToken, input.secret)}`,
    },
    body: {
      invoiceHash: input.invoiceHash,
      uuid: input.uuid,
      invoice: input.invoiceBase64,
    },
  })
  const accepted = fatooraAccepted(res)
  return {
    ok: accepted,
    message: pickMessage(
      res.json,
      res.text,
      accepted ? 'Compliance invoice accepted' : 'Compliance invoice rejected',
    ),
    raw: res.json,
  }
}

/** POST /production/csids — compliance CSID → production CSID */
export async function requestProductionCsid(input: {
  env: FatooraEnv
  binaryToken: string
  secret: string
  complianceRequestId: string
}): Promise<CsidResponse> {
  const res = await fatooraFetch(input.env, '/production/csids', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${fatooraBasicAuth(input.binaryToken, input.secret)}`,
    },
    body: { compliance_request_id: input.complianceRequestId },
  })
  const token =
    (res.json.binarySecurityToken as string | undefined) ??
    (res.json.binary_security_token as string | undefined)
  const secret = (res.json.secret as string | undefined) ?? undefined
  const issued = res.ok && Boolean(token && secret)
  let message = issued
    ? `Production CSID issued${res.json.dispositionMessage ? ` (${String(res.json.dispositionMessage)})` : ''}`
    : pickMessage(res.json, res.text, 'Production CSID failed')
  if (!issued && /not authorized/i.test(message)) {
    message +=
      ' — the compliance CSID is not valid in this environment. Run the compliance check first, and request the production CSID in the same environment that issued the compliance CSID.'
  }
  return {
    ok: issued,
    message,
    binarySecurityToken: token ? String(token) : undefined,
    secret: secret ? String(secret) : undefined,
    dispositionMessage: res.json.dispositionMessage
      ? String(res.json.dispositionMessage)
      : undefined,
    raw: res.json,
  }
}

export type ReportResult = {
  ok: boolean
  message: string
  status?: string
  uuid?: string
  qrBase64?: string
  clearedInvoice?: string
  raw?: FatooraJson
}

/** POST /invoices/reporting/single — simplified B2C */
export async function reportInvoice(input: {
  env: FatooraEnv
  binaryToken: string
  secret: string
  invoiceHash: string
  uuid: string
  invoiceBase64: string
}): Promise<ReportResult> {
  const res = await fatooraFetch(input.env, '/invoices/reporting/single', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${fatooraBasicAuth(input.binaryToken, input.secret)}`,
    },
    body: {
      invoiceHash: input.invoiceHash,
      uuid: input.uuid,
      invoice: input.invoiceBase64,
    },
    timeoutMs: 45_000,
  })
  const reportingStatus = String(
    res.json.reportingStatus ?? res.json.clearanceStatus ?? res.json.status ?? '',
  )
  const ok = fatooraAccepted(res)
  const cleared =
    (res.json.clearedInvoice as string | undefined) ??
    (res.json.invoice as string | undefined)
  return {
    ok,
    message: pickMessage(res.json, res.text, ok ? 'Reported to Fatoora' : 'Fatoora report failed'),
    status: reportingStatus || undefined,
    uuid: input.uuid,
    qrBase64: res.json.qrSellertStatus ? undefined : undefined,
    clearedInvoice: cleared ? String(cleared) : undefined,
    raw: res.json,
  }
}

/** Lightweight connectivity probe (compliance without body will 4xx — treat reachable if not network fail). */
export async function probeFatoora(env: FatooraEnv): Promise<{
  reachable: boolean
  message: string
  base: string
}> {
  const base = fatooraBase(env)
  const res = await fatooraFetch(env, '/compliance', {
    method: 'POST',
    headers: { OTP: '000000' },
    body: { csr: 'dGVzdA==' },
    timeoutMs: 10_000,
  })
  if (res.status === 0) {
    return { reachable: false, message: res.text, base }
  }
  return {
    reachable: true,
    message: `Fatoora reachable (${res.status})`,
    base,
  }
}
