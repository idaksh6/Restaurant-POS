/** ZATCA Phase 1 TLV QR + Phase 2 report (API). Never block settle. */

import QRCode from 'qrcode'
import { loadCompanyProfile } from '../data/company'
import { tenantGetItem, tenantSetItem } from '../data/repos/db'
import { getDeviceId } from '../sync/deviceId'
import { enqueueOutbox, clearOutboxEntity, loadOutbox } from '../sync/outbox'
import {
  apiGetZatcaConfig,
  apiGetZatcaInvoice,
  apiListZatcaInvoices,
  apiSubmitZatcaInvoice,
  apiZatcaReady,
  type ZatcaPhase2Config,
} from '../lib/apiZatca'

export type ZatcaPhase2Status =
  | 'local'
  | 'pending'
  | 'queued'
  | 'sandbox'
  | 'reported'
  | 'failed'

export type ZatcaPayload = {
  invoiceUuid: string
  totalSar: number
  vatSar: number
  sellerVat: string
  sellerName?: string
  timestamp?: string
}

export type ZatcaInvoice = {
  invoiceUuid: string
  totalSar: number
  vatSar: number
  sellerVat: string
  sellerName: string
  timestamp: string
  tlvBase64: string
  qrDataUrl: string
  createdAt: string
  phase2Status?: ZatcaPhase2Status
  phase2Message?: string
  zatcaUuid?: string
  invoiceHash?: string
}

export type ZatcaSubmitResult = {
  ok: boolean
  skipped?: boolean
  message: string
  invoice?: ZatcaInvoice
}

const STORE_KEY = 'mesa-zatca-invoices'
const MAX_STORED = 80
const PHASE2_CFG_KEY = 'mesa-zatca-phase2-cfg'

let lastInvoice: ZatcaInvoice | null = null
let cachedPhase2: ZatcaPhase2Config | null = null

export function isZatcaEnabled() {
  if (import.meta.env.VITE_ZATCA_ENABLED === 'true') return true
  try {
    return loadCompanyProfile().zatcaEnabled === true
  } catch {
    return false
  }
}

/** Phase 1 TLV QR when ZATCA is on, or when company has a valid VAT ID (KSA settle slips). */
export function canEmitPhase1Qr() {
  if (isZatcaEnabled()) return true
  try {
    const company = loadCompanyProfile()
    if (company.enableTax === false) return false
    return normalizeSellerVat(company.taxId || '').length >= 10
  } catch {
    return false
  }
}

export function peekLastZatcaInvoice() {
  return lastInvoice
}

export function getZatcaInvoice(uuid: string): ZatcaInvoice | undefined {
  if (lastInvoice?.invoiceUuid === uuid) return lastInvoice
  return loadStore().find((r) => r.invoiceUuid === uuid)
}

/** Local Phase 2 invoice queue (newest first). */
export function listLocalZatcaInvoices(): ZatcaInvoice[] {
  return loadStore()
}

function loadStore(): ZatcaInvoice[] {
  try {
    const raw = tenantGetItem(STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ZatcaInvoice[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveInvoice(row: ZatcaInvoice) {
  lastInvoice = row
  const next = [row, ...loadStore().filter((r) => r.invoiceUuid !== row.invoiceUuid)].slice(
    0,
    MAX_STORED,
  )
  tenantSetItem(STORE_KEY, JSON.stringify(next))
}

function patchInvoice(uuid: string, patch: Partial<ZatcaInvoice>) {
  const cur = getZatcaInvoice(uuid)
  if (!cur) return null
  const next = { ...cur, ...patch }
  saveInvoice(next)
  return next
}

export function normalizeSellerVat(raw: string) {
  return raw.replace(/\D/g, '')
}

function tlvTag(tag: number, value: string): Uint8Array {
  const enc = new TextEncoder().encode(value)
  if (enc.length > 255) {
    throw new Error(`ZATCA TLV tag ${tag} too long`)
  }
  const out = new Uint8Array(2 + enc.length)
  out[0] = tag
  out[1] = enc.length
  out.set(enc, 2)
  return out
}

export function buildZatcaTlvBase64(input: {
  sellerName: string
  sellerVat: string
  timestamp: string
  totalSar: number
  vatSar: number
}): string {
  const vat = normalizeSellerVat(input.sellerVat)
  if (vat.length < 10) throw new Error('Seller VAT too short')
  const total = Number(input.totalSar).toFixed(2)
  const tax = Number(input.vatSar).toFixed(2)
  // ZATCA QR timestamp: ISO 8601 seconds precision (no milliseconds)
  const timestamp = input.timestamp.replace(/\.\d+(Z?)$/, '$1')
  const parts = [
    tlvTag(1, input.sellerName.trim() || 'Seller'),
    tlvTag(2, vat),
    tlvTag(3, timestamp),
    tlvTag(4, total),
    tlvTag(5, tax),
  ]
  let len = 0
  for (const p of parts) len += p.length
  const buf = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    buf.set(p, o)
    o += p.length
  }
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!)
  return btoa(bin)
}

/** Phase 2 TLV (tags 1–9, ~500 chars) needs a ~90-module QR — much denser than Phase 1. */
export function isDenseZatcaQr(tlvBase64: string | undefined | null) {
  return Boolean(tlvBase64 && tlvBase64.length > 300)
}

function qrDataUrlSync(tlvBase64: string): string {
  const qr = QRCode.create(tlvBase64, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const cell = 4
  // QR spec quiet zone: 4 modules of white on every side — without it phone
  // scanners struggle to lock on, especially with the dense Phase 2 payload.
  const margin = 4
  const px = (size + margin * 2) * cell
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, px, px)
  ctx.fillStyle = '#000'
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.modules.get(x, y)) ctx.fillRect((x + margin) * cell, (y + margin) * cell, cell, cell)
    }
  }
  return canvas.toDataURL('image/png')
}

