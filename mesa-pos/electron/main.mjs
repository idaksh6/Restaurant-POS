import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
    case '.ico':
      return 'image/x-icon'
    default:
      return 'application/octet-stream'
  }
}

function distRoot() {
  const nextToElectron = path.join(__dirname, '..', 'dist')
  if (fs.existsSync(nextToElectron)) return nextToElectron
  return path.join(process.resourcesPath, 'dist')
}

function resolveAsset(root, requestUrl) {
  const decoded = decodeURIComponent((requestUrl || '/').split('?')[0])
  const relative = decoded.replace(/^\/+/, '')
  const candidate = path.resolve(root, relative || 'index.html')
  const rel = path.relative(root, candidate)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return path.join(root, 'index.html')
  }
  if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
    return path.join(root, 'index.html')
  }
  return candidate
}

function startServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const file = resolveAsset(root, req.url)
      res.writeHead(200, {
        'Content-Type': mime(file),
        'Cache-Control': 'no-store',
      })
      fs.createReadStream(file).pipe(res)
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function isEphemeralLaunch(exePath) {
  const lower = exePath.toLowerCase()
  return (
    lower.includes('\\temp\\') ||
    lower.includes('\\tmp\\') ||
    lower.includes('\\rar$') ||
    lower.includes('\\appdata\\local\\temp\\')
  )
}

function installWindowsShortcuts() {
  if (process.platform !== 'win32') return
  const exe = process.execPath
  if (path.basename(exe).toLowerCase() === 'electron.exe') return
  if (isEphemeralLaunch(exe)) return

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

async function createWindow() {
  const root = distRoot()
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    throw new Error(`POS build missing at ${root}. Run npm run build first.`)
  }

  const server = await startServer(root)
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Desktop server failed to start')
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Mesa POS',
    autoHideMenuBar: true,
    backgroundColor: '#eef2ef',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  await win.loadURL(`http://127.0.0.1:${address.port}/`)
  win.on('closed', () => {
    server.close()
  })
}

app.setName('Mesa POS')
app.setAppUserModelId('sa.mesa.pos')

app.whenReady().then(() => {
  if (process.platform === 'win32' && isEphemeralLaunch(process.execPath)) {
    dialog.showErrorBox(
      'Mesa POS',
      'Do not run Mesa POS from inside the zip.\n\nExtract the Mesa-POS folder, then double-click "Install Mesa POS.bat".',
    )
    app.quit()
    return
  }
  installWindowsShortcuts()
  void createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
