/**
 * Checks the Windows spooler RAW helper compiles and loads:
 *   node_modules/electron/dist/electron.exe print-agent/tools/usb-raw-check.cjs ["Printer name"]
 * Without a name it targets a missing printer and expects PRINTER_NOT_FOUND.
 */
const { app } = require('electron')

app.setName('Isarva POS Print Agent')

app.whenReady().then(async () => {
  const { sendWindowsRaw } = require('../printers.cjs')
  const name = process.argv[2] || 'Isarva Missing Printer 123'
  const started = Date.now()
  try {
    await sendWindowsRaw(name, Buffer.from([0x1b, 0x40, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]), 'Isarva raw check')
    console.log(`OK: sent to "${name}" in ${Date.now() - started}ms`)
  } catch (e) {
    console.log(`${e.code}: ${e.message} (${Date.now() - started}ms)`)
  }
  app.exit(0)
})
