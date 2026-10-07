/* End-to-end sandbox test: CSR -> compliance CSID -> sign invoice -> compliance check (node scripts/smoke-zatca-sandbox.js) */
const {
  generateZatcaCsr,
  buildSimplifiedInvoiceXml,
  signSimplifiedInvoice,
  splitTimestamp,
  binaryTokenToPem,
  toZatcaUuid,
} = require('../dist/modules/zatca/zatca-crypto')
const {
  requestComplianceCsid,
  requestProductionCsid,
  submitComplianceInvoice,
  reportInvoice,
} = require('../dist/modules/zatca/fatoora.client')
const { createHash } = require('crypto')

// Cases mirror what the POS actually sends: a POS-style id (not a UUID) and
// mixed taxable / non-taxable sales where VAT != 15% of the exclusive amount.
const CASES = [
  { label: 'standard 15%', id: 'inv-dine:br-1788756078757:t1__br-1788756078757:1789626083867-aaaaaaaa', total: 115, vat: 15 },
  { label: 'mixed VAT (POS receipt)', id: 'inv-dine:br-1788756078757:t1__br-1788756078757:1789626083867-ee449657', total: 321.75, vat: 6.75 },
  { label: 'no VAT items', id: 'inv-dine:br-1788756078757:t2__br-1788756078757:1789626083867-bbbbbbbb', total: 50, vat: 0 },
]

async function main() {
  const vat = '399999999900003'
  const csr = generateZatcaCsr({
    vatNumber: vat,
    companyName: 'Test Restaurant LLC',
    branchName: 'Main Branch',
    solutionName: 'MESA-POS',
    invoiceType: '0100',
    locationAddress: 'Riyadh',
    industry: 'Restaurant',
    environment: 'sandbox',
  })

  const csid = await requestComplianceCsid({ env: 'sandbox', otp: '123456', csrBase64: csr.csrBase64 })
  console.log('CSID ok:', csid.ok, '| message:', csid.message, '| requestId:', csid.requestId)
  if (!csid.ok) return
  // /compliance/invoices does NOT verify the SignedProperties digest — only the
  // reporting endpoint does. So obtain a production CSID and report for real.
  const prod = await requestProductionCsid({
    env: 'sandbox',
    binaryToken: csid.binarySecurityToken,
    secret: csid.secret,
    complianceRequestId: csid.requestId,
  })
  console.log('Production CSID ok:', prod.ok, '| message:', prod.message)
  if (!prod.ok) return
  const certPem = binaryTokenToPem(prod.binarySecurityToken)

  let pih = createHash('sha256').update('0').digest('base64')
  let icv = 0
  let failures = 0
  for (const c of CASES) {
    icv += 1
    const ts = new Date().toISOString()
    const { issueDate, issueTime } = splitTimestamp(ts)
    const uuid = toZatcaUuid(c.id)
    const unsigned = buildSimplifiedInvoiceXml({
      uuid,
      invoiceNumber: `MESA-${icv}`,
      issueDate,
      issueTime,
      sellerName: 'Test Restaurant LLC',
      sellerVat: vat,
      totalSar: c.total,
      vatSar: c.vat,
      pih,
      icv,
    })
    const signed = signSimplifiedInvoice({
      unsignedXml: unsigned,
      privateKeyPem: csr.privateKeyPem,
      sellerName: 'Test Restaurant LLC',
      sellerVat: vat,
      timestampIso: ts,
      totalSar: c.total,
      vatSar: c.vat,
      certificatePem: certPem,
    })
    const payload = { invoiceHash: signed.invoiceHash, uuid, invoiceBase64: signed.invoiceBase64 }
    const check = await submitComplianceInvoice({
      env: 'sandbox',
      binaryToken: csid.binarySecurityToken,
      secret: csid.secret,
      ...payload,
    })
    const report = await reportInvoice({
      env: 'sandbox',
      binaryToken: prod.binarySecurityToken,
      secret: prod.secret,
      ...payload,
    })
    console.log(`\n[${c.label}] total=${c.total} vat=${c.vat} uuid=${uuid}`)
    console.log('  compliance ok:', check.ok, '| QR TLV length:', signed.qrTlvBase64.length)
    console.log('  compliance:', check.message)
    console.log('  reporting ok:', report.ok)
    console.log('  reporting:', report.message)
    const vr = report.raw && report.raw.validationResults
    if (vr) {
      for (const w of vr.warningMessages || []) console.log('  WARN:', w.code, '-', String(w.message).slice(0, 200))
      for (const e of vr.errorMessages || []) console.log('  ERROR:', e.code, '-', String(e.message).slice(0, 200))
    }
    if (!check.ok || !report.ok) failures += 1
    pih = signed.invoiceHash
  }
  console.log(`\n${failures ? `FAILED ${failures}/${CASES.length}` : `ALL ${CASES.length} CASES PASSED`}`)
  if (failures) process.exit(2)
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
