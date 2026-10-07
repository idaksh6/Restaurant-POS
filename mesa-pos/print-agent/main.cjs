/** Isarva POS Print Agent — Windows tray app that prints POS jobs to USB / LAN / Wi-Fi thermal printers. */
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } = require('electron')
const path = require('node:path')
const core = require('./core.cjs')
const { startServer } = require('./server.cjs')
const { testSlipHtml } = require('./testSlip.cjs')

const DOWNLOAD_URL = 'https://app.restaurant-pos.isarva.in/downloads/Isarva-Print-Agent-Setup.exe'
const HEALTH_POLL_MS = 20000

// Slips render in software; on many till PCs the GPU process crashes and Electron then quits.
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-sandbox')

app.setName('Isarva POS Print Agent')
app.setAppUserModelId('in.isarva.print-agent')

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let tray = null
let panel = null
let serverError = null

function iconPath(name) {
  return path.join(__dirname, 'assets', name)
}

function openPanel() {
  if (panel && !panel.isDestroyed()) {
    panel.show()
    panel.focus()
    return
  }
  panel = new BrowserWindow({
    width: 400,
    height: 640,
    minWidth: 360,
    minHeight: 480,
    title: 'Isarva POS Print Agent',
    icon: iconPath('icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'panel-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  panel.setMenuBarVisibility(false)
  panel.loadFile(path.join(__dirname, 'panel.html'))
  panel.once('ready-to-show', () => panel.show())
  panel.on('closed', () => {
    panel = null
  })
}

function state() {
  return { ...core.snapshot(), serverError }
}

function applyAutostart(enabled) {
  if (process.platform !== 'win32' || !app.isPackaged) return
  // Same Run-key name as the installer writes, so there is only ever one start-up entry.
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'], name: 'IsarvaPrintAgent' })
}

async function testAllPrinters() {
  const list = core.getPrinters().filter((p) => p.active)
  const results = []
  for (const p of list) {
    try {
      const job = await core.submitJob({ printer: p, docType: 'test', docRef: 'Test print', html: testSlipHtml(p), origin: 'tray' })
      results.push({ name: p.name, ok: job.status === 'printed', error: job.error && job.error.message })
    } catch (e) {
      results.push({ name: p.name, ok: false, error: e.message })
    }
  }
  return results
}

function restartAgent() {
  core.log('info', 'restart requested')
  app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--hidden').concat('--hidden') })
  app.exit(0)
}

function refreshTray() {
  if (!tray) return
  const s = core.snapshot()
  const bad = s.printers.filter((p) => p.active && p.state !== 'online' && p.state !== 'connecting').length
  tray.setToolTip(
    serverError
      ? 'Isarva Print Agent — not running (port busy)'
      : `Isarva Print Agent — ${s.printers.length} printer(s)${bad ? `, ${bad} need attention` : ', all online'}`,
  )
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Isarva POS Print Agent', enabled: false },
      { label: serverError ? '● Not running' : '● Running', enabled: false },
      { type: 'separator' },
      { label: 'Open status', click: openPanel },
      { label: 'Test all printers', enabled: s.printers.some((p) => p.active), click: () => void testAllPrinters() },
      { type: 'separator' },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: core.getConfig().startWithWindows,
        click: (item) => {
          core.saveConfig({ startWithWindows: item.checked })
          applyAutostart(item.checked)
        },
      },
      { label: 'View logs', click: () => void shell.openPath(core.logsDir()) },
      { label: 'Check for updates', click: () => void shell.openExternal(DOWNLOAD_URL) },
      { label: 'Restart agent', click: restartAgent },
      { type: 'separator' },
      { label: 'Quit', click: () => app.exit(0) },
    ]),
  )
}

function registerIpc() {
  ipcMain.handle('agent:state', () => state())
  ipcMain.handle('agent:refresh', async () => {
    await core.refreshHealth()
    return state()
  })
  ipcMain.handle('agent:test-all', () => testAllPrinters())
  ipcMain.handle('agent:retry', (_e, id) => core.retryJob(String(id)))
  ipcMain.handle('agent:jobs', () => core.listJobs(30))
  ipcMain.handle('agent:set-autostart', (_e, enabled) => {
    core.saveConfig({ startWithWindows: Boolean(enabled) })
    applyAutostart(Boolean(enabled))
    refreshTray()
    return state()
  })
  ipcMain.handle('agent:save-origins', (_e, origins) => {
    const clean = (Array.isArray(origins) ? origins : [])
      .map((o) => String(o).trim().replace(/\/+$/, ''))
      .filter((o) => /^(https?|mesa):\/\/[^\s/]+$/i.test(o))
    if (!clean.length) throw new Error('Add at least one valid origin, e.g. https://restaurant-pos.isarva.in')
    core.saveConfig({ allowedOrigins: [...new Set(clean)] })
    return state()
  })
  ipcMain.handle('agent:open-logs', () => shell.openPath(core.logsDir()))
  ipcMain.handle('agent:check-updates', () => shell.openExternal(DOWNLOAD_URL))
  ipcMain.handle('agent:restart', () => restartAgent())
}

app.on('second-instance', () => openPanel())
app.on('window-all-closed', () => {
  /* stay in the tray */
})

app.whenReady().then(async () => {
  core.init()
  core.log('info', `agent ${app.getVersion()} starting`)
  registerIpc()
  applyAutostart(core.getConfig().startWithWindows)

  try {
    await startServer()
  } catch (e) {
    serverError = e && e.code === 'EADDRINUSE' ? `Port ${core.getConfig().port} is already in use` : String(e && e.message)
    core.log('error', `server failed: ${serverError}`)
    dialog.showErrorBox('Isarva Print Agent', `The print agent could not start: ${serverError}.\nIs another copy already running?`)
  }

  const img = nativeImage.createFromPath(iconPath('icon.png')).resize({ width: 16, height: 16 })
  tray = new Tray(img)
  tray.on('click', openPanel)
  tray.on('double-click', openPanel)
  refreshTray()

  core.onChange(() => {
    refreshTray()
    if (panel && !panel.isDestroyed()) panel.webContents.send('agent:changed', state())
  })
  void core.refreshHealth()
  setInterval(() => void core.refreshHealth(), HEALTH_POLL_MS)

  if (!process.argv.includes('--hidden')) openPanel()
})
