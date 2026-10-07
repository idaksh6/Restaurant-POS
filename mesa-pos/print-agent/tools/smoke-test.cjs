/**
 * Smoke test for a running agent + fake printer:
 *   node print-agent/tools/fake-printer.cjs 19100 out ok
 *   node print-agent/tools/smoke-test.cjs 19100
 */
const A = 'http://127.0.0.1:17891'
const fakePort = Number(process.argv[2]) || 19100
const deadPort = fakePort + 99
const ORIGIN = 'http://localhost:5173'

const post = (p, b) =>
  fetch(A + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify(b),
  }).then((r) => r.json())

const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
@page { size: 80mm 200mm; margin: 0 }
body { margin: 0; width: 80mm; padding: 3mm; font-family: Tahoma; font-size: 12px }
h1 { text-align: center; font-size: 18px; margin: 0 }
.r { display: flex; justify-content: space-between }
</style></head><body>
<h1>مطعم إيسارفا</h1><p style="text-align:center">ISARVA RESTAURANT · KOT-007</p>
<div class="r"><span>2 × برياني دجاج</span><span>44.00</span></div>
<div class="r"><span>1 × لاسي مانجو</span><span>12.00</span></div>
<hr><div class="r"><b>الإجمالي</b><b>56.00</b></div>
</body></html>`

async function main() {
  const sys = await fetch(`${A}/printers/system`).then((r) => r.json())
  console.log('system printers:', JSON.stringify(sys.printers?.map((p) => ({ name: p.name, port: p.portName, usb: p.isUsb, virtual: p.isVirtual, state: p.state })) ?? sys))

  console.log('connection ok  :', JSON.stringify(await post('/connection/test', { host: '127.0.0.1', port: fakePort, timeoutMs: 3000 })))
  console.log('connection dead:', JSON.stringify(await post('/connection/test', { host: '127.0.0.1', port: deadPort, timeoutMs: 2000 })))

  const printer = { id: 'p1', name: 'Kitchen Printer', connection: 'lan', host: '127.0.0.1', port: fakePort, paperWidthMm: 80, autoCut: true }
  const t = await post('/print/test', { printer })
  console.log('test print     :', t.ok, t.job?.status, JSON.stringify(t.error ?? null))

  const k = await post('/print/kot', { printer: { ...printer, paperWidthMm: 58 }, html, docRef: 'KOT-007' })
  console.log('kot 58mm       :', k.ok, k.job?.status, JSON.stringify(k.error ?? null))

  const rows = Array.from({ length: 40 }, (_, i) => `<div class="r"><span>${i + 1}. Item ${i + 1} / صنف</span><span>${(i + 1) * 3}.00</span></div>`).join('')
  const longBill = html.replace('<hr>', `${rows}<hr>`).replace('dir="rtl"', '')
  const b = await post('/print/bill', { printer, html: longBill, docRef: 'BILL-1026' })
  console.log('long bill      :', b.ok, b.job?.status, JSON.stringify(b.error ?? null))

  const off = await post('/print/receipt', {
    printer: { ...printer, id: 'p2', name: 'Receipt Printer', port: deadPort, timeoutMs: 2000 },
    html,
    docRef: 'R-1',
  })
  console.log('offline print  :', off.ok, JSON.stringify(off.error))

  if (off.job?.id) {
    const retry = await post(`/jobs/${off.job.id}/retry`, { printer })
    console.log('retry → alt    :', retry.ok, retry.job?.status, 'retryCount', retry.job?.retryCount)
  }

  const jobs = await fetch(`${A}/jobs`).then((r) => r.json())
  console.log('jobs           :', JSON.stringify(jobs.jobs.slice(0, 5).map((j) => [j.docType, j.docRef, j.status, j.canRetry, j.error?.code])))
}

main().catch((e) => {
  console.error('ERR', e)
  process.exit(1)
})
