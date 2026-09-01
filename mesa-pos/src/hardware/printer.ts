/** Receipt / KOT print bridge — uses branch print stations when set. */

import {
  normalizeTemplateId,
  thermalTemplateCss,
  type PrintTemplateId,
} from '../data/printTemplates'
import { kotStation, loadAllPrinters, receiptStation, type PrintStation } from '../data/printers'
import { activeLang, messages, type Lang } from '../locale/i18n'
import { money } from '../locale/saudi'

export type PrintJob = {
  type: 'receipt' | 'kot' | 'temp-bill'
  title: string
  lines: string[]
  footer?: string
  target?: string
  copies?: number
  paperWidthMm?: number
  templateId?: PrintTemplateId
  /** Structured receipt body — preferred over plain `lines` for guest/paid slips. */
  bodyHtml?: string
  lang?: Lang
}

export type PrintRow = {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}

export type ReceiptSlip = {
  brand: string
  meta: string[]
  /** Optional parallel RTL / Arabic meta lines (bilingual template). */
  metaAr?: string[]
  tag?: string
  items: PrintRow[]
  totals: PrintRow[]
  footer?: string
  paperWidthMm?: number
  templateId?: PrintTemplateId
  type?: PrintJob['type']
  /** UI / slip language — drives dir and bilingual secondary line. */
  lang?: Lang
}

export type OsPrinter = {
  name: string
  displayName: string
  isDefault?: boolean
  status?: number
}

type MesaPrintBridge = {
  mesaPrint?: (payload: PrintJob & { html?: string }) => Promise<{ ok?: boolean } | void>
  mesaListPrinters?: () => Promise<OsPrinter[]>
}

function mesaBridge(): MesaPrintBridge {
  return window as unknown as MesaPrintBridge
}

export function hasNativePrintBridge() {
  return typeof mesaBridge().mesaPrint === 'function'
}