function mapRemoteStatus(status: string): ZatcaPhase2Status {
  if (status === 'reported' || status === 'sandbox' || status === 'failed' || status === 'queued' || status === 'pending') {
    return status
  }
  return 'pending'
}

/** Prefer Phase-2 stamped TLV (tags 1–9) when the certified gateway returns it. */
function applyRemoteQr(invoiceUuid: string, remote: {
  qrPhase2Base64?: string | null
  tlvBase64?: string | null
  invoiceHash?: string | null
  zatcaUuid?: string | null
  status?: string
  message?: string | null
}) {
  const phase2Tlv = remote.qrPhase2Base64?.trim()
  const patch: Partial<ZatcaInvoice> = {
    phase2Status: remote.status ? mapRemoteStatus(remote.status) : undefined,
    phase2Message: remote.message ?? undefined,
    zatcaUuid: remote.zatcaUuid ?? undefined,
    invoiceHash: remote.invoiceHash ?? undefined,
  }
  if (phase2Tlv && typeof document !== 'undefined') {
    try {
      patch.tlvBase64 = phase2Tlv
      patch.qrDataUrl = qrDataUrlSync(phase2Tlv)
    } catch {
      /* keep Phase 1 QR */
    }
  }
  return patchInvoice(invoiceUuid, patch)
}

export function prepareZatcaPhase1(payload: ZatcaPayload): ZatcaInvoice | null {
  if (!canEmitPhase1Qr()) return null
  if (typeof document === 'undefined') return null
  try {
    const company = loadCompanyProfile()
    const sellerVat = normalizeSellerVat(payload.sellerVat || company.taxId)
    const sellerName = (payload.sellerName || company.companyName || 'Mesa').trim()
    const timestamp = payload.timestamp || new Date().toISOString()
    const tlvBase64 = buildZatcaTlvBase64({
      sellerName,
      sellerVat,
      timestamp,
      totalSar: payload.totalSar,
      vatSar: payload.vatSar,
    })
    const qrDataUrl = qrDataUrlSync(tlvBase64)
    const invoice: ZatcaInvoice = {
      invoiceUuid: payload.invoiceUuid,
      totalSar: payload.totalSar,
      vatSar: payload.vatSar,
      sellerVat,
      sellerName,
      timestamp,
      tlvBase64,
      qrDataUrl,
      createdAt: new Date().toISOString(),
      phase2Status: 'local',
    }
    saveInvoice(invoice)
    return invoice
  } catch {
    return null
  }
}

export function isZatcaSubmitComplete(invoiceUuid: string) {
  const z = getZatcaInvoice(invoiceUuid)
  return z?.phase2Status === 'sandbox' || z?.phase2Status === 'reported'
}

/** Drop stale zatca.submit outbox rows when invoice already reported (local or API). */
export async function reconcileZatcaOutbox() {
  const targets = loadOutbox().filter(
    (o) =>
      o.type === 'zatca.submit' &&
      (o.status === 'pending' || o.status === 'syncing' || o.status === 'poison'),
  )
  for (const op of targets) {
    if (isZatcaSubmitComplete(op.entityId)) {
      clearOutboxEntity(op.entityId, 'zatca.submit')
      continue
    }
    if (!apiZatcaReady()) continue
    const payload = (op.payload ?? {}) as Record<string, unknown>
    try {
      let remote = await apiGetZatcaInvoice(op.entityId)
      if (remote?.status === 'sandbox' || remote?.status === 'reported') {
        clearOutboxEntity(op.entityId, 'zatca.submit')
        applyRemoteQr(op.entityId, remote)
        continue
      }
      remote = await apiSubmitZatcaInvoice({
        invoiceUuid: op.entityId,
        totalSar: Number(payload.totalSar ?? 0),
        vatSar: Number(payload.vatSar ?? 0),
        sellerVat: String(payload.sellerVat ?? ''),
        sellerName: payload.sellerName ? String(payload.sellerName) : undefined,
        timestamp: payload.timestamp ? String(payload.timestamp) : undefined,
        tlvBase64: payload.tlvBase64 ? String(payload.tlvBase64) : undefined,
      })
      clearOutboxEntity(op.entityId, 'zatca.submit')
      applyRemoteQr(op.entityId, remote)
    } catch {
      /* keep queued — push may retry */
    }
  }
}

