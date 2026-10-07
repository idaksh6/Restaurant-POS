/** HTML slip → 1-bit raster → ESC/POS bytes (GS v 0). Works for Arabic + QR on any ESC/POS printer. */
const { BrowserWindow, session } = require('electron')

const ESC = 0x1b
const GS = 0x1d

/** Printable dots per line at 203 dpi (80 mm paper → 72 mm printable, 58 mm → 48 mm). */
function printableDots(paperWidthMm) {
  return Number(paperWidthMm) <= 58 ? 384 : 576
}

let renderSession = null
function isolatedSession() {
  if (renderSession) return renderSession
  renderSession = session.fromPartition('isarva-render')
  // Slips must be self-contained (data: images only) — never fetch from the network.
  renderSession.webRequest.onBeforeRequest((details, callback) => {
    const ok = /^(data|about|blob):/i.test(details.url)
    callback({ cancel: !ok })
  })
  return renderSession
}

async function renderHtmlToBitmap(html, paperWidthMm) {
  const dots = printableDots(paperWidthMm)
  const cssWidthPx = Math.round((Number(paperWidthMm || 80) * 96) / 25.4)
  let zoom = dots / cssWidthPx
  const win = new BrowserWindow({
    show: false,
    width: dots,
    height: 600,
    useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      session: isolatedSession(),
    },
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const dbg = win.webContents.debugger
    try {
      dbg.attach('1.3')
      await dbg.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })
    } catch {
      /* screen media fallback */
    }
    await win.webContents.insertCSS(
      'html, body { overflow: hidden !important; } ::-webkit-scrollbar { display: none !important; }',
    )
    // setZoomFactor applies asynchronously (slower without a GPU): wait until the viewport reflects it.
    const measure = (expectedVw) =>
      win.webContents.executeJavaScript(`
        (async () => {
          await Promise.all(Array.from(document.images).map((img) => img.complete ? null :
            new Promise((r) => { img.onload = r; img.onerror = r })));
          if (document.fonts && document.fonts.ready) await document.fonts.ready;
          for (let i = 0; i < 40 && Math.abs(window.innerWidth - ${expectedVw}) > 1; i += 1) {
            await new Promise((r) => setTimeout(r, 25));
          }
          await new Promise((r) => requestAnimationFrame(() => r()));
          const d = document.documentElement, b = document.body || d;
          const vw = window.innerWidth;
          let left = 0, right = vw;
          for (const el of document.body ? document.body.querySelectorAll('*') : []) {
            const r = el.getBoundingClientRect();
            if (!r.width) continue;
            if (r.left < left) left = r.left;
            if (r.right > right) right = r.right;
          }
          const br = b.getBoundingClientRect();
          left = Math.min(left, br.left); right = Math.max(right, br.right);
          return {
            w: Math.ceil(Math.max(d.scrollWidth, b.scrollWidth, right - left)),
            h: Math.ceil(Math.max(d.scrollHeight, b.scrollHeight)),
            vw,
            shift: left < 0 ? Math.ceil(-left) : 0,
          };
        })()
      `)
    win.webContents.setZoomFactor(zoom)
    let m = await measure(Math.round(dots / zoom))
    // Slip wider than the paper (e.g. padding on a fixed-width body): shrink to fit instead of clipping.
    if (m.w > m.vw + 1) {
      zoom = (zoom * m.vw) / m.w
      win.webContents.setZoomFactor(zoom)
      m = await measure(Math.round(dots / zoom))
    }
    if (m.shift > 0) {
      // RTL content overflowing to the left: scroll it into view instead of losing the start of each line.
      await win.webContents.executeJavaScript(`window.scrollTo(-${m.shift}, 0); document.documentElement.scrollLeft = -${m.shift};`)
    }
    const height = Math.min(16000, Math.max(80, Math.ceil(m.h * zoom) + 8))
    win.setContentSize(dots, height)
    await new Promise((r) => setTimeout(r, 150))
    let image = await win.webContents.capturePage({ x: 0, y: 0, width: dots, height })
    const size = image.getSize()
    if (size.width !== dots) image = image.resize({ width: dots, quality: 'best' })
    const { width, height: h } = image.getSize()
    return { width, height: h, bgra: image.toBitmap() }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

/** BGRA → packed 1-bit rows (MSB first), trailing blank rows trimmed. */
function toMonochrome({ width, height, bgra }, threshold = 165) {
  const bytesPerRow = Math.ceil(width / 8)
  const rows = Buffer.alloc(bytesPerRow * height)
  let lastInk = -1
  for (let y = 0; y < height; y += 1) {
    let rowHasInk = false
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const a = bgra[i + 3] / 255
      const lum = (0.114 * bgra[i] + 0.587 * bgra[i + 1] + 0.299 * bgra[i + 2]) * a + 255 * (1 - a)
      if (lum < threshold) {
        rows[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7)
        rowHasInk = true
      }
    }
    if (rowHasInk) lastInk = y
  }
  const keep = Math.min(height, lastInk + 1 + 16)
  return { bytesPerRow, height: Math.max(1, keep), rows: rows.subarray(0, bytesPerRow * Math.max(1, keep)) }
}

function rasterCommands(mono, bandRows = 128) {
  const parts = []
  for (let y = 0; y < mono.height; y += bandRows) {
    const h = Math.min(bandRows, mono.height - y)
    parts.push(
      Buffer.from([GS, 0x76, 0x30, 0x00, mono.bytesPerRow & 0xff, mono.bytesPerRow >> 8, h & 0xff, h >> 8]),
      mono.rows.subarray(y * mono.bytesPerRow, (y + h) * mono.bytesPerRow),
    )
  }
  return Buffer.concat(parts)
}

/** Full job: init → raster → feed → optional cut / cash drawer. */
function buildEscPosJob(mono, { autoCut = true, openDrawer = false, copies = 1 } = {}) {
  const one = Buffer.concat([
    Buffer.from([ESC, 0x40]),
    rasterCommands(mono),
    Buffer.from([ESC, 0x64, 0x04]),
    autoCut ? Buffer.from([GS, 0x56, 0x42, 0x00]) : Buffer.alloc(0),
  ])
  const drawer = openDrawer ? Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]) : Buffer.alloc(0)
  return Buffer.concat([drawer, ...Array.from({ length: Math.max(1, copies) }, () => one)])
}

async function htmlToEscPos(html, opts = {}) {
  const bitmap = await renderHtmlToBitmap(html, opts.paperWidthMm ?? 80)
  const mono = toMonochrome(bitmap)
  return { data: buildEscPosJob(mono, opts), mono }
}

module.exports = { htmlToEscPos, renderHtmlToBitmap, toMonochrome, buildEscPosJob, printableDots }
