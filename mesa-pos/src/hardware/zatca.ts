/** ZATCA Phase 1 TLV QR + Phase 2 report (API). Never block settle. */

import QRCode from 'qrcode'
import { loadCompanyProfile } from '../data/company'
import { tenantGetItem, tenantSetItem } from '../data/repos/db'
import { getDeviceId } from '../sync/deviceId'
import { enqueueOutbox, clearOutboxEntity, loadOutbox } from '../sync/outbox'
import {
  apiGetZatcaConfig,
  apiGetZatcaInvoice,
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

export function peekLastZatcaInvoice() {
  return lastInvoice
}

export function getZatcaInvoice(uuid: string): ZatcaInvoice | undefined {
  if (lastInvoice?.invoiceUuid === uuid) return lastInvoice
  return loadStore().find((r) => r.invoiceUuid === uuid)
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
  const parts = [
    tlvTag(1, input.sellerName.trim() || 'Seller'),
    tlvTag(2, vat),
    tlvTag(3, input.timestamp),
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

function qrDataUrlSync(tlvBase64: string): string {
  const qr = QRCode.create(tlvBase64, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const cell = 4
  const canvas = document.createElement('canvas')
  canvas.width = size * cell
  canvas.height = size * cell
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.modules.get(x, y)) ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }
  return canvas.toDataURL('image/png')
}

export function prepareZatcaPhase1(payload: ZatcaPayload): ZatcaInvoice | null {
  if (!isZatcaEnabled()) return null
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

function mapRemoteStatus(status: string): ZatcaPhase2Status {
  if (status === 'reported' || status === 'sandbox' || status === 'failed' || status === 'queued' || status === 'pending') {
    return status
  }
  return 'pending'
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
        patchInvoice(op.entityId, {
          phase2Status: mapRemoteStatus(remote.status),
          phase2Message: remote.message ?? undefined,
          zatcaUuid: remote.zatcaUuid ?? undefined,
          invoiceHash: remote.invoiceHash ?? undefined,
        })
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
      patchInvoice(op.entityId, {
        phase2Status: mapRemoteStatus(remote.status),
        phase2Message: remote.message ?? undefined,
        zatcaUuid: remote.zatcaUuid ?? undefined,
        invoiceHash: remote.invoiceHash ?? undefined,
      })
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
        patchInvoice(invoice.invoiceUuid, {
          phase2Status: mapRemoteStatus(remote.status),
          phase2Message: remote.message ?? undefined,
          zatcaUuid: remote.zatcaUuid ?? undefined,
          invoiceHash: remote.invoiceHash ?? undefined,
        })
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

export function attachZatcaToReceipt<
  T extends {
    kind?: 'paid' | 'guest' | 'ebill'
    zatcaQrDataUrl?: string
    invoiceUuid?: string
    zatcaPhase2Status?: ZatcaPhase2Status
    zatcaPhase2Message?: string
  },
>(receipt: T): T {
  if (receipt.kind === 'guest' || receipt.kind === 'ebill') return receipt
  const z = receipt.invoiceUuid ? getZatcaInvoice(receipt.invoiceUuid) : peekLastZatcaInvoice()
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
