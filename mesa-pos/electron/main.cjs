const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-sandbox')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mesa',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

app.setName('Mesa POS')
app.setAppUserModelId('sa.mesa.pos')

function log(message) {
  try {
    const file = path.join(app.getPath('userData'), 'mesa-pos.log')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`)
  } catch {
    /* ignore */
  }
}

function dexieFile() {
  return path.join(app.getPath('userData'), 'mesa-dexie.json')
}

function loadDexieDump() {
  try {
    const file = dexieFile()
    if (!fs.existsSync(file)) return null
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function saveDexieDump(data) {
  try {
    const file = dexieFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data ?? {}))
  } catch (err) {
    log(`save dexie ${err}`)
  }
}

function openWindowsOnScreenKeyboard() {
  if (process.platform !== 'win32') return false
  const candidates = [
    path.join(
      process.env['CommonProgramFiles'] || 'C:\\Program Files\\Common Files',
      'microsoft shared',
      'ink',
      'TabTip.exe',
    ),
    path.join(
      process.env['ProgramFiles'] || 'C:\\Program Files',
      'Common Files',
      'microsoft shared',
      'ink',
      'TabTip.exe',
    ),
    path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'osk.exe'),
  ]
  for (const exe of candidates) {
    try {
      if (!fs.existsSync(exe)) continue
      spawn(exe, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      }).unref()
      return true
    } catch (err) {
      log(`open keyboard ${exe} ${err}`)
    }
  }
  try {
    spawn('osk.exe', [], {
      detached: true,
      stdio: 'ignore',
      shell: true,
      windowsHide: false,
    }).unref()
    return true
  } catch (err) {
    log(`open keyboard osk ${err}`)
    return false
  }
}

function registerStorageIpc() {
  ipcMain.on('mesa-load-dexie', (event) => {
    event.returnValue = loadDexieDump()
  })
  ipcMain.on('mesa-save-dexie', (event, data) => {
    if (data && typeof data === 'object') saveDexieDump(data)
    event.returnValue = true
  })
  ipcMain.handle('mesa-open-keyboard', () => openWindowsOnScreenKeyboard())
  ipcMain.handle('mesa-list-printers', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win || win.isDestroyed()) return []
    try {
      const list = await win.webContents.getPrintersAsync()
      return (list || []).map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: Boolean(p.isDefault),
        status: p.status,
      }))
    } catch (err) {
      log(`list printers ${err}`)
      return []
    }
  })
  ipcMain.handle('mesa-print', async (_event, job) => {
    await printViaElectron(job)
    return { ok: true }
  })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPrintHtml(job) {
  if (job && typeof job.html === 'string' && job.html.trim()) {
    return job.html
  }
  const mm = Math.max(48, Math.min(120, Number(job && job.paperWidthMm) || 80))
  const width = `${mm}mm`
  const title = escapeHtml(job && job.title ? job.title : 'Print')
  const bodyHtml = job && typeof job.bodyHtml === 'string' ? job.bodyHtml : ''
  const lines = Array.isArray(job && job.lines) ? job.lines : []
  const units = bodyHtml ? (bodyHtml.match(/class="row"/g) || []).length + 8 : lines.length + 6
  const heightMm = Math.max(140, Math.min(560, 55 + units * 10))
  const height = `${heightMm}mm`
  const fallbackLines = lines
    .map((line) => `<div class="kot-line">${escapeHtml(line)}</div>`)
    .join('')
  const footer = job && job.footer ? `<p class="thanks">${escapeHtml(job.footer)}</p>` : ''
  const body =
    bodyHtml.trim() ||
    `<header class="head"><div class="brand">${title}</div></header><div class="rule"></div>${fallbackLines}${footer}`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} · ${mm}mm</title>
<style>
  @page { size: ${width} ${height}; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: ${width}; min-width: ${width}; max-width: ${width};
    background: #fff; color: #111;
  }
  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 12.5px; line-height: 1.4; padding: 4mm 3mm 5mm;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .head { text-align: center; margin-bottom: 8px; }
  .brand {
    font-size: 18px; font-weight: 800; letter-spacing: 0.04em;
    text-transform: uppercase; margin: 0 0 6px;
  }
  .meta { margin: 2px 0; color: #333; font-size: 11.5px; }
  .tag {
    display: inline-block; margin-top: 8px; padding: 3px 8px;
    border: 1.5px solid #111; border-radius: 999px;
    font-size: 10px; font-weight: 800; letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .rule { border: 0; border-top: 1.5px dashed #222; margin: 8px 0; }
  .row {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 10px; margin: 4px 0;
  }
  .row span:first-child { flex: 1; min-width: 0; word-break: break-word; }
  .row span:last-child {
    flex: 0 0 auto; font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .row.strong {
    font-weight: 800; font-size: 14px; margin-top: 6px; padding-top: 4px;
    border-top: 1px solid #111;
  }
  .row.muted { color: #444; font-size: 11.5px; }
  .thanks { margin: 12px 0 0; text-align: center; font-size: 11.5px; color: #222; }
  .kot-line {
    margin: 3px 0; font-family: "Courier New", ui-monospace, Consolas, monospace;
    font-size: 13px; white-space: pre-wrap; word-break: break-word;
  }
</style></head><body><div class="slip">${body}</div></body></html>`
}

function paperSizeMicrons(job) {
  const widthMm = Math.max(48, Math.min(120, Number(job && job.paperWidthMm) || 80))
  const bodyHtml = job && typeof job.bodyHtml === 'string' ? job.bodyHtml : ''
  const lines = Array.isArray(job && job.lines) ? job.lines : []
  const units = bodyHtml ? (bodyHtml.match(/class="row"/g) || []).length + 8 : lines.length + 6
  const heightMm = Math.max(140, Math.min(560, 55 + units * 10))
  return {
    width: Math.round(widthMm * 1000),
    height: Math.round(heightMm * 1000),
  }
}

function printViaElectron(job) {
  const payload = job && typeof job === 'object' ? job : {}
  const copies = Math.max(1, Number(payload.copies) || 1)
  const target = String(payload.target || 'browser').trim()
  const silent = Boolean(target && target.toLowerCase() !== 'browser')
  const html = buildPrintHtml(payload)
  const pageSize = paperSizeMicrons(payload)

  const printOnce = () =>
    new Promise((resolve, reject) => {
      const win = new BrowserWindow({
        show: false,
        width: Math.max(320, Math.round(pageSize.width / 1000) * 4),
        height: 720,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      const finish = (err) => {
        try {
          if (!win.isDestroyed()) win.destroy()
        } catch {
          /* ignore */
        }
        if (err) reject(err)
        else resolve()
      }
      win.webContents.once('did-fail-load', (_e, code, desc) => {
        finish(new Error(`Print preview failed (${code}) ${desc}`))
      })
      win.webContents.once('did-finish-load', () => {
        const run = async () => {
          try {
            if (silent) {
              await new Promise((res, rej) => {
                win.webContents.print(
                  {
                    silent: true,
                    printBackground: true,
                    deviceName: target,
                    margins: { marginType: 'none' },
                    pageSize,
                  },
                  (success, failureReason) => {
                    if (!success) rej(new Error(failureReason || 'Print cancelled or failed'))
                    else res()
                  },
                )
              })
              finish()
              return
            }

            // Browser / PDF path: build a real 80mm PDF (avoids Windows A4 drivers).
            const pdf = await win.webContents.printToPDF({
              printBackground: true,
              pageSize,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              preferCSSPageSize: true,
            })
            const out = path.join(
              app.getPath('temp'),
              `mesa-receipt-${pageSize.width / 1000}mm-${Date.now()}.pdf`,
            )
            fs.writeFileSync(out, pdf)
            await shell.openPath(out)
            finish()
          } catch (err) {
            finish(err instanceof Error ? err : new Error(String(err)))
          }
        }
        void run()
      })
      void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    })

  return (async () => {
    for (let i = 0; i < copies; i += 1) {
      await printOnce()
    }
  })()
}

function distRoot() {
  const candidates = [
    path.join(process.resourcesPath, 'app-ui'),
    path.join(app.getAppPath(), 'dist'),
    path.join(__dirname, '..', 'dist'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir
  }
  throw new Error(`POS files not found.\nLooked in:\n${candidates.join('\n')}`)
}

function installWindowsShortcuts() {
  if (process.platform !== 'win32') return
  const exe = process.execPath
  if (path.basename(exe).toLowerCase() === 'electron.exe') return

  const cwd = path.dirname(exe)
  const options = {
    target: exe,
    cwd,
    description: 'Mesa KSA Restaurant POS',
    appUserModelId: 'sa.mesa.pos',
  }
  const desktop = path.join(app.getPath('desktop'), 'Mesa POS.lnk')
  const startMenuDir = path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
  )
  fs.mkdirSync(startMenuDir, { recursive: true })
  shell.writeShortcutLink(desktop, 'replace', options)
  shell.writeShortcutLink(path.join(startMenuDir, 'Mesa POS.lnk'), 'replace', options)
}

function mime(file) {
  switch (path.extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
    case '.webmanifest':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function registerUiProtocol(ses, root) {
  const base = path.normalize(root + path.sep)
  ses.protocol.handle('mesa', (request) => {
    try {
      const parsed = new URL(request.url)
      let rel = decodeURIComponent(parsed.pathname || '/')
      rel = rel.replace(/^\/+/, '')
      if (!rel || rel.endsWith('/')) rel += 'index.html'
      const file = path.normalize(path.join(root, rel))
      if (!file.toLowerCase().startsWith(base.toLowerCase())) {
        return new Response('Forbidden', { status: 403 })
      }
      const target =
        fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html')
      const data = fs.readFileSync(target)
      return new Response(data, {
        headers: {
          'content-type': mime(target),
          'cache-control': 'no-store',
        },
      })
    } catch (err) {
      log(`protocol ${err}`)
      return new Response(String(err), { status: 500 })
    }
  })
}

async function createWindow(root) {
  log(`ui root ${root}`)
  Menu.setApplicationMenu(null)

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Mesa POS',
    autoHideMenuBar: true,
    backgroundColor: '#eef2ef',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      partition: 'persist:mesa-pos',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Custom mesa:// UI origin fails CORS against a locked Access-Control-Allow-Origin.
      // Desktop talks to our API with Authorization headers (no cookies).
      webSecurity: false,
    },
  })

  win.once('ready-to-show', () => win.show())
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show()
  }, 1500)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('mesa:')) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase()
    const reload =
      key === 'f5' ||
      ((input.control || input.meta) && key === 'r') ||
      ((input.control || input.meta) && input.shift && key === 'r')
    if (reload) event.preventDefault()
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log(`did-fail-load ${code} ${desc} ${url}`)
  })

  await win.loadURL('mesa://ui/index.html')

  let flushing = false
  win.on('close', (event) => {
    if (flushing) return
    event.preventDefault()
    flushing = true
    win.webContents
      .executeJavaScript(
        `window.__mesaFlushDexie ? window.__mesaFlushDexie() : null`,
      )
      .then(() => {
        win.destroy()
      })
      .catch((err) => {
        log(`flush storage ${err}`)
        win.destroy()
      })
  })
}

app.whenReady().then(async () => {
  try {
    const root = distRoot()
    registerStorageIpc()
    const ses = session.fromPartition('persist:mesa-pos')
    registerUiProtocol(ses, root)
    installWindowsShortcuts()
    await createWindow(root)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow(root)
    })
  } catch (err) {
    log(err && err.stack ? err.stack : String(err))
    dialog.showErrorBox('Mesa POS failed to start', String(err && err.stack ? err.stack : err))
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