export async function listOsPrinters(): Promise<OsPrinter[]> {
  const list = mesaBridge().mesaListPrinters
  if (typeof list !== 'function') return []
  try {
    const rows = await list()
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function clampPaperWidthMm(value?: number) {
  return Math.max(48, Math.min(120, Number(value) || 80))
}

function applyStation(job: PrintJob, station?: PrintStation): PrintJob {
  const kind = job.type === 'kot' ? 'kot' : 'receipt'
  if (!station) {
    return {
      ...job,
      paperWidthMm: clampPaperWidthMm(job.paperWidthMm),
      templateId: normalizeTemplateId(job.templateId, kind),
    }
  }
  return {
    ...job,
    footer: job.footer || station.footer || undefined,
    target: station.target,
    copies: station.copies,
    paperWidthMm: clampPaperWidthMm(station.paperWidthMm ?? job.paperWidthMm),
    templateId: normalizeTemplateId(job.templateId ?? station.templateId, kind),
  }
}

export function receiptPrintJob(job: Omit<PrintJob, 'type'> & { type?: PrintJob['type'] }): PrintJob {
  return applyStation({ ...job, type: job.type ?? 'receipt' }, receiptStation(loadAllPrinters()))
}

export function kotPrintJob(job: Omit<PrintJob, 'type'>, departmentId?: string): PrintJob {
  return applyStation({ ...job, type: 'kot' }, kotStation(loadAllPrinters(), departmentId))
}

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function rowHtml(row: PrintRow) {
  const cls = ['row', row.strong ? 'strong' : '', row.muted ? 'muted' : ''].filter(Boolean).join(' ')
  return `<div class="${cls}"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.value)}</span></div>`
}

/** Designed thermal slip markup (inner body only). */
export function receiptSlipBodyHtml(slip: ReceiptSlip) {
  const templateId = normalizeTemplateId(slip.templateId, slip.type === 'kot' ? 'kot' : 'receipt')
  const lang = slip.lang ?? activeLang()
  const meta = slip.meta
    .filter(Boolean)
    .map((line) => `<p class="meta">${escapeHtml(line)}</p>`)
    .join('')
  const metaAr = (slip.metaAr || [])
    .filter(Boolean)
    .map((line) => `<p class="meta ar">${escapeHtml(line)}</p>`)
    .join('')
  const tag = slip.tag ? `<div class="tag">${escapeHtml(slip.tag)}</div>` : ''
  const items = slip.items.map(rowHtml).join('')
  const totals = slip.totals.map(rowHtml).join('')
  const thanksEn = messages('en').printThanks
  const thanksAr = messages('ar').printThanks
  const thanksPrimary = lang === 'ar' ? thanksAr : thanksEn
  const thanksSecondary = lang === 'ar' ? thanksEn : thanksAr
  const rawFooter = String(slip.footer ?? '').trim()
  const isDefaultThanks =
    !rawFooter ||
    rawFooter === thanksEn ||
    rawFooter === thanksAr ||
    rawFooter === 'Thank you — visit again' ||
    rawFooter === 'شكراً لزيارتكم'
  const footer =
    templateId === 'bilingual'
      ? `<p class="thanks">${escapeHtml(isDefaultThanks ? thanksPrimary : rawFooter)}<br/><span class="ar">${escapeHtml(thanksSecondary)}</span></p>`
      : rawFooter
        ? `<p class="thanks">${escapeHtml(isDefaultThanks ? thanksPrimary : rawFooter)}</p>`
        : ''
  const rules =
    templateId === 'brand'
      ? `<div class="rule"></div><div class="rule"></div>`
      : `<div class="rule"></div>`
  return `
    <header class="head">
      <div class="brand">${escapeHtml(slip.brand)}</div>
      ${meta}
      ${metaAr}
      ${tag}
    </header>
    ${rules}
    <section class="items">${items}</section>
    ${rules}
    <section class="totals">${totals}</section>
    ${footer}
  `
}

/** Chrome ignores `size: 80mm auto` and falls back to A4 — use a fixed height. */
function paperHeightMm(job: PrintJob) {
  const rows = job.bodyHtml?.match(/class="row"/g)?.length ?? 0
  const lines = job.lines?.length ?? 0
  const units = rows > 0 ? rows + 8 : lines + 6
  const widthFactor = clampPaperWidthMm(job.paperWidthMm) / 80
  return Math.max(140, Math.min(560, Math.round((55 + units * 10) * Math.max(0.85, widthFactor))))
}

function thermalShellCss(widthMm: number, heightMm: number, templateId: PrintTemplateId) {
  const width = `${widthMm}mm`
  const height = `${heightMm}mm`
  return `
  /* Fixed height required — "auto" makes Chromium fall back to A4 */
  @page { size: ${width} ${height}; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${width};
    min-width: ${width};
    max-width: ${width};
    background: #fff;
    color: #111;
  }
  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 12.5px;
    line-height: 1.4;
    padding: 4mm 3mm 5mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .slip { width: 100%; }
  .paper-tag { display: none; }
  @media screen {
    body {
      margin: 12px auto;
      border: 1px dashed #999;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }
    .paper-tag {
      display: block;
      text-align: center;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #666;
      margin: 0 0 8px;
      text-transform: uppercase;
    }
  }
  .head { text-align: center; margin-bottom: 8px; }
  .brand {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0 0 6px;
  }
  .meta { margin: 2px 0; color: #333; font-size: 11.5px; }
  .tag {
    display: inline-block;
    margin-top: 8px;
    padding: 3px 8px;
    border: 1.5px solid #111;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .rule { border: 0; border-top: 1.5px dashed #222; margin: 8px 0; }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin: 4px 0;
  }
  .row span:first-child { flex: 1; min-width: 0; word-break: break-word; }
  .row span:last-child {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .row.strong {
    font-weight: 800;
    font-size: 14px;
    margin-top: 6px;
    padding-top: 4px;
    border-top: 1px solid #111;
  }
  .row.muted { color: #444; font-size: 11.5px; }
  .thanks { margin: 12px 0 0; text-align: center; font-size: 11.5px; color: #222; }
  .kot-line {
    margin: 3px 0;
    font-family: "Courier New", ui-monospace, Consolas, monospace;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  ${thermalTemplateCss(templateId, widthMm)}
`
}

/** Full HTML document for thermal / browser print. */
export function browserPrintHtml(job: PrintJob & { lang?: Lang }) {
  const widthMm = clampPaperWidthMm(job.paperWidthMm)
  const heightMm = paperHeightMm(job)
  const templateId = normalizeTemplateId(job.templateId, job.type === 'kot' ? 'kot' : 'receipt')
  const lang = job.lang ?? activeLang()
  const title = escapeHtml(job.title || messages(lang).printReceipt)
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const body =
    job.bodyHtml?.trim() ||
    `
      <header class="head"><div class="brand">${title}</div></header>
      <div class="rule"></div>
      ${(job.lines || [])
        .map((line) => `<div class="kot-line">${escapeHtml(String(line))}</div>`)
        .join('')}
      ${job.footer ? `<p class="thanks">${escapeHtml(job.footer)}</p>` : ''}
    `

  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${title} · ${widthMm}mm</title>
<style>${thermalShellCss(widthMm, heightMm, templateId)}</style></head>
<body class="tpl-${templateId}" dir="${dir}">
  <div class="paper-tag">${widthMm}mm · ${templateId} template</div>
  <div class="slip">${body}</div>
</body></html>`
}

/** Live preview HTML for Printer settings (screen only). */
export function previewSlipHtml(opts: {
  brand: string
  footer?: string
  paperWidthMm?: number
  templateId?: PrintTemplateId
  kind?: 'receipt' | 'kot'
  lang?: Lang
}) {
  const kind = opts.kind ?? 'receipt'
  const widthMm = clampPaperWidthMm(opts.paperWidthMm)
  const templateId = normalizeTemplateId(opts.templateId, kind)
  const lang = opts.lang ?? activeLang()
  const copy = messages(lang)
  const other = messages(lang === 'ar' ? 'en' : 'ar')
  const slip: ReceiptSlip = {
    brand: opts.brand || 'MESA',
    meta: [copy.printSampleTable, copy.printSampleMeta],
    metaAr:
      templateId === 'bilingual'
        ? [other.printSampleTable, other.printSampleMeta]
        : undefined,
    tag: kind === 'kot' ? undefined : copy.printSampleCheck,
    items: [
      {
        label:
          templateId === 'bilingual'
            ? `1× Hummus / حمص`
            : lang === 'ar'
              ? '1× حمص'
              : '1× Hummus',
        value: money(18, lang),
      },
      {
        label:
          templateId === 'bilingual'
            ? `2× Fattoush / فتوش`
            : lang === 'ar'
              ? '2× فتوش'
              : '2× Fattoush',
        value: money(44, lang),
      },
    ],
    totals: [
      { label: copy.printGoods, value: money(62, lang), muted: true },
      { label: copy.vat, value: money(9.3, lang), muted: true },
      { label: copy.total, value: money(71.3, lang), strong: true },
    ],
    footer: opts.footer || copy.printThanks,
    templateId,
    type: kind === 'kot' ? 'kot' : 'receipt',
    paperWidthMm: widthMm,
    lang,
  }
  const body = receiptSlipBodyHtml(slip)
  const heightMm = Math.max(160, Math.round(widthMm * 2.2))
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><style>
${thermalShellCss(widthMm, heightMm, templateId)}
html, body { background: transparent !important; }
@media screen {
  body { margin: 0 auto; border: 1px solid #c5d0c8; box-shadow: none; }
  .paper-tag { display: none; }
}
</style></head><body class="tpl-${templateId}" dir="${dir}"><div class="slip">${body}</div></body></html>`
}

export function receiptSlipToJob(slip: ReceiptSlip): PrintJob {
  const lang = slip.lang ?? activeLang()
  return receiptPrintJob({
    type: slip.type ?? 'receipt',
    title: slip.brand,
    lines: [],
    footer: slip.footer,
    paperWidthMm: slip.paperWidthMm,
    templateId: slip.templateId,
    bodyHtml: receiptSlipBodyHtml({ ...slip, lang }),
    lang,
  })
}

function printHtmlHidden(html: string, widthMm: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('title', `mesa-print-${widthMm}mm`)
    frame.setAttribute('aria-hidden', 'true')
    // Real size off-screen — 0×0 iframes often print blank in Chrome.
    const px = Math.round((widthMm * 96) / 25.4)
    frame.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:0',
      `width:${px}px`,
      'height:1200px',
      'border:0',
      'opacity:0',
      'pointer-events:none',
    ].join(';')
    document.body.appendChild(frame)

    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc) {
      frame.remove()
      reject(new Error('print frame unavailable'))
      return
    }

    let settled = false
    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(safetyTimer)
      try {
        frame.remove()
      } catch {
        /* ignore */
      }
      if (err) reject(err)
      else resolve()
    }

    // Only remove after the dialog is done — never while preview is open.
    const safetyTimer = window.setTimeout(() => finish(), 10 * 60_000)

    const runPrint = () => {
      try {
        const onAfter = () => {
          win.removeEventListener('afterprint', onAfter)
          finish()
        }
        win.addEventListener('afterprint', onAfter)
        win.focus()
        win.print()
      } catch (err) {
        finish(err instanceof Error ? err : new Error('print failed'))
      }
    }

    doc.open()
    doc.write(html)
    doc.close()

    // Wait a tick so layout + @page size are applied before Chrome snapshots.
    // Also wait for embedded images (logo data URLs) before printing.
    const imgs = Array.from(doc.images)
    const ready = imgs.length
      ? Promise.all(
          imgs.map(
            (img) =>
              img.complete
                ? Promise.resolve()
                : new Promise<void>((res) => {
                    img.addEventListener('load', () => res(), { once: true })
                    img.addEventListener('error', () => res(), { once: true })
                  }),
          ),
        )
      : Promise.resolve()

    void ready.then(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(runPrint, 80)
      })
    })
  })
}

