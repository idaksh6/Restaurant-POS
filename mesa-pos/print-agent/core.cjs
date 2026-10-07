/** Agent state: config, logs, configured printers, health, print jobs. */
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { htmlToEscPos } = require('./escpos.cjs')
const {
  PrintError,
  listWindowsPrinters,
  windowsHealth,
  tcpHealth,
  sendTcp,
  sendWindowsRaw,
  sendViaDriver,
} = require('./printers.cjs')

const DEFAULT_PORT = 17891
const DEFAULT_ORIGINS = [
  'https://app.restaurant-pos.isarva.in',
  'https://restaurant-pos.isarva.in',
  'mesa://ui',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]
const MAX_JOBS = 300
const LOG_KEEP_DAYS = 14

const dataDir = () => app.getPath('userData')
const file = (name) => path.join(dataDir(), name)

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(name, value) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true })
    const tmp = `${file(name)}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(value, null, 1))
    fs.renameSync(tmp, file(name))
  } catch (e) {
    log('error', `save ${name} failed: ${e.message}`)
  }
}

// ---------- logging ----------
function logsDir() {
  return path.join(dataDir(), 'logs')
}

function log(level, message) {
  try {
    fs.mkdirSync(logsDir(), { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    fs.appendFileSync(path.join(logsDir(), `agent-${day}.log`), `${new Date().toISOString()} [${level}] ${message}\n`)
  } catch {
    /* ignore */
  }
}

function pruneLogs() {
  try {
    const cutoff = Date.now() - LOG_KEEP_DAYS * 86400000
    for (const name of fs.readdirSync(logsDir())) {
      const full = path.join(logsDir(), name)
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full)
    }
  } catch {
    /* ignore */
  }
}

// ---------- config ----------
let config = null
function loadConfig() {
  const saved = readJson('agent-config.json', {})
  config = {
    port: Number(saved.port) || DEFAULT_PORT,
    allowedOrigins: Array.isArray(saved.allowedOrigins) && saved.allowedOrigins.length ? saved.allowedOrigins : DEFAULT_ORIGINS,
    startWithWindows: saved.startWithWindows !== false,
  }
  return config
}
function getConfig() {
  return config || loadConfig()
}
function saveConfig(patch) {
  config = { ...getConfig(), ...patch }
  writeJson('agent-config.json', config)
  return config
}

// ---------- printers pushed by the POS ----------
function normalizePrinter(p) {
  const connection = ['usb', 'lan', 'wifi'].includes(p && p.connection) ? p.connection : 'usb'
  return {
    id: String(p.id || ''),
    name: String(p.name || p.deviceName || p.host || 'Printer'),
    connection,
    deviceName: p.deviceName ? String(p.deviceName) : undefined,
    host: p.host ? String(p.host).trim() : undefined,
    port: Number(p.port) || 9100,
    timeoutMs: Math.min(30000, Math.max(1000, Number(p.timeoutMs) || 5000)),
    printMode: p.printMode === 'driver' ? 'driver' : 'escpos',
    paperWidthMm: Number(p.paperWidthMm) <= 58 ? 58 : 80,
    autoCut: p.autoCut !== false,
    openDrawer: Boolean(p.openDrawer),
    statusQuery: p.statusQuery !== false,
    active: p.active !== false,
    purposes: Array.isArray(p.purposes) ? p.purposes.map(String) : [],
  }
}

function validatePrinter(p) {
  if (p.connection === 'usb' && !p.deviceName) throw new PrintError('BAD_REQUEST', 'Select a USB printer first')
  if (p.connection !== 'usb' && !p.host) throw new PrintError('BAD_REQUEST', 'Printer IP address is required')
}

let printers = []
function loadPrinters() {
  printers = (readJson('printers.json', []) || []).map(normalizePrinter)
}
function getPrinters() {
  return printers
}
function syncPrinters(list) {
  printers = (Array.isArray(list) ? list : []).map(normalizePrinter).filter((p) => p.id)
  writeJson('printers.json', printers)
  void refreshHealth()
  return printers
}

// ---------- health ----------
let winCache = { at: 0, list: [] }
async function windowsPrintersCached(maxAgeMs = 4000) {
  if (Date.now() - winCache.at < maxAgeMs) return winCache.list
  winCache = { at: Date.now(), list: await listWindowsPrinters() }
  return winCache.list
}

async function printerHealth(p, { fresh = false } = {}) {
  if (p.connection === 'usb') {
    const list = await windowsPrintersCached(fresh ? 0 : 4000)
    const found = list.find((w) => w.name.toLowerCase() === String(p.deviceName || '').toLowerCase())
    return windowsHealth(found)
  }
  return tcpHealth(p.host, p.port, Math.min(p.timeoutMs, 5000), p.statusQuery && p.printMode === 'escpos')
}

const health = new Map()
let healthBusy = false
async function refreshHealth() {
  if (healthBusy) return health
  healthBusy = true
  try {
    await Promise.all(
      printers.filter((p) => p.active).map(async (p) => {
        try {
          health.set(p.id, { ...(await printerHealth(p)), checkedAt: new Date().toISOString() })
        } catch (e) {
          health.set(p.id, { state: 'unknown', detail: e.message, checkedAt: new Date().toISOString() })
        }
      }),
    )
    for (const id of [...health.keys()]) if (!printers.some((p) => p.id === id)) health.delete(id)
  } finally {
    healthBusy = false
  }
  emitChange()
  return health
}

// ---------- jobs ----------
let jobs = []
function loadJobs() {
  jobs = readJson('jobs.json', []) || []
  // A crash mid-print leaves "printing" rows — surface them as failed so they can be retried.
  for (const j of jobs) {
    if (j.status === 'printing' || j.status === 'pending') {
      j.status = 'failed'
      j.error = { code: 'AGENT_RESTARTED', message: 'Agent restarted before the job finished' }
    }
  }
}
function saveJobs() {
  const trimmed = jobs.slice(0, MAX_JOBS).map((j) =>
    j.status === 'printed' || j.status === 'cancelled' ? { ...j, payload: undefined } : j,
  )
  jobs = trimmed
  writeJson('jobs.json', trimmed)
}
function publicJob(j) {
  const { payload, ...rest } = j
  return { ...rest, canRetry: Boolean(payload) && j.status === 'failed' }
}
function listJobs(limit = 100) {
  return jobs.slice(0, limit).map(publicJob)
}

const lanes = new Map()
function inLane(key, fn) {
  const prev = lanes.get(key) || Promise.resolve()
  const next = prev.catch(() => undefined).then(fn)
  lanes.set(key, next.catch(() => undefined))
  return next
}

async function deliver(p, payload) {
  const ready = await printerHealth(p, { fresh: true })
  if (ready.state !== 'online') throw new PrintError(ready.code || 'PRINTER_OFFLINE', ready.detail || 'Printer is not ready')
  const copies = Math.max(1, Math.min(9, Number(payload.copies) || 1))

  if (payload.rawBase64) {
    const data = Buffer.from(String(payload.rawBase64), 'base64')
    if (p.connection === 'usb') return sendWindowsRaw(p.deviceName, data, payload.docRef || 'Isarva POS')
    return sendTcp(p.host, p.port, data, p.timeoutMs)
  }
  if (!payload.html) throw new PrintError('BAD_REQUEST', 'Nothing to print')
  if (p.connection === 'usb' && p.printMode === 'driver') {
    return sendViaDriver(p.deviceName, payload.html, { paperWidthMm: p.paperWidthMm, copies })
  }
  let encoded
  try {
    encoded = await htmlToEscPos(payload.html, {
      paperWidthMm: p.paperWidthMm,
      autoCut: p.autoCut,
      openDrawer: Boolean(payload.openDrawer) && p.openDrawer,
      copies,
    })
  } catch (e) {
    throw new PrintError('RENDER_FAILED', `Could not prepare the slip (${e.message})`)
  }
  if (p.connection === 'usb') return sendWindowsRaw(p.deviceName, encoded.data, payload.docRef || 'Isarva POS')
  return sendTcp(p.host, p.port, encoded.data, p.timeoutMs)
}

async function runJob(job, p) {
  job.status = 'printing'
  job.startedAt = new Date().toISOString()
  emitChange()
  try {
    await inLane(p.connection === 'usb' ? `usb:${p.deviceName}` : `tcp:${p.host}:${p.port}`, () => deliver(p, job.payload))
    job.status = 'printed'
    job.printedAt = new Date().toISOString()
    job.error = undefined
    health.set(p.id, { state: 'online', checkedAt: job.printedAt })
    log('info', `job ${job.id} ${job.docType} "${job.docRef || ''}" → ${p.name} printed`)
  } catch (e) {
    job.status = 'failed'
    job.error = { code: e.code || 'PRINT_FAILED', message: e.message || 'Print failed' }
    if (['PRINTER_OFFLINE', 'TIMEOUT', 'PAPER_OUT', 'COVER_OPEN', 'PRINTER_NOT_FOUND'].includes(job.error.code)) {
      health.set(p.id, { state: job.error.code === 'PAPER_OUT' ? 'paper-out' : job.error.code === 'COVER_OPEN' ? 'cover-open' : 'offline', code: job.error.code, detail: job.error.message, checkedAt: new Date().toISOString() })
    }
    log('warn', `job ${job.id} ${job.docType} "${job.docRef || ''}" → ${p.name} failed: ${job.error.code} ${job.error.message}`)
  }
  saveJobs()
  emitChange()
  return job
}

/** Print now; the job (with payload) is kept if it fails so it is never silently lost. */
async function submitJob({ printer, docType, docRef, html, rawBase64, copies, openDrawer, origin, orderId, kotId }) {
  const p = normalizePrinter(printer || {})
  validatePrinter(p)
  const job = {
    id: `job-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    docType: String(docType || 'raw'),
    docRef: docRef ? String(docRef).slice(0, 80) : undefined,
    orderId: orderId ? String(orderId) : undefined,
    kotId: kotId ? String(kotId) : undefined,
    printerId: p.id || undefined,
    printerName: p.name,
    printer: p,
    requestedAt: new Date().toISOString(),
    status: 'pending',
    retryCount: 0,
    origin,
    payload: { html, rawBase64, copies, openDrawer, docRef },
  }
  jobs.unshift(job)
  return publicJob(await runJob(job, p))
}

