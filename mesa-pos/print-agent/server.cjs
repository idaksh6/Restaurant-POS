/** Local HTTP API — bound to 127.0.0.1 only, browser callers limited to allowed origins. */
const http = require('node:http')
const core = require('./core.cjs')
const { windowsHealth } = require('./printers.cjs')
const { testSlipHtml } = require('./testSlip.cjs')

const MAX_BODY = 6 * 1024 * 1024

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new core.PrintError('BAD_REQUEST', 'Request too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new core.PrintError('BAD_REQUEST', 'Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function originAllowed(origin) {
  if (!origin) return true
  return core.getConfig().allowedOrigins.some((o) => o.replace(/\/+$/, '') === origin)
}

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(body))
}

function fail(res, err, origin) {
  const code = err && err.code ? err.code : 'AGENT_ERROR'
  const status = code === 'BAD_REQUEST' ? 400 : 200
  if (code === 'AGENT_ERROR') core.log('error', `request failed: ${err && err.stack ? err.stack : err}`)
  send(res, status, { ok: false, error: { code, message: err && err.message ? err.message : 'Agent error' } }, origin)
}

const DOC_ROUTES = { '/print/kot': 'kot', '/print/bill': 'bill', '/print/receipt': 'receipt', '/print': null }

async function route(req, res, origin) {
  const url = new URL(req.url, 'http://127.0.0.1')
  const p = url.pathname.replace(/\/+$/, '') || '/'

  if (req.method === 'GET' && (p === '/status' || p === '/')) {
    return send(res, 200, { ok: true, ...core.snapshot() }, origin)
  }
  if (req.method === 'GET' && p === '/printers') {
    return send(res, 200, { ok: true, printers: core.snapshot().printers }, origin)
  }
  if (req.method === 'GET' && p === '/printers/system') {
    const list = await core.windowsPrintersCached(0)
    return send(
      res,
      200,
      {
        ok: true,
        printers: list.map(({ raw, ...w }) => ({ ...w, ...healthBrief({ ...w, raw }) })),
      },
      origin,
    )
  }
  if (req.method === 'GET' && p === '/jobs') {
    return send(res, 200, { ok: true, jobs: core.listJobs(Number(url.searchParams.get('limit')) || 100) }, origin)
  }
  if (req.method !== 'POST') return send(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }, origin)

  const body = await readBody(req)

  if (p === '/printers/sync') {
    const list = core.syncPrinters(body.printers)
    return send(res, 200, { ok: true, count: list.length }, origin)
  }
  if (p === '/printers/status') {
    const targets = Array.isArray(body.printers) ? body.printers.map(core.normalizePrinter) : core.getPrinters()
    const results = await Promise.all(
      targets.map(async (pr) => {
        try {
          core.validatePrinter(pr)
          return { id: pr.id, ...(await core.printerHealth(pr, { fresh: true })) }
        } catch (e) {
          return { id: pr.id, state: 'error', code: e.code || 'PRINTER_ERROR', detail: e.message }
        }
      }),
    )
    return send(res, 200, { ok: true, printers: results }, origin)
  }
  if (p === '/connection/test') {
    const pr = core.normalizePrinter({ connection: 'lan', ...body })
    core.validatePrinter(pr)
    const h = await core.printerHealth(pr, { fresh: true })
    return send(res, 200, { ok: h.state === 'online', ...h }, origin)
  }
  if (p === '/print/test') {
    const job = await core.submitJob({
      printer: body.printer,
      docType: 'test',
      docRef: 'Test print',
      html: body.html || testSlipHtml(core.normalizePrinter(body.printer || {})),
      copies: 1,
      origin,
    })
    return send(res, 200, { ok: job.status === 'printed', job, error: job.error }, origin)
  }
  if (p === '/print/raw') {
    if (!body.rawBase64) throw new core.PrintError('BAD_REQUEST', 'rawBase64 is required')
    const job = await core.submitJob({ ...body, docType: 'raw', html: undefined, origin })
    return send(res, 200, { ok: job.status === 'printed', job, error: job.error }, origin)
  }
  if (p in DOC_ROUTES) {
    const job = await core.submitJob({ ...body, rawBase64: undefined, docType: DOC_ROUTES[p] || body.docType, origin })
    return send(res, 200, { ok: job.status === 'printed', job, error: job.error }, origin)
  }
  const retry = p.match(/^\/jobs\/([\w-]+)\/retry$/)
  if (retry) {
    const job = await core.retryJob(retry[1], body.printer)
    return send(res, 200, { ok: job.status === 'printed', job, error: job.error }, origin)
  }
  const cancel = p.match(/^\/jobs\/([\w-]+)\/cancel$/)
  if (cancel) return send(res, 200, { ok: true, job: core.cancelJob(cancel[1]) }, origin)

  return send(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }, origin)
}

function healthBrief(w) {
  const h = windowsHealth(w)
  return { state: h.state, detail: h.detail }
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin ? String(req.headers.origin) : ''
    if (!originAllowed(origin)) {
      core.log('warn', `blocked request from origin ${origin} ${req.method} ${req.url}`)
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed' } }))
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      })
      res.end()
      return
    }
    if (origin) core.markPosSeen()
    try {
      await route(req, res, origin)
    } catch (e) {
      fail(res, e, origin)
    }
  })
  server.requestTimeout = 120000
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(core.getConfig().port, '127.0.0.1', () => {
      core.log('info', `listening on 127.0.0.1:${core.getConfig().port}`)
      resolve(server)
    })
  })
}

module.exports = { startServer }