/** Print an arbitrary HTML document via the same iframe path as receipts (avoids blank popups). */
export async function printBrowserDocument(
  html: string,
  opts?: { widthMm?: number },
): Promise<{ ok: boolean }> {
  try {
    await printHtmlHidden(html, opts?.widthMm ?? 210)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function printEscPos(job: PrintJob): Promise<{ ok: boolean; mode: string }> {
  const prepared: PrintJob = {
    ...job,
    paperWidthMm: clampPaperWidthMm(job.paperWidthMm),
    copies: Math.max(1, job.copies ?? 1),
    lang: job.lang ?? activeLang(),
  }
  const copies = prepared.copies ?? 1
  const html = browserPrintHtml(prepared)
  const bridge = mesaBridge().mesaPrint

  if (typeof bridge === 'function') {
    try {
      await bridge({
        ...prepared,
        copies,
        html,
        bodyHtml: prepared.bodyHtml,
      })
      const target = (prepared.target || 'browser').trim()
      return {
        ok: true,
        mode: target && target.toLowerCase() !== 'browser' ? target : 'bridge',
      }
    } catch {
      /* fall through to browser print */
    }
  }

  try {
    for (let i = 0; i < copies; i += 1) {
      await printHtmlHidden(html, prepared.paperWidthMm ?? 80)
    }
    return { ok: true, mode: 'iframe.print' }
  } catch {
    return { ok: false, mode: 'blocked' }
  }
}
