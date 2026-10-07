/** Built-in test slip (tray "Test all printers" and /print/test without html). */
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function testSlipHtml(printer) {
  const width = Number(printer.paperWidthMm) <= 58 ? 58 : 80
  const device = printer.connection === 'usb' ? printer.deviceName : `${printer.host}:${printer.port}`
  const now = new Date().toLocaleString('en-GB')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${width}mm 120mm; margin: 0 }
* { box-sizing: border-box }
html, body { margin: 0; width: ${width}mm; background: #fff; color: #000 }
body { font-family: Tahoma, Arial, sans-serif; font-size: 12px; padding: 3mm }
h1 { font-size: 18px; text-align: center; margin: 0 0 2mm }
.c { text-align: center } .rule { border-top: 1.5px dashed #000; margin: 2.5mm 0 }
.row { display: flex; justify-content: space-between; gap: 2mm; margin: 1mm 0 }
.ar { direction: rtl; font-size: 14px }
.box { border: 2px solid #000; padding: 2mm; text-align: center; font-weight: 700; margin-top: 2mm }
</style></head><body>
<h1>ISARVA POS</h1>
<div class="c"><b>TEST PRINT</b></div>
<div class="c ar">طباعة تجريبية</div>
<div class="rule"></div>
<div class="row"><span>Printer</span><b>${esc(printer.name)}</b></div>
<div class="row"><span>Connection</span><span>${esc(String(printer.connection).toUpperCase())}</span></div>
<div class="row"><span>Device</span><span>${esc(device)}</span></div>
<div class="row"><span>Paper</span><span>${width} mm</span></div>
<div class="row"><span>Time</span><span>${esc(now)}</span></div>
<div class="rule"></div>
<div class="box">Printer is working</div>
<div class="c ar" style="margin-top:2mm">الطابعة تعمل بشكل صحيح</div>
</body></html>`
}

module.exports = { testSlipHtml }
