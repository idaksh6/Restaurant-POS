import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { createHash, createSign, randomUUID } from 'crypto'
import { InjectPrisma, PrismaService } from '../../prisma.service'

export type ZatcaPhase2Status =
  | 'pending'
  | 'reported'
  | 'failed'
  | 'sandbox'
  | 'queued'

type CompanyZatcaRow = {
  zatcaEnabled?: boolean
  zatcaPhase2Enabled?: boolean
  zatcaPhase2Env?: string
  zatcaCsid?: string | null
  zatcaPrivateKey?: string | null
  zatcaBinaryToken?: string | null
  zatcaPih?: string | null
  taxId?: string | null
  companyName?: string
}

@Injectable()
export class ZatcaService {
  private readonly log = new Logger(ZatcaService.name)

  constructor(@InjectPrisma() private readonly prisma: PrismaService) {}

  async getConfig(companyId: string) {
    const row = await this.loadCompanyZatca(companyId)
    if (!row) throw new BadRequestException('Company not found')
    return {
      zatcaEnabled: row.zatcaEnabled === true,
      phase2Enabled: row.zatcaPhase2Enabled === true,
      environment: row.zatcaPhase2Env === 'production' ? 'production' : 'sandbox',
      hasCsid: Boolean(row.zatcaCsid?.trim()),
      hasPrivateKey: Boolean(row.zatcaPrivateKey?.trim()),
      hasBinaryToken: Boolean(row.zatcaBinaryToken?.trim()),
      pih: row.zatcaPih ?? null,
      sellerVat: row.taxId ?? null,
      sellerName: row.companyName ?? null,
      proxyConfigured: Boolean(process.env.ZATCA_PROXY_URL?.trim()),
    }
  }

  async putConfig(companyId: string, body: Record<string, unknown>) {
    const existing = await this.loadCompanyZatca(companyId)
    if (!existing) throw new BadRequestException('Company not found')

    const phase2Enabled =
      body.phase2Enabled === undefined
        ? Boolean(existing.zatcaPhase2Enabled)
        : body.phase2Enabled === true
    const environment =
      body.environment === 'production' ? 'production' : 'sandbox'

    const csid =
      body.csid === undefined
        ? existing.zatcaCsid
        : body.csid
          ? String(body.csid)
          : null
    const privateKey =
      body.privateKey === undefined
        ? existing.zatcaPrivateKey
        : body.privateKey
          ? String(body.privateKey)
          : null
    const binaryToken =
      body.binaryToken === undefined
        ? existing.zatcaBinaryToken
        : body.binaryToken
          ? String(body.binaryToken)
          : null

    await this.prisma.$executeRaw`
      UPDATE "Company" SET
        "zatcaPhase2Enabled" = ${phase2Enabled},
        "zatcaPhase2Env" = ${environment},
        "zatcaCsid" = ${csid},
        "zatcaPrivateKey" = ${privateKey},
        "zatcaBinaryToken" = ${binaryToken}
      WHERE id = ${companyId}
    `
    return this.getConfig(companyId)
  }

