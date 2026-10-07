/**
 * ZATCA CSR generation + simplified tax invoice XML / hash / ECDSA stamp helpers.
 * First release: simplified (B2C) invoices for POS settle reporting.
 *
 * ZATCA rules implemented here:
 *  - EGS key pair MUST be ECDSA on curve secp256k1 (RSA is rejected by Fatoora).
 *  - CSR carries subject (C/OU/O/CN) + subjectAltName directoryName with
 *    SN (EGS serial 1-..|2-..|3-..), UID (VAT), title (invoice type), registeredAddress,
 *    businessCategory, plus the certificate template name extension
 *    (TSTZATCA / PREZATCA / ZATCA-Code-Signing depending on environment).
 *  - Fatoora /compliance expects the `csr` field as Base64 of the full PEM text.
 *  - Invoice hash: SHA-256 over the C14N11 form of the invoice with UBLExtensions,
 *    cac:Signature and the QR AdditionalDocumentReference removed. We build the XML
 *    already in canonical form and splice those blocks in with no surrounding
 *    whitespace, so the server-side strip reproduces our hashed skeleton exactly.
 *  - Digital signature (KSA-15): ECDSA-SHA256 over the raw invoice-hash bytes.
 *  - QR (BR-KSA-27): TLV tags 1-5 + 6 (hash) 7 (signature) 8 (raw public key DER)
 *    9 (raw certificate signature bytes).
 */
import {
  createHash,
  createPrivateKey,
  createSign,
  generateKeyPairSync,
  randomUUID,
  X509Certificate,
} from 'crypto'
import * as rs from 'jsrsasign'

// jsrsasign lacks these ZATCA SAN directoryName attribute names out of the box.
try {
  rs.KJUR.asn1.x509.OID.registerOIDs({
    registeredAddress: '2.5.4.26',
    title: '2.5.4.12',
  })
} catch {
  /* already registered / older jsrsasign */
}

export type ZatcaCsrEnvironment = 'sandbox' | 'simulation' | 'production'

const CSR_TEMPLATE_NAMES: Record<ZatcaCsrEnvironment, string> = {
  sandbox: 'TSTZATCA-Code-Signing',
  simulation: 'PREZATCA-Code-Signing',
  production: 'ZATCA-Code-Signing',
}

export type CsrProfile = {
  vatNumber: string
  companyName: string
  branchName?: string
  /** EGS solution name fragment */
  solutionName?: string
  /** 0100 = simplified only (POS default) */
  invoiceType?: string
  locationAddress?: string
  industry?: string
  /** Stable device / EGS unit id */
  egSSerial?: string
  /** Picks the ZATCA certificate template name (default sandbox) */
  environment?: ZatcaCsrEnvironment
}

export type GeneratedCsr = {
  privateKeyPem: string
  csrPem: string
  csrBase64: string
  commonName: string
  serialNumber: string
}