/** Fire-and-forget Phase 2 report via REST-first + outbox. */
export function queueZatcaPhase2(invoice: ZatcaInvoice) {
  if (isZatcaSubmitComplete(invoice.invoiceUuid)) return
  patchInvoice(invoice.invoiceUuid, { phase2Status: 'pending' })
  const payload = {
    invoiceUuid: invoice.invoiceUuid,
    totalSar: invoice.totalSar,
    vatSar: invoice.vatSar,
    sellerVat: invoice.sellerVat,
    sellerName: invoice.sellerName,
    timestamp: invoice.timestamp,
    tlvBase64: invoice.tlvBase64,
  }
  if (apiZatcaReady()) {
    void apiSubmitZatcaInvoice(payload)
      .then((remote) => {
        clearOutboxEntity(invoice.invoiceUuid, 'zatca.submit')
        applyRemoteQr(invoice.invoiceUuid, remote)
      })
      .catch(() => {
        enqueueOutbox('zatca.submit', invoice.invoiceUuid, payload, getDeviceId(), null)
        patchInvoice(invoice.invoiceUuid, {
          phase2Status: 'pending',
          phase2Message: 'Queued for sync',
        })
      })
    return
  }
  enqueueOutbox('zatca.submit', invoice.invoiceUuid, payload, getDeviceId(), null)
  patchInvoice(invoice.invoiceUuid, {
    phase2Status: 'pending',
    phase2Message: 'Queued offline',
  })
}

export async function submitZatcaInvoice(payload: ZatcaPayload): Promise<ZatcaSubmitResult> {
  if (!isZatcaEnabled()) {
    return { ok: true, skipped: true, message: 'ZATCA path disabled' }
  }
  try {
    const invoice = prepareZatcaPhase1(payload)
    if (!invoice) {
      return { ok: false, message: 'ZATCA QR generation failed' }
    }
    void refreshZatcaPhase2Config()
      .then((cfg) => {
        if (cfg?.phase2Enabled) queueZatcaPhase2(invoice)
      })
      .catch(() => undefined)
    return {
      ok: true,
      message: `ZATCA Phase 1 QR ready · ${invoice.invoiceUuid}`,
      invoice,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'ZATCA submit failed',
    }
  }
}

export function newZatcaInvoiceUuid(seed?: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return seed ? `inv-${seed}-${crypto.randomUUID().slice(0, 8)}` : `inv-${crypto.randomUUID()}`
  }
  return `inv-${seed ?? 'x'}-${Date.now()}`
}

/** Build / refresh the local invoice row from the server copy (stamped Phase 2 QR wins). */
export function applyRemoteZatcaInvoice(
  invoiceUuid: string,
  remote: {
    status?: string
    totalSar?: number
    vatSar?: number
    sellerVat?: string
    sellerName?: string | null
    timestamp?: string
    qrPhase2Base64?: string | null
    tlvBase64?: string | null
    invoiceHash?: string | null
    zatcaUuid?: string | null
    message?: string | null
  },
): ZatcaInvoice | null {
  const existing = getZatcaInvoice(invoiceUuid)
  if (existing) return applyRemoteQr(invoiceUuid, remote)
  if (typeof document === 'undefined') return null
  const tlv = remote.qrPhase2Base64?.trim() || remote.tlvBase64?.trim()
  if (!tlv) return null
  try {
    const row: ZatcaInvoice = {
      invoiceUuid,
      totalSar: Number(remote.totalSar ?? 0),
      vatSar: Number(remote.vatSar ?? 0),
      sellerVat: normalizeSellerVat(remote.sellerVat ?? ''),
      sellerName: (remote.sellerName ?? '').trim(),
      timestamp: remote.timestamp ?? new Date().toISOString(),
      tlvBase64: tlv,
      qrDataUrl: qrDataUrlSync(tlv),
      createdAt: new Date().toISOString(),
      phase2Status: remote.status ? mapRemoteStatus(remote.status) : undefined,
      phase2Message: remote.message ?? undefined,
      zatcaUuid: remote.zatcaUuid ?? undefined,
      invoiceHash: remote.invoiceHash ?? undefined,
    }
    saveInvoice(row)
    return row
  } catch {
    return null
  }
}