  async getInvoice(companyId: string, id: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string
        companyId: string
        status: string
        totalSar: number
        vatSar: number
        sellerVat: string
        sellerName: string
        timestamp: string
        tlvBase64: string | null
        invoiceHash: string | null
        zatcaUuid: string | null
        message: string | null
        createdAt: Date
        updatedAt: Date
      }>
    >`
      SELECT * FROM "ZatcaInvoice"
      WHERE id = ${id} AND "companyId" = ${companyId}
      LIMIT 1
    `
    return rows[0] ?? null
  }

  async listInvoices(companyId: string, take = 50) {
    const limit = Math.min(Math.max(take, 1), 200)
    return this.prisma.$queryRaw<
      Array<{
        id: string
        status: string
        totalSar: number
        vatSar: number
        sellerVat: string
        timestamp: string
        zatcaUuid: string | null
        message: string | null
        updatedAt: Date
      }>
    >`
      SELECT id, status, "totalSar", "vatSar", "sellerVat", timestamp, "zatcaUuid", message, "updatedAt"
      FROM "ZatcaInvoice"
      WHERE "companyId" = ${companyId}
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `
  }

  /**
   * Idempotent Phase 2 submit: hash draft, sandbox-report or proxy to ZATCA gateway.
   * Never throws for business failures — returns status on the row.
   */
  async submitInvoice(companyId: string, body: Record<string, unknown>) {
    const id = String(body.invoiceUuid || body.id || '').trim()
    if (!id) throw new BadRequestException('invoiceUuid required')

    const existing = await this.getInvoice(companyId, id)
    if (existing && (existing.status === 'reported' || existing.status === 'sandbox')) {
      return existing
    }

    const cfg = await this.loadCompanyZatca(companyId)
    if (!cfg) throw new BadRequestException('Company not found')
    if (!cfg.zatcaPhase2Enabled) {
      return this.upsertInvoice(companyId, {
        id,
        status: 'queued',
        totalSar: Number(body.totalSar ?? 0),
        vatSar: Number(body.vatSar ?? 0),
        sellerVat: String(body.sellerVat || cfg.taxId || ''),
        sellerName: String(body.sellerName || cfg.companyName || ''),
        timestamp: String(body.timestamp || new Date().toISOString()),
        tlvBase64: body.tlvBase64 ? String(body.tlvBase64) : null,
        invoiceHash: null,
        zatcaUuid: null,
        message: 'Phase 2 disabled — draft stored',
      })
    }

    const totalSar = Number(body.totalSar ?? 0)
    const vatSar = Number(body.vatSar ?? 0)
    const sellerVat = String(body.sellerVat || cfg.taxId || '').replace(/\D/g, '')
    const sellerName = String(body.sellerName || cfg.companyName || 'Seller')
    const timestamp = String(body.timestamp || new Date().toISOString())
    const tlvBase64 = body.tlvBase64 ? String(body.tlvBase64) : null
    const pih = cfg.zatcaPih || createHash('sha256').update('0').digest('base64')

    const draftXml = this.buildSimplifiedXml({
      id,
      sellerName,
      sellerVat,
      timestamp,
      totalSar,
      vatSar,
      pih,
    })
    const invoiceHash = createHash('sha256').update(draftXml).digest('base64')
    let signatureB64: string | null = null
    if (cfg.zatcaPrivateKey?.includes('PRIVATE KEY')) {
      try {
        const signer = createSign('SHA256')
        signer.update(draftXml)
        signer.end()
        signatureB64 = signer.sign(cfg.zatcaPrivateKey, 'base64')
      } catch (err) {
        this.log.warn(`ZATCA sign failed: ${err instanceof Error ? err.message : err}`)
      }
    }

    const proxy = process.env.ZATCA_PROXY_URL?.trim()
    const env = cfg.zatcaPhase2Env === 'production' ? 'production' : 'sandbox'
    const hasCreds = Boolean(cfg.zatcaCsid && cfg.zatcaBinaryToken)

    let status: ZatcaPhase2Status = 'sandbox'
    let zatcaUuid: string | null = null
    let message = 'Sandbox reported (local hash + PIH chain)'

    if (proxy && hasCreds) {
      try {
        const res = await fetch(`${proxy.replace(/\/$/, '')}/report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(process.env.ZATCA_PROXY_SECRET
              ? { 'x-zatca-proxy-secret': process.env.ZATCA_PROXY_SECRET }
              : {}),
          },
          body: JSON.stringify({
            environment: env,
            invoiceUuid: id,
            invoiceHash,
            xml: draftXml,
            signature: signatureB64,
            csid: cfg.zatcaCsid,
            binaryToken: cfg.zatcaBinaryToken,
            pih,
          }),
        })
        const text = await res.text()
        let json: Record<string, unknown> = {}
        try {
          json = JSON.parse(text) as Record<string, unknown>
        } catch {
          /* plain text */
        }
        if (res.ok) {
          status = 'reported'
          zatcaUuid = String(json.uuid ?? json.zatcaUuid ?? randomUUID())
          message = String(json.message ?? `Reported via proxy (${res.status})`)
        } else {
          status = 'failed'
          message = String(json.message ?? (text.slice(0, 240) || `Proxy ${res.status}`))
        }
      } catch (err) {
        status = 'failed'
        message = err instanceof Error ? err.message : 'Proxy unreachable'
      }
    } else if (env === 'production' && !proxy) {
      status = 'failed'
      message =
        'Production Phase 2 requires ZATCA_PROXY_URL (signing/clearance gateway). Credentials stored; invoice not sent.'
    } else {
      // Default sandbox: mark reported locally so POS can show Phase 2 status end-to-end.
      status = 'sandbox'
      zatcaUuid = `sbx-${randomUUID()}`
      message = hasCreds
        ? 'Sandbox reported (credentials on file; set ZATCA_PROXY_URL for live gateway)'
        : 'Sandbox reported (no CSID yet — local simulation)'
    }

    const row = await this.upsertInvoice(companyId, {
      id,
      status,
      totalSar,
      vatSar,
      sellerVat,
      sellerName,
      timestamp,
      tlvBase64,
      invoiceHash,
      zatcaUuid,
      message,
    })

    if (status === 'reported' || status === 'sandbox') {
      await this.prisma.$executeRaw`
        UPDATE "Company" SET "zatcaPih" = ${invoiceHash} WHERE id = ${companyId}
      `
    }

    return row
  }

  private async loadCompanyZatca(companyId: string): Promise<CompanyZatcaRow | null> {
    const rows = await this.prisma.$queryRaw<CompanyZatcaRow[]>`
      SELECT
        "zatcaEnabled",
        "zatcaPhase2Enabled",
        "zatcaPhase2Env",
        "zatcaCsid",
        "zatcaPrivateKey",
        "zatcaBinaryToken",
        "zatcaPih",
        "taxId",
        "companyName"
      FROM "Company"
      WHERE id = ${companyId}
      LIMIT 1
    `
    return rows[0] ?? null
  }

  private async upsertInvoice(
    companyId: string,
    row: {
      id: string
      status: string
      totalSar: number
      vatSar: number
      sellerVat: string
      sellerName: string
      timestamp: string
      tlvBase64: string | null
      invoiceHash: string | null
      zatcaUuid: string | null
      message: string | null
    },
  ) {
    const now = new Date()
    await this.prisma.$executeRaw`
      INSERT INTO "ZatcaInvoice" (
        id, "companyId", status, "totalSar", "vatSar", "sellerVat", "sellerName",
        timestamp, "tlvBase64", "invoiceHash", "zatcaUuid", message, "createdAt", "updatedAt"
      ) VALUES (
        ${row.id}, ${companyId}, ${row.status}, ${row.totalSar}, ${row.vatSar},
        ${row.sellerVat}, ${row.sellerName}, ${row.timestamp}, ${row.tlvBase64},
        ${row.invoiceHash}, ${row.zatcaUuid}, ${row.message}, ${now}, ${now}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        "totalSar" = EXCLUDED."totalSar",
        "vatSar" = EXCLUDED."vatSar",
        "sellerVat" = EXCLUDED."sellerVat",
        "sellerName" = EXCLUDED."sellerName",
        timestamp = EXCLUDED.timestamp,
        "tlvBase64" = EXCLUDED."tlvBase64",
        "invoiceHash" = EXCLUDED."invoiceHash",
        "zatcaUuid" = EXCLUDED."zatcaUuid",
        message = EXCLUDED.message,
        "updatedAt" = EXCLUDED."updatedAt"
    `
    const saved = await this.getInvoice(companyId, row.id)
    if (!saved) throw new BadRequestException('Failed to persist ZATCA invoice')
    return saved
  }

  /** Minimal UBL-like draft for hashing / proxy. Not a full ZATCA XAdES document. */
  private buildSimplifiedXml(input: {
    id: string
    sellerName: string
    sellerVat: string
    timestamp: string
    totalSar: number
    vatSar: number
    pih: string
  }) {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <ID>${esc(input.id)}</ID>
  <UUID>${esc(input.id)}</UUID>
  <IssueDate>${esc(input.timestamp.slice(0, 10))}</IssueDate>
  <IssueTime>${esc(input.timestamp.includes('T') ? input.timestamp.split('T')[1]!.replace(/Z$/, '') : '00:00:00')}</IssueTime>
  <InvoiceTypeCode name="0200000">388</InvoiceTypeCode>
  <DocumentCurrencyCode>SAR</DocumentCurrencyCode>
  <AdditionalDocumentReference>
    <ID>PIH</ID>
    <Attachment><EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(input.pih)}</EmbeddedDocumentBinaryObject></Attachment>
  </AdditionalDocumentReference>
  <AccountingSupplierParty>
    <Party>
      <PartyTaxScheme><CompanyID>${esc(input.sellerVat)}</CompanyID><TaxScheme><ID>VAT</ID></TaxScheme></PartyTaxScheme>
      <PartyLegalEntity><RegistrationName>${esc(input.sellerName)}</RegistrationName></PartyLegalEntity>
    </Party>
  </AccountingSupplierParty>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount currencyID="SAR">${(input.totalSar - input.vatSar).toFixed(2)}</TaxExclusiveAmount>
    <TaxInclusiveAmount currencyID="SAR">${input.totalSar.toFixed(2)}</TaxInclusiveAmount>
    <PayableAmount currencyID="SAR">${input.totalSar.toFixed(2)}</PayableAmount>
  </LegalMonetaryTotal>
  <TaxTotal>
    <TaxAmount currencyID="SAR">${input.vatSar.toFixed(2)}</TaxAmount>
  </TaxTotal>
</Invoice>`
  }
}