async function retryJob(id, printerOverride) {
  const job = jobs.find((j) => j.id === id)
  if (!job) throw new PrintError('BAD_REQUEST', 'Print job not found')
  if (!job.payload) throw new PrintError('BAD_REQUEST', 'This job can no longer be retried')
  const p = normalizePrinter(printerOverride || job.printer)
  validatePrinter(p)
  job.printer = p
  job.printerId = p.id || job.printerId
  job.printerName = p.name
  job.retryCount = (job.retryCount || 0) + 1
  return publicJob(await runJob(job, p))
}

function cancelJob(id) {
  const job = jobs.find((j) => j.id === id)
  if (!job) throw new PrintError('BAD_REQUEST', 'Print job not found')
  if (job.status === 'failed' || job.status === 'pending') {
    job.status = 'cancelled'
    job.payload = undefined
    saveJobs()
    emitChange()
  }
  return publicJob(job)
}

function lastJob() {
  const j = jobs.find((x) => x.status === 'printed' || x.status === 'failed')
  return j ? publicJob(j) : null
}

// ---------- POS connection + change events ----------
let posSeenAt = 0
function markPosSeen() {
  posSeenAt = Date.now()
}
function posConnected() {
  return Date.now() - posSeenAt < 90000
}

const listeners = new Set()
function onChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
let changeTimer = null
function emitChange() {
  if (changeTimer) return
  changeTimer = setTimeout(() => {
    changeTimer = null
    for (const fn of listeners) {
      try {
        fn()
      } catch {
        /* ignore */
      }
    }
  }, 50)
}