/** Fetch the server copy of an invoice and cache it locally (returns the merged row). */
export async function hydrateZatcaFromRemote(invoiceUuid: string): Promise<ZatcaInvoice | null> {
  if (!apiZatcaReady()) return getZatcaInvoice(invoiceUuid) ?? null
  try {
    const remote = await apiGetZatcaInvoice(invoiceUuid)
    if (!remote) return getZatcaInvoice(invoiceUuid) ?? null
    return applyRemoteZatcaInvoice(invoiceUuid, remote) ?? getZatcaInvoice(invoiceUuid) ?? null
  } catch {
    return getZatcaInvoice(invoiceUuid) ?? null
  }
}

function sameMoney(a: number, b: number) {
  return Math.abs(Number(a) - Number(b)) < 0.006
}

/**
 * Legacy ledger rows (before invoiceUuid was stored): find the invoice issued at
 * settle by matching totals + time (±10 min) in the local store, then the server.
 */
export async function resolveZatcaForSale(sale: {
  invoiceUuid?: string
  total: number
  tax: number
  at: string
}): Promise<string | undefined> {
  if (sale.invoiceUuid) return sale.invoiceUuid
  const saleMs = Date.parse(sale.at)
  const near = (ts: string | undefined) => {
    const ms = Date.parse(ts ?? '')
    return Number.isFinite(ms) && Number.isFinite(saleMs) && Math.abs(ms - saleMs) <= 10 * 60_000
  }
  const local = loadStore().find(
    (r) => sameMoney(r.totalSar, sale.total) && sameMoney(r.vatSar, sale.tax) && near(r.timestamp),
  )
  if (local) return local.invoiceUuid
  if (!apiZatcaReady()) return undefined
  try {
    const rows = await apiListZatcaInvoices(200)
    const hit = rows.find(
      (r) => sameMoney(r.totalSar, sale.total) && sameMoney(r.vatSar, sale.tax) && near(r.timestamp),
    )
    if (!hit) return undefined
    applyRemoteZatcaInvoice(hit.id, hit)
    return hit.id
  } catch {
    return undefined
  }
}

export function attachZatcaToReceipt<
  T extends {
    kind?: 'paid' | 'guest' | 'ebill'
    total?: number
    tax?: number
    zatcaQrDataUrl?: string
    invoiceUuid?: string
    zatcaPhase2Status?: ZatcaPhase2Status
    zatcaPhase2Message?: string
  },
>(receipt: T, opts: { createIfMissing?: boolean } = {}): T {
  if (receipt.kind === 'guest' || receipt.kind === 'ebill') return receipt
  if (receipt.zatcaQrDataUrl) return receipt
  let z = receipt.invoiceUuid ? getZatcaInvoice(receipt.invoiceUuid) : peekLastZatcaInvoice()
  // Reprints carry the settle-time id: never mint a replacement QR — the modal
  // hydrates the reported (Phase 2) copy from the server instead.
  if (!z && receipt.invoiceUuid) return receipt
  if (!z && opts.createIfMissing === false) return receipt
  if (!z && typeof receipt.total === 'number') {
    const company = loadCompanyProfile()
    z =
      prepareZatcaPhase1({
        invoiceUuid: newZatcaInvoiceUuid(),
        totalSar: receipt.total,
        vatSar: Number(receipt.tax) || 0,
        sellerVat: company.taxId,
        sellerName: company.companyName,
      }) ?? null
  }
  if (!z) return receipt
  return {
    ...receipt,
    zatcaQrDataUrl: z.qrDataUrl,
    invoiceUuid: z.invoiceUuid,
    zatcaPhase2Status: z.phase2Status,
    zatcaPhase2Message: z.phase2Message,
  }
}

export function peekZatcaPhase2Config() {
  if (cachedPhase2) return cachedPhase2
  try {
    const raw = tenantGetItem(PHASE2_CFG_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ZatcaPhase2Config
  } catch {
    return null
  }
}

export async function refreshZatcaPhase2Config() {
  if (!apiZatcaReady()) return peekZatcaPhase2Config()
  try {
    const cfg = await apiGetZatcaConfig()
    cachedPhase2 = cfg
    tenantSetItem(PHASE2_CFG_KEY, JSON.stringify(cfg))
    return cfg
  } catch {
    return peekZatcaPhase2Config()
  }
}

export function cacheZatcaPhase2Config(cfg: ZatcaPhase2Config) {
  cachedPhase2 = cfg
  tenantSetItem(PHASE2_CFG_KEY, JSON.stringify(cfg))
}