/** Escape text content the way C14N does (& < > only — quotes stay literal). */
function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Strip characters that would corrupt a jsrsasign DN string. */
function cleanDn(value: string, max = 100): string {
  return value.replace(/[/\\=,+<>#;"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Generate ECDSA secp256k1 key + ZATCA-compliant CSR (PEM + Base64 of PEM). */
export function generateZatcaCsr(profile: CsrProfile): GeneratedCsr {
  const vat = profile.vatNumber.replace(/\D/g, '')
  if (vat.length < 10) throw new Error('VAT / tax ID must be at least 10 digits')

  const env: ZatcaCsrEnvironment = profile.environment ?? 'sandbox'
  const solution = (profile.solutionName || 'MESA-POS').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) || 'MESA-POS'
  const egSerial =
    profile.egSSerial?.trim() ||
    `1-${solution}|2-${vat.slice(-6)}|3-${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const commonName = `${solution}-${vat}`
  const org = cleanDn(profile.companyName || 'Company', 120)
  const ou = cleanDn(profile.branchName || 'Main Branch', 120)
  const invoiceType = (profile.invoiceType || '0100').replace(/\D/g, '').padEnd(4, '0').slice(0, 4)
  const location = cleanDn(profile.locationAddress || 'Riyadh', 100)
  const industry = cleanDn(profile.industry || 'Restaurant', 100)

  // ZATCA mandates ECDSA on secp256k1 for EGS units.
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' })
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

  const subjectStr = `/C=SA/OU=${ou}/O=${org}/CN=${cleanDn(commonName, 64)}`
  const sanDnStr =
    `/SN=${cleanDn(egSerial, 120)}/UID=${vat}/title=${invoiceType}` +
    `/registeredAddress=${location}/businessCategory=${industry}`

  const csrParams = {
    subject: { str: subjectStr },
    sbjpubkey: publicKeyPem,
    extreq: [
      // Certificate template name — required by ZATCA CA to pick the right profile.
      { extname: '1.3.6.1.4.1.311.20.2', extn: { utf8str: { str: CSR_TEMPLATE_NAMES[env] } } },
      { extname: 'subjectAltName', array: [{ dn: { str: sanDnStr } }] },
    ],
    sigalg: 'SHA256withECDSA',
    sbjprvkey: privateKeyPem,
  }

  let csrPem: string
  try {
    csrPem = new rs.KJUR.asn1.csr.CertificationRequest(csrParams as never).getPEM()
  } catch {
    // Fallback without the template extension if the generic-extension encoding fails.
    csrPem = new rs.KJUR.asn1.csr.CertificationRequest({
      ...csrParams,
      extreq: [{ extname: 'subjectAltName', array: [{ dn: { str: sanDnStr } }] }],
    } as never).getPEM()
  }

  // Fatoora expects the `csr` field as Base64 of the full PEM text (headers included).
  const csrBase64 = Buffer.from(csrPem, 'utf8').toString('base64')

  return {
    privateKeyPem,
    csrPem,
    csrBase64,
    commonName,
    serialNumber: egSerial,
  }
}

export type SimplifiedInvoiceInput = {
  uuid: string
  /** Human invoice id / ICV string */
  invoiceNumber: string
  issueDate: string
  issueTime: string
  sellerName: string
  sellerVat: string
  /** Optional CRN */
  sellerCrn?: string
  totalSar: number
  vatSar: number
  /** Previous invoice hash (PIH) */
  pih: string
  /** ICV counter */
  icv: number
  lineName?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
/** Fixed namespace for deriving ZATCA UUIDs from POS invoice ids (uuid v5). */
const ZATCA_UUID_NS = Buffer.from('6f1a3b2e9c4d4e8fa1b2c3d4e5f60718', 'hex')

/**
 * ZATCA requires cbc:UUID and the API body `uuid` to be a real RFC-4122 UUID.
 * POS invoice ids look like `inv-dine:br-…:t1__…`, so derive a deterministic
 * v5 UUID from them (same id → same UUID, so retries do not create duplicates).
 */
export function toZatcaUuid(invoiceId: string): string {
  const id = String(invoiceId || '').trim()
  if (UUID_RE.test(id)) return id.toLowerCase()
  const h = createHash('sha1').update(ZATCA_UUID_NS).update(id, 'utf8').digest()
  h[6] = (h[6] & 0x0f) | 0x50 // version 5
  h[8] = (h[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = h.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

type VatBreakdown = {
  /** Standard-rated (S, 15%) portion — null when the sale carries no VAT */
  standard: { taxable: number; tax: number } | null
  /** Portion not subject to VAT (category O) — items sold with tax disabled */
  outOfScope: number
  exclusive: number
}

/**
 * The POS only sends total + VAT. Restaurants may sell some items with tax
 * disabled, so VAT ≠ 15% of the exclusive amount. ZATCA checks that each VAT
 * category's tax equals taxable × rate (BR-S-08 / BR-CO-17), so split the sale
 * into a standard-rated subtotal (taxable = VAT / 15%) and an out-of-scope
 * remainder (category O, VATEX-SA-OOS) instead of declaring one wrong 15% line.
 */
function vatBreakdown(totalSar: number, vatSar: number): VatBreakdown {
  const total = r2(totalSar)
  const vat = Math.max(0, r2(vatSar))
  const exclusive = r2(Math.max(0, total - vat))
  if (vat <= 0) return { standard: null, outOfScope: exclusive, exclusive }
  const taxableS = r2(vat / 0.15)
  // Rounding noise (≤ 0.02) or an over-taxed sale → everything is standard-rated
  if (taxableS >= exclusive || Math.abs(taxableS - exclusive) <= 0.02) {
    return { standard: { taxable: exclusive, tax: vat }, outOfScope: 0, exclusive }
  }
  return {
    standard: { taxable: taxableS, tax: vat },
    outOfScope: r2(exclusive - taxableS),
    exclusive,
  }
}

const OOS_REASON = `<cbc:TaxExemptionReasonCode>VATEX-SA-OOS</cbc:TaxExemptionReasonCode>
        <cbc:TaxExemptionReason>Not subject to VAT</cbc:TaxExemptionReason>`

function taxSubtotalXml(category: 'S' | 'O', taxable: number, tax: number): string {
  const percent = category === 'S' ? '15.00' : '0.00'
  return `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${taxable.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${tax.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${category}</cbc:ID>
        <cbc:Percent>${percent}</cbc:Percent>${category === 'O' ? `\n        ${OOS_REASON}` : ''}
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
}

function invoiceLineXml(
  lineId: number,
  category: 'S' | 'O',
  name: string,
  amount: number,
  tax: number,
): string {
  const percent = category === 'S' ? '15.00' : '0.00'
  return `
  <cac:InvoiceLine>
    <cbc:ID>${lineId}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${amount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${tax.toFixed(2)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="SAR">${r2(amount + tax).toFixed(2)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${name}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${category}</cbc:ID>
        <cbc:Percent>${percent}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${amount.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`
}

type InvoiceParts = {
  /** <ext:UBLExtensions>…</ext:UBLExtensions> block, spliced right after the root tag */
  extensions?: string
  /** QR AdditionalDocumentReference block, spliced right after the PIH block */
  qrReference?: string
  /** cac:Signature block, spliced right after the QR block */
  signature?: string
}

/**
 * Render the simplified tax invoice. The base skeleton (no parts) is what gets
 * hashed; parts are inserted with NO surrounding whitespace so ZATCA's removal
 * transform reproduces the skeleton byte-for-byte before canonicalization.
 * The skeleton itself is written in C14N11-canonical form (single-line root tag,
 * sorted namespaces, no self-closing tags, text escaping limited to & < >).
 */
function renderSimplifiedInvoice(input: SimplifiedInvoiceInput, parts: InvoiceParts = {}): string {
  const vat = input.sellerVat.replace(/\D/g, '')
  const bd = vatBreakdown(input.totalSar, input.vatSar)
  const exclusive = bd.exclusive
  const totalVat = bd.standard?.tax ?? 0
  const total = r2(exclusive + totalVat)
  const lineName = escXml(input.lineName || 'POS Sale')
  const sellerIdScheme = input.sellerCrn ? 'CRN' : 'OTH'
  const sellerIdValue = input.sellerCrn || `MESA-${vat}`
  const ext = parts.extensions ?? ''
  const qr = parts.qrReference ?? ''
  const sig = parts.signature ?? ''
  const subtotals =
    (bd.standard ? taxSubtotalXml('S', bd.standard.taxable, bd.standard.tax) : '') +
    (bd.outOfScope > 0 || !bd.standard ? taxSubtotalXml('O', bd.outOfScope, 0) : '')
  let lineNo = 0
  const lines =
    (bd.standard
      ? invoiceLineXml(++lineNo, 'S', lineName, bd.standard.taxable, bd.standard.tax)
      : '') +
    (bd.outOfScope > 0 || !bd.standard
      ? invoiceLineXml(
          ++lineNo,
          'O',
          bd.standard ? `${lineName} (not subject to VAT)` : lineName,
          bd.outOfScope,
          0,
        )
      : '')
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">${ext}
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escXml(input.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${escXml(input.uuid)}</cbc:UUID>
  <cbc:IssueDate>${escXml(input.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${escXml(input.issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${input.icv}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escXml(input.pih)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>${qr}${sig}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${sellerIdScheme}">${escXml(sellerIdValue)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>Main</cbc:StreetName>
        <cbc:BuildingNumber>0000</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>District</cbc:CitySubdivisionName>
        <cbc:CityName>Riyadh</cbc:CityName>
        <cbc:PostalZone>00000</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escXml(vat)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escXml(input.sellerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${totalVat.toFixed(2)}</cbc:TaxAmount>${subtotals}
  </cac:TaxTotal>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${totalVat.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${exclusive.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${exclusive.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>`
}

/** Minimal simplified tax invoice UBL (unsigned body used for hashing). */
export function buildSimplifiedInvoiceXml(input: SimplifiedInvoiceInput): string {
  return renderSimplifiedInvoice(input)
}

/**
 * ZATCA invoice hash: SHA-256 of the canonical XML (everything from `<Invoice`
 * onward — the XML declaration is excluded by C14N) → Base64.
 */
export function hashInvoiceXml(xml: string): string {
  const start = xml.indexOf('<Invoice')
  const body = start > 0 ? xml.slice(start) : xml
  return createHash('sha256').update(Buffer.from(body.trimEnd(), 'utf8')).digest('base64')
}

function tlv(tag: number, value: string | Buffer): Buffer {
  const buf = typeof value === 'string' ? Buffer.from(value, 'utf8') : value
  if (buf.length > 255) throw new Error(`TLV tag ${tag} too long`)
  return Buffer.concat([Buffer.from([tag, buf.length]), buf])
}

/**
 * Phase 1 tags 1–5 (+ optional Phase 2 tags 6–9).
 * Tags 6/7 carry Base64 strings; tags 8/9 carry raw DER bytes per ZATCA QR spec.
 * Oversized optional tags are skipped (TLV length is a single byte, max 255) so a
 * legacy RSA key degrades to a Phase 1 QR instead of crashing the submit.
 */
export function buildPhase2TlvBase64(input: {
  sellerName: string
  sellerVat: string
  timestamp: string
  totalSar: number
  vatSar: number
  invoiceHash?: string
  ecdsaSignature?: string
  publicKey?: string | Buffer
  stampSignature?: string | Buffer
}): string {
  const parts = [
    tlv(1, input.sellerName.trim() || 'Seller'),
    tlv(2, input.sellerVat.replace(/\D/g, '')),
    tlv(3, input.timestamp),
    tlv(4, Number(input.totalSar).toFixed(2)),
    tlv(5, Number(input.vatSar).toFixed(2)),
  ]
  const optional: Array<[number, string | Buffer | undefined]> = [
    [6, input.invoiceHash],
    [7, input.ecdsaSignature],
    [8, input.publicKey],
    [9, input.stampSignature],
  ]
  for (const [tag, value] of optional) {
    if (value == null) continue
    const buf = typeof value === 'string' ? Buffer.from(value, 'utf8') : value
    if (!buf.length || buf.length > 255) continue
    parts.push(Buffer.concat([Buffer.from([tag, buf.length]), buf]))
  }
  return Buffer.concat(parts).toString('base64')
}

type CertInfo = {
  /** Base64 certificate body (no PEM headers) */
  bodyB64: string
  /** ZATCA cert digest: base64 of the HEX sha256 of the body string */
  hashB64: string
  issuer: string
  serialDecimal: string
  publicKeyDer: Buffer
  signatureRaw: Buffer | undefined
}

function parseCertInfo(certPem: string): CertInfo | null {
  try {
    const bodyB64 = certPem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '')
    const x = new X509Certificate(certPem)
    // ZATCA SDK quirk: digest = base64( hex( sha256(certificate body string) ) )
    const hashB64 = Buffer.from(
      createHash('sha256').update(bodyB64).digest('hex'),
      'utf8',
    ).toString('base64')
    const issuer = x.issuer.split('\n').reverse().join(', ')
    const serialDecimal = BigInt(`0x${x.serialNumber}`).toString(10)
    const publicKeyDer = x.publicKey.export({ type: 'spki', format: 'der' }) as Buffer
    let signatureRaw: Buffer | undefined
    try {
      const parsed = new rs.X509()
      parsed.readCertPEM(certPem)
      signatureRaw = Buffer.from(parsed.getSignatureValueHex(), 'hex')
    } catch {
      /* optional */
    }
    return { bodyB64, hashB64, issuer, serialDecimal, publicKeyDer, signatureRaw }
  } catch {
    return null
  }
}

type SignedPropsInput = {
  signingTime: string
  certHash: string
  certIssuer: string
  certSerial: string
}

/**
 * XAdES SignedProperties in the exact byte layout ZATCA's validator expects.
 *
 * The reporting/clearance validator does NOT rebuild this block from values —
 * it takes the element embedded in the document (root at column 32, children
 * at 36…52), re-serializes it with the in-scope namespace declarations added,
 * and hashes those bytes. So the embedded body must be byte-identical to the
 * hashed body, differing only in the xmlns declarations (present when hashing,
 * inherited from ancestors when embedded). /compliance/invoices never checks
 * this digest — only /invoices/reporting/single does.
 */
function signedPropsBlock(p: SignedPropsInput, withNamespaces: boolean): string {
  const xades = withNamespaces ? ' xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"' : ''
  const ds = withNamespaces ? ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"' : ''
  return `<xades:SignedProperties${xades} Id="xadesSignedProperties">
                                    <xades:SignedSignatureProperties>
                                        <xades:SigningTime>${p.signingTime}</xades:SigningTime>
                                        <xades:SigningCertificate>
                                            <xades:Cert>
                                                <xades:CertDigest>
                                                    <ds:DigestMethod${ds} Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                                    <ds:DigestValue${ds}>${p.certHash}</ds:DigestValue>
                                                </xades:CertDigest>
                                                <xades:IssuerSerial>
                                                    <ds:X509IssuerName${ds}>${p.certIssuer}</ds:X509IssuerName>
                                                    <ds:X509SerialNumber${ds}>${p.certSerial}</ds:X509SerialNumber>
                                                </xades:IssuerSerial>
                                            </xades:Cert>
                                        </xades:SigningCertificate>
                                    </xades:SignedSignatureProperties>
                                </xades:SignedProperties>`
}

/**
 * VAT registration number bound to a CSID certificate (SAN DirName UID, falling
 * back to the CN suffix). Fatoora only accepts invoices whose seller VAT matches
 * the authenticating certificate — and the sandbox always issues a fixed test
 * certificate for 399999999900003 regardless of the CSR.
 */
export function certVatNumber(certPem: string): string | null {
  try {
    const x = new X509Certificate(certPem)
    const san = String(x.subjectAltName || '')
    const uid = san.match(/(?:^|[,\s"])UID=(\d{10,15})/)
    if (uid) return uid[1]!
    const cn = x.subject.split('\n').find((l) => l.startsWith('CN='))
    const tail = cn?.match(/(\d{15})$/)
    return tail ? tail[1]! : null
  } catch {
    return null
  }
}

/** Shape that gets digested (namespaced, root at column 0). */
function signedPropsForHashing(p: SignedPropsInput): string {
  return signedPropsBlock(p, true)
}

/** Shape embedded in the invoice (namespaces inherited from QualifyingProperties / ds:Signature). */
function signedPropsForEmbedding(p: SignedPropsInput): string {
  return signedPropsBlock(p, false)
}

function buildUblExtensions(p: {
  invoiceHash: string
  signedPropsHash: string
  digitalSignature: string
  certBodyB64: string
  signedPropsXml: string
  signatureMethodUri: string
}): string {
  return `<ext:UBLExtensions>
    <ext:UBLExtension>
        <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
        <ext:ExtensionContent>
            <sig:UBLDocumentSignatures
                    xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"
                    xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2"
                    xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">
                <sac:SignatureInformation>
                    <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>
                    <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
                    <ds:Signature Id="signature" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
                        <ds:SignedInfo>
                            <ds:CanonicalizationMethod
                                    Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                            <ds:SignatureMethod
                                    Algorithm="${p.signatureMethodUri}"/>
                            <ds:Reference Id="invoiceSignedData" URI="">
                                <ds:Transforms>
                                    <ds:Transform
                                            Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                                        <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>
                                    </ds:Transform>
                                    <ds:Transform
                                            Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                                        <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>
                                    </ds:Transform>
                                    <ds:Transform
                                            Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                                        <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>
                                    </ds:Transform>
                                    <ds:Transform
                                            Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                                </ds:Transforms>
                                <ds:DigestMethod
                                        Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                <ds:DigestValue>${p.invoiceHash}</ds:DigestValue>
                            </ds:Reference>
                            <ds:Reference
                                    Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties"
                                    URI="#xadesSignedProperties">
                                <ds:DigestMethod
                                        Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                <ds:DigestValue>${p.signedPropsHash}</ds:DigestValue>
                            </ds:Reference>
                        </ds:SignedInfo>
                        <ds:SignatureValue>${p.digitalSignature}</ds:SignatureValue>
                        <ds:KeyInfo>
                            <ds:X509Data>
                                <ds:X509Certificate>${p.certBodyB64}</ds:X509Certificate>
                            </ds:X509Data>
                        </ds:KeyInfo>
                        <ds:Object>
                            <xades:QualifyingProperties Target="signature"
                                                        xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">
                                ${p.signedPropsXml}
                            </xades:QualifyingProperties>
                        </ds:Object>
                    </ds:Signature>
                </sac:SignatureInformation>
            </sig:UBLDocumentSignatures>
        </ext:ExtensionContent>
    </ext:UBLExtension></ext:UBLExtensions>`
}

const SIGNATURE_BLOCK =
  '<cac:Signature>' +
  '<cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>' +
  '<cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>' +
  '</cac:Signature>'

function qrReferenceBlock(qrTlvBase64: string): string {
  return (
    '<cac:AdditionalDocumentReference>' +
    '<cbc:ID>QR</cbc:ID>' +
    '<cac:Attachment>' +
    `<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qrTlvBase64}</cbc:EmbeddedDocumentBinaryObject>` +
    '</cac:Attachment>' +
    '</cac:AdditionalDocumentReference>'
  )
}

/**
 * Normalize an ISO timestamp to `YYYY-MM-DDTHH:mm:ss` for QR tag 3 — must equal
 * the invoice IssueDate + "T" + IssueTime exactly (KSA-25 QR validation).
 */
function zatcaTimestamp(iso: string): string {
  const d = new Date(iso)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 19)
  return iso.replace(/\.\d+/, '').replace(/Z$/, '').slice(0, 19)
}

export type SignedSimplified = {
  xml: string
  invoiceHash: string
  invoiceBase64: string
  signatureB64: string
  qrTlvBase64: string
}

/**
 * Build + sign a simplified invoice: canonical skeleton hash, ECDSA stamp over the
 * hash bytes, XAdES UBL extension, QR with tags 1-9, cac:Signature block.
 */
export function signSimplifiedInvoice(input: {
  unsignedXml: string
  privateKeyPem: string
  sellerName: string
  sellerVat: string
  timestampIso: string
  totalSar: number
  vatSar: number
  /** Binary security token / cert PEM when available (public key for QR tag 8) */
  certificatePem?: string | null
}): SignedSimplified {
  const invoiceHash = hashInvoiceXml(input.unsignedXml)

  // KSA-15 digital signature: ECDSA-SHA256 over the raw invoice-hash bytes.
  const signer = createSign('SHA256')
  signer.update(Buffer.from(invoiceHash, 'base64'))
  signer.end()
  const signatureB64 = signer.sign(input.privateKeyPem, 'base64')

  let sigMethodUri = 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256'
  try {
    if (createPrivateKey(input.privateKeyPem).asymmetricKeyType !== 'ec') {
      sigMethodUri = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
    }
  } catch {
    /* keep ecdsa default */
  }

  const certPem = input.certificatePem?.includes('CERTIFICATE')
    ? input.certificatePem
    : input.certificatePem
      ? binaryTokenToPem(input.certificatePem) ?? undefined
      : undefined
  const cert = certPem ? parseCertInfo(certPem) : null

  const timestamp = zatcaTimestamp(input.timestampIso)
  const qrTlvBase64 = buildPhase2TlvBase64({
    sellerName: input.sellerName,
    sellerVat: input.sellerVat,
    timestamp,
    totalSar: input.totalSar,
    vatSar: input.vatSar,
    invoiceHash,
    ecdsaSignature: signatureB64,
    publicKey: cert?.publicKeyDer,
    stampSignature: cert?.signatureRaw,
  })

  const parts: InvoiceParts = { qrReference: qrReferenceBlock(qrTlvBase64) }
  if (cert) {
    const propsInput = {
      signingTime: timestamp,
      certHash: cert.hashB64,
      certIssuer: cert.issuer,
      certSerial: cert.serialDecimal,
    }
    // ZATCA SDK quirk: signed-props digest = base64( hex( sha256(template bytes) ) )
    const signedPropsHash = Buffer.from(
      createHash('sha256').update(Buffer.from(signedPropsForHashing(propsInput), 'utf8')).digest('hex'),
      'utf8',
    ).toString('base64')
    parts.extensions = buildUblExtensions({
      invoiceHash,
      signedPropsHash,
      digitalSignature: signatureB64,
      certBodyB64: cert.bodyB64,
      signedPropsXml: signedPropsForEmbedding(propsInput),
      signatureMethodUri: sigMethodUri,
    })
    parts.signature = SIGNATURE_BLOCK
  }

  // Re-render the invoice with the signing blocks spliced in (zero added whitespace
  // outside the blocks, so the server-side strip reproduces the hashed skeleton).
  const anchor = '  <cbc:ProfileID>'
  let xml = input.unsignedXml
  if (parts.extensions) {
    xml = xml.replace(`>\n${anchor}`, `>${parts.extensions}\n${anchor}`)
  }
  const pihClose = /(<cac:AdditionalDocumentReference>\s*<cbc:ID>PIH<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>)/
  xml = xml.replace(pihClose, `$1${parts.qrReference}${parts.signature ?? ''}`)

  return {
    xml,
    invoiceHash,
    invoiceBase64: Buffer.from(xml, 'utf8').toString('base64'),
    signatureB64,
    qrTlvBase64,
  }
}

/** Decode CSID binary token to PEM. ZATCA tokens are base64 of the base64 cert body. */
export function binaryTokenToPem(binaryToken: string): string | null {
  const raw = binaryToken.trim()
  if (raw.includes('BEGIN CERTIFICATE')) return raw
  try {
    const decoded = Buffer.from(raw, 'base64')
    if (decoded.length < 32) return null
    const text = decoded.toString('utf8')
    // Fatoora binarySecurityToken decodes to the ASCII base64 certificate body.
    const body = /^MII[A-Za-z0-9+/=\s]+$/.test(text)
      ? text.replace(/\s+/g, '')
      : decoded[0] === 0x30
        ? decoded.toString('base64')
        : null
    if (!body) return null
    const lines = body.match(/.{1,64}/g) ?? [body]
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`
  } catch {
    return null
  }
}

export function splitTimestamp(iso: string): { issueDate: string; issueTime: string } {
  const d = iso.includes('T') ? iso : new Date(iso).toISOString()
  const [date, rest] = d.split('T')
  // BR-KSA-70: issue time must be hh:mm:ss (no milliseconds / timezone)
  const time = (rest || '00:00:00').replace(/Z$/, '').slice(0, 8)
  return { issueDate: date!, issueTime: time.length === 8 ? time : `${time}:00`.slice(0, 8) }
}