function snapshot() {
  return {
    agent: 'isarva-print-agent',
    version: app.getVersion(),
    port: getConfig().port,
    startWithWindows: getConfig().startWithWindows,
    allowedOrigins: getConfig().allowedOrigins,
    posConnected: posConnected(),
    posSeenAt: posSeenAt ? new Date(posSeenAt).toISOString() : null,
    printers: printers.map((p) => ({
      id: p.id,
      name: p.name,
      connection: p.connection,
      device: p.connection === 'usb' ? p.deviceName : `${p.host}:${p.port}`,
      active: p.active,
      ...(health.get(p.id) || { state: p.active ? 'connecting' : 'disabled' }),
    })),
    lastJob: lastJob(),
    failedJobs: jobs.filter((j) => j.status === 'failed').length,
  }
}

function init() {
  loadConfig()
  loadPrinters()
  loadJobs()
  pruneLogs()
}

module.exports = {
  init,
  log,
  logsDir,
  getConfig,
  saveConfig,
  getPrinters,
  syncPrinters,
  normalizePrinter,
  validatePrinter,
  printerHealth,
  refreshHealth,
  windowsPrintersCached,
  submitJob,
  retryJob,
  cancelJob,
  listJobs,
  markPosSeen,
  onChange,
  snapshot,
  PrintError,
}
