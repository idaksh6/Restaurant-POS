/* Smoke test: ZATCA CSR generation + simplified invoice signing (run: node scripts/smoke-zatca-crypto.js) */
const {
  generateZatcaCsr,
  buildSimplifiedInvoiceXml,
  signSimplifiedInvoice,
  splitTimestamp,
} = require('../dist/modules/zatca/zatca-crypto')
const { createHash, createVerify, randomUUID } = require('crypto')

// 1. CSR
const csr = generateZatcaCsr({
  vatNumber: '399999999900003',
  companyName: 'Test Restaurant LLC',
  branchName: 'Main Branch',
  solutionName: 'MESA-POS',
  invoiceType: '0100',
  locationAddress: 'Riyadh',
  industry: 'Restaurant',
  environment: 'sandbox',
})
console.log('CSR PEM head:', csr.csrPem.split('\n')[0])
console.log('EGS serial:', csr.serialNumber)

// Verify the CSR parses and is ECDSA secp256k1 with expected extensions
const rs = require('jsrsasign')
const parsed = rs.KEYUTIL.getKey(csr.privateKeyPem)
console.log('Private key curve:', parsed.curveName)
const csrHex = rs.pemtohex(csr.csrPem, 'CERTIFICATE REQUEST')
const params = rs.KJUR.asn1.csr.CSRUtil.getParam(csr.csrPem)
console.log('CSR subject:', params.subject.str)
console.log('CSR sigalg:', params.sigalg)
console.log('CSR extensions:', JSON.stringify(params.extreq, null, 1))
const verified = rs.KJUR.asn1.csr.CSRUtil.verifySignature(csr.csrPem)
console.log('CSR signature valid:', verified)

// csrBase64 must decode back to the PEM text
const decoded = Buffer.from(csr.csrBase64, 'base64').toString('utf8')
console.log('csrBase64 is base64(PEM):', decoded.startsWith('-----BEGIN CERTIFICATE REQUEST-----'))

// 2. Invoice build + sign
const ts = new Date().toISOString()
const { issueDate, issueTime } = splitTimestamp(ts)
const unsigned = buildSimplifiedInvoiceXml({
  uuid: randomUUID(),
  invoiceNumber: 'MESA-1',
  issueDate,
  issueTime,
  sellerName: 'Test Restaurant LLC',
  sellerVat: '399999999900003',
  totalSar: 115,
  vatSar: 15,
  pih: createHash('sha256').update('0').digest('base64'),
  icv: 1,
})
const signed = signSimplifiedInvoice({
  unsignedXml: unsigned,
  privateKeyPem: csr.privateKeyPem,
  sellerName: 'Test Restaurant LLC',
  sellerVat: '399999999900003',
  timestampIso: ts,
  totalSar: 115,
  vatSar: 15,
  certificatePem: null,
})
console.log('Invoice hash:', signed.invoiceHash)
console.log('Signature b64 length:', signed.signatureB64.length)
console.log('QR TLV b64 length:', signed.qrTlvBase64.length)

// Verify ECDSA signature over the raw invoice-hash bytes (ZATCA KSA-15 semantics)
const { createPublicKey } = require('crypto')
const pub = createPublicKey(csr.privateKeyPem)
const v = createVerify('SHA256')
v.update(Buffer.from(signed.invoiceHash, 'base64'))
v.end()
console.log('ECDSA signature verifies:', v.verify(pub, Buffer.from(signed.signatureB64, 'base64')))

// Hash must be over the canonical body (declaration excluded)
const { hashInvoiceXml } = require('../dist/modules/zatca/zatca-crypto')
const stripped = signed.xml
  .replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, '')
  .replace(/<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/, '')
  .replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/, '')
console.log('Strip(signed) reproduces hashed skeleton:', hashInvoiceXml(stripped) === signed.invoiceHash)

// Decode QR TLV tags
const buf = Buffer.from(signed.qrTlvBase64, 'base64')
let i = 0
const tags = []
while (i < buf.length) {
  const tag = buf[i]
  const len = buf[i + 1]
  tags.push(`${tag}(${len})`)
  i += 2 + len
}
console.log('QR TLV tags(len):', tags.join(' '))
console.log('SMOKE OK')
