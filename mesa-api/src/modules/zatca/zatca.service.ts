import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { createHash, randomUUID } from 'crypto'
import { InjectPrisma, PrismaService } from '../../prisma.service'
import {
  mapUiEnvToFatoora,
  probeFatoora,
  reportInvoice,
  requestComplianceCsid,
  requestProductionCsid,
  submitComplianceInvoice,
  type FatooraEnv,
} from './fatoora.client'
import {
  allowLocalZatcaSandbox,
  isZatcaProxyConfigured,
  proxyHealth,
  proxyReport,
} from './zatca-proxy.client'
import {
  binaryTokenToPem,
  buildSimplifiedInvoiceXml,
  certVatNumber,
  generateZatcaCsr,
  signSimplifiedInvoice,
  splitTimestamp,
  toZatcaUuid,
} from './zatca-crypto'

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
  zatcaSecret?: string | null
  zatcaComplianceRequestId?: string | null
  zatcaCsidKind?: string | null
  zatcaPih?: string | null
  zatcaIcv?: number | null
  taxId?: string | null
  companyName?: string
}

type InvoiceRow = {
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
  qrPhase2Base64: string | null
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class ZatcaService {
  private readonly log = new Logger(ZatcaService.name)
  private colsReady = false

  constructor(@InjectPrisma() private readonly prisma: PrismaService) {}

  async getConfig(companyId: string) {
    await this.ensureColumns()
    const row = await this.loadCompanyZatca(companyId)
    if (!row) throw new BadRequestException('Company not found')
    const env = mapUiEnvToFatoora(row.zatcaPhase2Env || 'sandbox')
    const probe = await probeFatoora(env)
    const proxy = isZatcaProxyConfigured() ? await proxyHealth() : null
    const hasCreds = Boolean(
      row.zatcaBinaryToken?.trim() && row.zatcaSecret?.trim() && row.zatcaPrivateKey?.trim(),
    )
    return {
      zatcaEnabled: row.zatcaEnabled === true,
      phase2Enabled: row.zatcaPhase2Enabled === true,
      environment: env,
      mode: proxy?.configured ? 'proxy' : 'fatoora',
      hasCsid: Boolean(row.zatcaCsid?.trim() || row.zatcaBinaryToken?.trim()),
      hasPrivateKey: Boolean(row.zatcaPrivateKey?.trim()),
      hasBinaryToken: Boolean(row.zatcaBinaryToken?.trim()),
      hasSecret: Boolean(row.zatcaSecret?.trim()),
      csidKind: row.zatcaCsidKind ?? null,
      complianceRequestId: row.zatcaComplianceRequestId ?? null,
      pih: row.zatcaPih ?? null,
      icv: row.zatcaIcv ?? 0,
      sellerVat: row.taxId ?? null,
      sellerName: row.companyName ?? null,
      proxyConfigured: Boolean(proxy?.configured),
      proxyReachable: Boolean(proxy?.reachable),
      proxyName: proxy?.name ?? null,
      proxyVersion: proxy?.version ?? null,
      proxyMessage: proxy?.message ?? null,
      fatooraReachable: probe.reachable,
      fatooraBase: probe.base,
      fatooraMessage: probe.message,
      allowLocalSandbox: allowLocalZatcaSandbox(),
      gatewayReady: hasCreds && (probe.reachable || Boolean(proxy?.reachable)),
    }
  }

  async putConfig(companyId: string, body: Record<string, unknown>) {
    await this.ensureColumns()
    const existing = await this.loadCompanyZatca(companyId)
    if (!existing) throw new BadRequestException('Company not found')

    const phase2Enabled =
      body.phase2Enabled === undefined
        ? Boolean(existing.zatcaPhase2Enabled)
        : body.phase2Enabled === true
    const environment = mapUiEnvToFatoora(String(body.environment ?? existing.zatcaPhase2Env ?? 'sandbox'))

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
    const secret =
      body.secret === undefined
        ? existing.zatcaSecret
        : body.secret
          ? String(body.secret)
          : null

    if (environment !== mapUiEnvToFatoora(existing.zatcaPhase2Env || 'sandbox')) {
      // Each Fatoora environment keeps its own invoice chain (PIH / ICV).
      await this.prisma.$executeRaw`
        UPDATE "Company" SET "zatcaPih" = NULL, "zatcaIcv" = 0 WHERE id = ${companyId}
      `
    }
    await this.prisma.$executeRaw`
      UPDATE "Company" SET
        "zatcaPhase2Enabled" = ${phase2Enabled},
        "zatcaPhase2Env" = ${environment},
        "zatcaCsid" = ${csid},
        "zatcaPrivateKey" = ${privateKey},
        "zatcaBinaryToken" = ${binaryToken},
        "zatcaSecret" = ${secret}
      WHERE id = ${companyId}
    `
    return this.getConfig(companyId)
  }

  async getProxyStatus() {
    const probe = await probeFatoora('sandbox')
    const proxy = isZatcaProxyConfigured() ? await proxyHealth() : null
    return {
      mode: proxy?.configured ? 'proxy' : 'fatoora',
      configured: true,
      reachable: probe.reachable || Boolean(proxy?.reachable),
      name: proxy?.name ?? 'ZATCA Fatoora',
      version: proxy?.version ?? null,
      message: proxy?.configured
        ? proxy.message
        : probe.message,
      fatooraBase: probe.base,
    }
  }

  /**
   * Zoho-style: OTP from Fatoora + server-generated CSR → Compliance CSID.
   * Optional body.csrPem / body.privateKeyPem to reuse an existing keypair.
   */
  async onboardCsr(companyId: string, body: Record<string, unknown>) {
    await this.ensureColumns()
    const cfg = await this.loadCompanyZatca(companyId)
    if (!cfg) throw new BadRequestException('Company not found')
    const otp = String(body.otp || '').trim()
    if (!otp) throw new BadRequestException('OTP from Fatoora portal is required')

    // The OTP belongs to the portal the user picked on screen, which may not be saved yet.
    if (body.environment !== undefined) {
      const picked = mapUiEnvToFatoora(String(body.environment))
      if (picked !== this.fatooraEnv(cfg)) {
        // Each Fatoora environment keeps its own invoice chain (PIH / ICV).
        await this.prisma.$executeRaw`
          UPDATE "Company" SET "zatcaPhase2Env" = ${picked}, "zatcaPih" = NULL, "zatcaIcv" = 0
          WHERE id = ${companyId}
        `
        cfg.zatcaPhase2Env = picked
        cfg.zatcaPih = null
        cfg.zatcaIcv = 0
      }
    }

    const env = this.fatooraEnv(cfg)
    let privateKeyPem = body.privateKeyPem ? String(body.privateKeyPem) : ''
    let csrBase64 = ''

    if (body.csrPem || body.csrBase64) {
      const pem = body.csrPem ? String(body.csrPem) : ''
      csrBase64 = body.csrBase64
        ? String(body.csrBase64)
        : Buffer.from(
            pem.replace(/-----BEGIN[^-]+-----/g, '').replace(/-----END[^-]+-----/g, '').replace(/\s+/g, ''),
            'base64',
          ).toString('base64')
      if (!privateKeyPem && cfg.zatcaPrivateKey) privateKeyPem = cfg.zatcaPrivateKey
    } else {
      const generated = generateZatcaCsr({
        vatNumber: String(body.vatNumber || cfg.taxId || ''),
        companyName: String(body.commonName || cfg.companyName || 'Company'),
        branchName: body.branchName ? String(body.branchName) : undefined,
        solutionName: 'MESA-POS',
        invoiceType: '0100',
        industry: 'Restaurant',
        // Picks TSTZATCA / PREZATCA / ZATCA-Code-Signing template per environment
        environment: env,
      })
      privateKeyPem = generated.privateKeyPem
      csrBase64 = generated.csrBase64
    }

    if (!csrBase64) throw new BadRequestException('CSR generation failed')

    const result = await requestComplianceCsid({ env, otp, csrBase64 })
    if (!result.ok || !result.binarySecurityToken || !result.secret) {
      return { ok: false, message: result.message, config: await this.getConfig(companyId) }
    }

    const certPem =
      binaryTokenToPem(result.binarySecurityToken) || result.binarySecurityToken

    await this.prisma.$executeRaw`
      UPDATE "Company" SET
        "zatcaPrivateKey" = ${privateKeyPem || cfg.zatcaPrivateKey || null},
        "zatcaBinaryToken" = ${result.binarySecurityToken},
        "zatcaSecret" = ${result.secret},
        "zatcaCsid" = ${certPem},
        "zatcaComplianceRequestId" = ${result.requestId ?? null},
        "zatcaCsidKind" = ${'compliance'},
        "zatcaPhase2Enabled" = true
      WHERE id = ${companyId}
    `

    return {
      ok: true,
      message: result.message,
      requestId: result.requestId,
      config: await this.getConfig(companyId),
    }
  }

  /** Submit a simplified sample invoice to /compliance/invoices */
  async runComplianceCheck(companyId: string, _body: Record<string, unknown> = {}) {
    await this.ensureColumns()
    const cfg = await this.loadCompanyZatca(companyId)
    if (!cfg) throw new BadRequestException('Company not found')
    if (!cfg.zatcaBinaryToken || !cfg.zatcaSecret || !cfg.zatcaPrivateKey) {
      throw new BadRequestException('Complete OTP onboarding first (CSID + secret + private key)')
    }

    const env = this.fatooraEnv(cfg)
    const built = this.buildSignedDraft(cfg, {
      invoiceUuid: randomUUID(),
      totalSar: 115,
      vatSar: 15,
      sellerVat: cfg.taxId || '',
      sellerName: cfg.companyName || 'Seller',
      timestamp: new Date().toISOString(),
    })

    const result = await submitComplianceInvoice({
      env,
      binaryToken: cfg.zatcaBinaryToken,
      secret: cfg.zatcaSecret,
      invoiceHash: built.invoiceHash,
      uuid: built.uuid,
      invoiceBase64: built.invoiceBase64,
    })

    return {
      ok: result.ok,
      message: result.message,
      config: await this.getConfig(companyId),
    }
  }

  async onboardProduction(companyId: string) {
    await this.ensureColumns()
    const cfg = await this.loadCompanyZatca(companyId)
    if (!cfg) throw new BadRequestException('Company not found')
    if (!cfg.zatcaBinaryToken || !cfg.zatcaSecret) {
      throw new BadRequestException('Compliance CSID required before production exchange')
    }
    if (!cfg.zatcaComplianceRequestId) {
      throw new BadRequestException('Missing compliance request id — re-run OTP onboarding')
    }

    // A CSID is only valid in the environment that issued it — request the production
    // CSID from the same Fatoora environment used for the compliance CSID.
    const env: FatooraEnv = this.fatooraEnv(cfg)

    const result = await requestProductionCsid({
      env,
      binaryToken: cfg.zatcaBinaryToken,
      secret: cfg.zatcaSecret,
      complianceRequestId: cfg.zatcaComplianceRequestId,
    })

    if (!result.ok || !result.binarySecurityToken || !result.secret) {
      return { ok: false, message: result.message, config: await this.getConfig(companyId) }
    }

    const certPem =
      binaryTokenToPem(result.binarySecurityToken) || result.binarySecurityToken

    await this.prisma.$executeRaw`
      UPDATE "Company" SET
        "zatcaBinaryToken" = ${result.binarySecurityToken},
        "zatcaSecret" = ${result.secret},
        "zatcaCsid" = ${certPem},
        "zatcaCsidKind" = ${'production'}
      WHERE id = ${companyId}
    `

    return {
      ok: true,
      message: result.message,
      config: await this.getConfig(companyId),
    }
  }

  /** @deprecated path kept for API compatibility — maps to compliance check */
  async runCompliance(companyId: string, body: Record<string, unknown>) {
    return this.runComplianceCheck(companyId, body)
  }

  /** @deprecated — use onboardCsr with OTP */
  async onboardCsid(companyId: string, body: Record<string, unknown>) {
    return this.onboardProduction(companyId)
  }

  async getInvoice(companyId: string, id: string) {
    await this.ensureColumns()
    const rows = await this.prisma.$queryRaw<InvoiceRow[]>`
      SELECT * FROM "ZatcaInvoice"
      WHERE id = ${id} AND "companyId" = ${companyId}
      LIMIT 1
    `
    return rows[0] ?? null
  }

  async listInvoices(companyId: string, take = 50) {
    await this.ensureColumns()
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
        qrPhase2Base64: string | null
        updatedAt: Date
      }>
    >`
      SELECT id, status, "totalSar", "vatSar", "sellerVat", timestamp, "zatcaUuid", message,
             "qrPhase2Base64", "updatedAt"
      FROM "ZatcaInvoice"
      WHERE "companyId" = ${companyId}
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `
  }

  async submitInvoice(companyId: string, body: Record<string, unknown>) {
    await this.ensureColumns()
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
        qrPhase2Base64: null,
        message: 'Phase 2 disabled — draft stored',
      })
    }

    const totalSar = Number(body.totalSar ?? 0)
    const vatSar = Number(body.vatSar ?? 0)
    const sellerVat = String(body.sellerVat || cfg.taxId || '').replace(/\D/g, '')
    const sellerName = String(body.sellerName || cfg.companyName || 'Seller')
    const timestamp = String(body.timestamp || new Date().toISOString())
    const tlvBase64 = body.tlvBase64 ? String(body.tlvBase64) : null

    let status: ZatcaPhase2Status = 'failed'
    let zatcaUuid: string | null = null
    let message = 'Phase 2 report not sent'
    let qrPhase2Base64: string | null = null
    let finalHash: string | null = null

    const hasFatooraCreds = Boolean(
      cfg.zatcaBinaryToken?.trim() &&
        cfg.zatcaSecret?.trim() &&
        cfg.zatcaPrivateKey?.trim(),
    )

    // Optional third-party proxy escape hatch
    if (isZatcaProxyConfigured() && cfg.zatcaCsid && cfg.zatcaBinaryToken) {
      const pih = cfg.zatcaPih || createHash('sha256').update('0').digest('base64')
      const built = this.buildSignedDraft(cfg, {
        invoiceUuid: id,
        totalSar,
        vatSar,
        sellerVat,
        sellerName,
        timestamp,
      })
      const reported = await proxyReport({
        environment: cfg.zatcaPhase2Env === 'production' ? 'production' : 'sandbox',
        invoiceUuid: id,
        invoiceHash: built.invoiceHash,
        xml: built.xml,
        signature: built.signatureB64,
        csid: String(cfg.zatcaCsid),
        binaryToken: String(cfg.zatcaBinaryToken),
        pih,
      })
      if (reported.ok) {
        status = cfg.zatcaPhase2Env === 'production' ? 'reported' : 'sandbox'
        zatcaUuid = reported.uuid ?? id
        message = reported.message
        finalHash = reported.invoiceHash || built.invoiceHash
        qrPhase2Base64 = reported.qrTlvBase64 ?? built.qrTlvBase64
      } else {
        status = 'failed'
        message = reported.message
        finalHash = built.invoiceHash
        qrPhase2Base64 = built.qrTlvBase64
      }
    } else if (hasFatooraCreds) {
      const env = this.fatooraEnv(cfg)
      // Fatoora rejects invoices whose seller VAT differs from the CSID certificate.
      // The developer sandbox always issues its fixed test certificate (VAT 399999999900003),
      // so use the certificate VAT there; simulation and production certify the real VAT,
      // so a mismatch is a real error.
      const certVat = cfg.zatcaCsid ? certVatNumber(String(cfg.zatcaCsid)) : null
      let xmlSellerVat = sellerVat
      let vatNote = ''
      if (certVat && certVat !== sellerVat) {
        if (env !== 'sandbox') {
          const row = await this.upsertInvoice(companyId, {
            id,
            status: 'failed',
            totalSar,
            vatSar,
            sellerVat,
            sellerName,
            timestamp,
            tlvBase64,
            invoiceHash: null,
            zatcaUuid: null,
            qrPhase2Base64: null,
            message: `Company VAT ${sellerVat} does not match the ${env} CSID certificate VAT ${certVat}. Fix the VAT on the company profile or re-run OTP onboarding with the correct VAT.`,
          })
          return row
        }
        xmlSellerVat = certVat
        vatNote = ` (test certificate VAT ${certVat} used instead of ${sellerVat} — ${env} only)`
      }

      const built = this.buildSignedDraft(cfg, {
        invoiceUuid: id,
        totalSar,
        vatSar,
        sellerVat: xmlSellerVat,
        sellerName,
        timestamp,
      })
      finalHash = built.invoiceHash
      qrPhase2Base64 = built.qrTlvBase64

      const reported = await reportInvoice({
        env,
        binaryToken: String(cfg.zatcaBinaryToken),
        secret: String(cfg.zatcaSecret),
        invoiceHash: built.invoiceHash,
        uuid: built.uuid,
        invoiceBase64: built.invoiceBase64,
      })

      if (reported.ok) {
        status = env === 'production' ? 'reported' : 'sandbox'
        zatcaUuid = reported.uuid ?? id
        message = reported.message + vatNote
        await this.bumpIcv(companyId, cfg)
      } else {
        status = 'failed'
        message = reported.message + vatNote
      }
    } else if (allowLocalZatcaSandbox() && (cfg.zatcaPhase2Env || 'sandbox') !== 'production') {
      status = 'sandbox'
      zatcaUuid = `sbx-${randomUUID()}`
      message =
        'Local sandbox simulation (ZATCA_ALLOW_LOCAL_SANDBOX=1) — complete Fatoora OTP onboarding for real reporting'
    } else {
      status = 'failed'
      message =
        'Complete Fatoora onboarding: OTP → Generate CSID in Company Details (direct Fatoora mode)'
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
      invoiceHash: finalHash,
      zatcaUuid,
      qrPhase2Base64,
      message,
    })

    if ((status === 'reported' || status === 'sandbox') && finalHash) {
      await this.prisma.$executeRaw`
        UPDATE "Company" SET "zatcaPih" = ${finalHash} WHERE id = ${companyId}
      `
    }

    return row
  }

  private fatooraEnv(cfg: CompanyZatcaRow): FatooraEnv {
    return mapUiEnvToFatoora(cfg.zatcaPhase2Env || 'sandbox')
  }

  private buildSignedDraft(
    cfg: CompanyZatcaRow,
    body: {
      invoiceUuid: string
      totalSar: number
      vatSar: number
      sellerVat: string
      sellerName: string
      timestamp: string
    },
  ) {
    // POS ids are not RFC-4122 UUIDs; ZATCA rejects them ("UUID format … not valid").
    const uuid = toZatcaUuid(body.invoiceUuid || randomUUID())
    const sellerVat = body.sellerVat.replace(/\D/g, '') || String(cfg.taxId || '').replace(/\D/g, '')
    const sellerName = body.sellerName || cfg.companyName || 'Seller'
    const { issueDate, issueTime } = splitTimestamp(body.timestamp)
    const pih = cfg.zatcaPih || createHash('sha256').update('0').digest('base64')
    const icv = (cfg.zatcaIcv ?? 0) + 1
    const unsigned = buildSimplifiedInvoiceXml({
      uuid,
      invoiceNumber: `MESA-${icv}`,
      issueDate,
      issueTime,
      sellerName,
      sellerVat,
      totalSar: body.totalSar,
      vatSar: body.vatSar,
      pih,
      icv,
    })
    if (!cfg.zatcaPrivateKey) {
      throw new BadRequestException('Private key missing — re-run OTP onboarding')
    }
    const signed = signSimplifiedInvoice({
      unsignedXml: unsigned,
      privateKeyPem: cfg.zatcaPrivateKey,
      sellerName,
      sellerVat,
      timestampIso: body.timestamp,
      totalSar: body.totalSar,
      vatSar: body.vatSar,
      certificatePem: cfg.zatcaCsid,
    })
    return { ...signed, uuid, icv }
  }

  private async bumpIcv(companyId: string, cfg: CompanyZatcaRow) {
    const next = (cfg.zatcaIcv ?? 0) + 1
    await this.prisma.$executeRaw`
      UPDATE "Company" SET "zatcaIcv" = ${next} WHERE id = ${companyId}
    `
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
        "zatcaSecret",
        "zatcaComplianceRequestId",
        "zatcaCsidKind",
        "zatcaPih",
        "zatcaIcv",
        "taxId",
        "companyName"
      FROM "Company"
      WHERE id = ${companyId}
      LIMIT 1
    `
    return rows[0] ?? null
  }

  private async ensureColumns() {
    if (this.colsReady) return
    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "ZatcaInvoice" ADD COLUMN IF NOT EXISTS "qrPhase2Base64" TEXT`,
      )
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaSecret" TEXT`,
      )
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaComplianceRequestId" TEXT`,
      )
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaCsidKind" TEXT`,
      )
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaIcv" INTEGER NOT NULL DEFAULT 0`,
      )
    } catch (err) {
      this.log.warn(`ZATCA column ensure: ${err instanceof Error ? err.message : err}`)
    }
    this.colsReady = true
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
      qrPhase2Base64: string | null
      message: string | null
    },
  ) {
    const now = new Date()
    await this.prisma.$executeRaw`
      INSERT INTO "ZatcaInvoice" (
        id, "companyId", status, "totalSar", "vatSar", "sellerVat", "sellerName",
        timestamp, "tlvBase64", "invoiceHash", "zatcaUuid", "qrPhase2Base64", message,
        "createdAt", "updatedAt"
      ) VALUES (
        ${row.id}, ${companyId}, ${row.status}, ${row.totalSar}, ${row.vatSar},
        ${row.sellerVat}, ${row.sellerName}, ${row.timestamp}, ${row.tlvBase64},
        ${row.invoiceHash}, ${row.zatcaUuid}, ${row.qrPhase2Base64}, ${row.message},
        ${now}, ${now}
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
        "qrPhase2Base64" = EXCLUDED."qrPhase2Base64",
        message = EXCLUDED.message,
        "updatedAt" = EXCLUDED."updatedAt"
    `
    const saved = await this.getInvoice(companyId, row.id)
    if (!saved) throw new BadRequestException('Failed to persist ZATCA invoice')
    return saved
  }
}
