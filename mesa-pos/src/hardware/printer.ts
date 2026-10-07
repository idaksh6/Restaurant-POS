/** Receipt / KOT print bridge — uses branch print stations when set. */

import {
  normalizeTemplateId,
  thermalTemplateCss,
  type PrintTemplateId,
} from '../data/printTemplates'
import { kotStation, loadAllPrinters, receiptStation, type PrintStation } from '../data/printers'
import { activeLang, messages, type Lang } from '../locale/i18n'
import { money } from '../locale/saudi'
import { agentPrint, friendlyPrintError, usesAgent, type AgentErrorCode } from './printAgent'
import { reportPrintFailure } from './printFailures'

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
  /** Station the job was routed to — agent-backed stations print through the Print Agent. */
  station?: PrintStation
  /** Kick the cash drawer (only if the printer has "Open cash drawer" on) */
  openDrawer?: boolean
}

export type PrintRow = {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
  /** When qty + rate are set, slip uses Item / Qty / Rate / Total columns. */
  qty?: string
  rate?: string
  isHeader?: boolean
  /** Optional Arabic name rendered under the English item label. */
  labelAr?: string
  /** Bill total row — dashed rule above, semi-bold (matches the on-screen receipt). */
  billTotal?: boolean
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
  /** ZATCA Phase 1 QR (data URL) shown under totals on paid receipts */
  qrDataUrl?: string
  qrCaption?: string
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
    station,
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

/** Job bound to an already-routed printer. */
export function stationPrintJob(job: PrintJob, station: PrintStation | undefined): PrintJob {
  return applyStation(job, station)
}

const FONT_SCALE = { small: 0.88, medium: 1, large: 1.18 } as const

/** Per-printer font size / header alignment from the printer settings. */
function stationOptionsCss(station?: PrintStation) {
  if (!station) return ''
  const scale = FONT_SCALE[station.options.fontSize] ?? 1
  const zoom =
    scale === 1 ? '' : `.slip { zoom: ${scale}; width: calc(100% / ${scale}); }`
  const align = station.options.align === 'center' ? '' : `.head { text-align: ${station.options.align}; }`
  return `${zoom}\n${align}`
}

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function rowHtml(row: PrintRow) {
  const cls = [
    'row',
    row.qty != null && row.rate != null ? 'cols' : '',
    row.strong ? 'strong' : '',
    row.muted ? 'muted' : '',
    row.isHeader ? 'head-row' : '',
    row.billTotal ? 'bill-total' : '',
  ]
    .filter(Boolean)
    .join(' ')
  if (row.qty != null && row.rate != null) {
    const itemLabel = row.labelAr
      ? `${escapeHtml(row.label)}<br/><span class="ar item-ar">${escapeHtml(row.labelAr)}</span>`
      : escapeHtml(row.label)
    return `<div class="${cls}"><span class="c-item">${itemLabel}</span><span class="c-qty">${escapeHtml(row.qty)}</span><span class="c-rate">${escapeHtml(row.rate)}</span><span class="c-total">${escapeHtml(row.value)}</span></div>`
  }
  return `<div class="${cls}"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.value)}</span></div>`
}

/** Designed thermal slip markup (inner body only). */
export function receiptSlipBodyHtml(slip: ReceiptSlip) {
  const templateId = normalizeTemplateId(slip.templateId, slip.type === 'kot' ? 'kot' : 'receipt')
  const lang = slip.lang ?? activeLang()
  const meta = slip.meta
    .filter(Boolean)
    .map((line) => {
      const strong = /^(Bill No|رقم الفاتورة)\b/i.test(line)
      const vat = /^(VAT No|الرقم الضريبي)\b/i.test(line) || /فاتورة ضريبية|Simplified Tax Invoice/i.test(line)
      const row = line.includes('   ') && /:/.test(line)
      // Table line sits flush-left like the on-screen receipt
      const left = !row && /^(Table|الطاولة)\s*:/i.test(line)
      const cls = [
        'meta',
        strong ? 'strong' : '',
        vat ? 'vat' : '',
        row ? 'meta-row' : '',
        left ? 'meta-left' : '',
      ]
        .filter(Boolean)
        .join(' ')
      if (row) {
        const [left, right] = line.split(/\s{3,}/)
        return `<p class="${cls}"><span>${escapeHtml(left || '')}</span><span>${escapeHtml(right || '')}</span></p>`
      }
      return `<p class="${cls}">${escapeHtml(line)}</p>`
    })
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
  const qr = slip.qrDataUrl
    ? `<div class="qr-wrap"><img class="qr" src="${escapeHtml(slip.qrDataUrl)}" alt="ZATCA QR" width="120" height="120" />${
        slip.qrCaption ? `<p class="qr-cap">${escapeHtml(slip.qrCaption)}</p>` : ''
      }</div>`
    : ''
  const rules =
    templateId === 'brand'
      ? `<div class="rule"></div><div class="rule"></div>`
      : `<div class="rule"></div>`
  // Column header already draws its own underline (as on screen) — skip the extra rule above it
  const preItemsRule = slip.items.some((r) => r.isHeader) ? '' : rules
  return `
    <header class="head">
      <div class="brand">${escapeHtml(slip.brand)}</div>
      ${meta}
      ${metaAr}
      ${tag}
    </header>
    ${preItemsRule}
    <section class="items">${items}</section>
    ${rules}
    <section class="totals">${totals}</section>
    ${qr}
    ${footer}
  `
}

/** Chrome ignores `size: 80mm auto` and falls back to A4 — use a fixed height. */
function paperHeightMm(job: PrintJob) {
  const rows = job.bodyHtml?.match(/class="row"/g)?.length ?? 0
  const lines = job.lines?.length ?? 0
  const hasQr = Boolean(job.bodyHtml?.includes('class="qr"') || job.bodyHtml?.includes('class="qr-wrap"'))
  const units = rows > 0 ? rows + 8 : lines + 6
  const widthFactor = clampPaperWidthMm(job.paperWidthMm) / 80
  const qrExtra = hasQr ? 62 : 0
  return Math.max(140, Math.min(620, Math.round((55 + units * 10 + qrExtra) * Math.max(0.85, widthFactor))))
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
    font-family: Tahoma, Arial, "Helvetica Neue", sans-serif;
    font-size: 12px;
    line-height: 1.35;
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
  .meta.strong {
    font-weight: 800;
    font-size: 14px;
    letter-spacing: 0.02em;
    margin: 6px 0 2px;
  }
  .meta.meta-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
  }
  .meta.meta-left {
    text-align: left;
    color: #111;
    margin-top: 6px;
  }
  [dir="rtl"] .meta.meta-left { text-align: right; }
  .meta.vat {
    font-weight: 700;
    margin: 4px 0 6px;
  }
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
  .row.cols {
    display: grid;
    grid-template-columns: minmax(0, 1.8fr) 2em 4.4em 4.8em;
    gap: 4px;
    align-items: start;
    line-height: 1.3;
  }
  .row.cols .c-qty,
  .row.cols .c-rate,
  .row.cols .c-total {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .row.cols .c-item {
    min-width: 0;
    word-break: break-word;
    font-size: 11px;
    line-height: 1.3;
  }
  .row.cols .c-item .item-ar,
  .row.cols .c-item .ar {
    display: block;
    margin-top: 1px;
    font-size: 11px;
    font-weight: 400;
    font-family: inherit;
    direction: rtl;
    unicode-bidi: plaintext;
  }
  .meta.ar,
  .thanks .ar {
    font-family: inherit;
    font-weight: 400;
  }
  .row.head-row {
    font-size: 9px;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    color: #333;
    border-bottom: 1px solid #bbb;
    padding-bottom: 2px;
    margin: 2px 0 4px;
  }
  .row.bill-total {
    border-top: 1px dashed #222;
    margin-top: 6px;
    padding-top: 5px;
    font-weight: 600;
  }
  .row span:first-child { flex: 1; min-width: 0; word-break: break-word; }
  .row:not(.cols) span:last-child {
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
  .qr-wrap {
    margin: 10px 0 4px;
    text-align: center;
  }
  .qr-wrap .qr {
    /* Phase 2 QR ≈ 90 modules (+quiet zone): 45mm ≈ 3.7 dots/module on 203dpi paper */
    width: 45mm;
    height: 45mm;
    max-width: 100%;
    image-rendering: pixelated;
    display: inline-block;
  }
  .qr-wrap .qr-cap {
    margin: 4px 0 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #333;
  }
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
<style>${thermalShellCss(widthMm, heightMm, templateId)}
${stationOptionsCss(job.station)}</style></head>
<body class="tpl-${templateId}" dir="${dir}">
  <div class="paper-tag">${widthMm}mm · ${templateId} template</div>
  <div class="slip">${body}</div>
</body></html>`
}

type SampleSlipOpts = {
  brand: string
  footer?: string
  paperWidthMm?: number
  templateId?: PrintTemplateId
  kind?: 'receipt' | 'kot'
  lang?: Lang
}

function sampleSlip(opts: SampleSlipOpts, extra?: { meta?: string[]; tag?: string }): ReceiptSlip {
  const kind = opts.kind ?? 'receipt'
  const widthMm = clampPaperWidthMm(opts.paperWidthMm)
  const templateId = normalizeTemplateId(opts.templateId, kind)
  const lang = opts.lang ?? activeLang()
  const copy = messages(lang)
  const other = messages(lang === 'ar' ? 'en' : 'ar')
  return {
    brand: opts.brand || 'MESA',
    meta: [...(extra?.meta ?? []), copy.printSampleTable, copy.printSampleMeta],
    metaAr:
      templateId === 'bilingual'
        ? [other.printSampleTable, other.printSampleMeta]
        : undefined,
    tag: extra?.tag ?? (kind === 'kot' ? undefined : copy.printSampleCheck),
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
}

/** Live preview HTML for Printer settings (screen only). */
export function previewSlipHtml(opts: SampleSlipOpts) {
  const slip = sampleSlip(opts)
  const widthMm = clampPaperWidthMm(slip.paperWidthMm)
  const templateId = normalizeTemplateId(slip.templateId, opts.kind ?? 'receipt')
  const lang = slip.lang ?? activeLang()
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

/** `station` = routed bill / receipt printer; without it the default receipt printer is used. */
export function receiptSlipToJob(slip: ReceiptSlip, station?: PrintStation): PrintJob {
  const lang = slip.lang ?? activeLang()
  const job: PrintJob = {
    type: slip.type ?? 'receipt',
    title: slip.brand,
    lines: [],
    footer: slip.footer,
    paperWidthMm: slip.paperWidthMm,
    templateId: slip.templateId,
    bodyHtml: receiptSlipBodyHtml({ ...slip, lang }),
    lang,
  }
  return station ? applyStation(job, station) : receiptPrintJob(job)
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

export type PrintResult = {
  ok: boolean
  mode: string
  agentError?: { code: AgentErrorCode; message: string }
  /** Agent print failed and is waiting in the "printer offline" dialog */
  queued?: boolean
}

export async function printEscPos(job: PrintJob, ref?: string): Promise<PrintResult> {
  const prepared: PrintJob = {
    ...job,
    paperWidthMm: clampPaperWidthMm(job.paperWidthMm),
    copies: Math.max(1, job.copies ?? 1),
    lang: job.lang ?? activeLang(),
  }
  const copies = prepared.copies ?? 1
  const html = browserPrintHtml(prepared)
  const { station, ...plain } = prepared

  if (station && usesAgent(station)) {
    const docType = prepared.type === 'kot' ? 'kot' : prepared.type === 'temp-bill' ? 'bill' : 'receipt'
    const label = ref || prepared.title
    const res = await agentPrint(station, { type: docType, html, ref: label, copies, openDrawer: prepared.openDrawer === true })
    if (res.ok) return { ok: true, mode: 'agent' }
    const agentError = res.error ?? res.job?.error ?? { code: 'PRINT_FAILED' as const, message: 'Print failed' }
    reportPrintFailure({
      station,
      docType,
      ref: label,
      html,
      copies,
      openDrawer: prepared.openDrawer === true,
      paperWidthMm: prepared.paperWidthMm ?? 80,
      jobId: res.job?.id,
      error: agentError,
    })
    return { ok: false, mode: 'agent', agentError, queued: true }
  }

  const bridge = mesaBridge().mesaPrint
  if (typeof bridge === 'function') {
    try {
      await bridge({
        ...plain,
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

export type TestPrintResult =
  | { ok: true; mode: 'agent' | 'silent' | 'dialog' | 'pdf' }
  | { ok: false; error: string; hint?: string; code?: AgentErrorCode }

/** One sample slip straight to a station's printer — no fallback, so a failure is reported. */
export async function testPrintStation(station: PrintStation, lang?: Lang): Promise<TestPrintResult> {
  const kind = station.kind === 'kot' ? 'kot' : 'receipt'
  const slipLang = lang ?? activeLang()
  const slip = sampleSlip(
    {
      brand: station.header || station.name || 'MESA',
      footer: station.footer,
      paperWidthMm: station.paperWidthMm,
      templateId: station.templateId,
      kind,
      lang: slipLang,
    },
    {
      tag: 'TEST PRINT',
      meta: [`${station.name} · ${new Date().toLocaleString(slipLang === 'ar' ? 'ar-SA' : 'en-GB')}`],
    },
  )
  const job: PrintJob = {
    type: kind,
    title: slip.brand,
    lines: [],
    bodyHtml: receiptSlipBodyHtml(slip),
    paperWidthMm: clampPaperWidthMm(station.paperWidthMm),
    templateId: normalizeTemplateId(station.templateId, kind),
    target: station.target,
    copies: 1,
    lang: slipLang,
  }
  if (usesAgent(station)) {
    const res = await agentPrint(station, { type: 'test', html: browserPrintHtml(job), ref: 'Test print', copies: 1 })
    if (res.ok) return { ok: true, mode: 'agent' }
    const err = res.error ?? res.job?.error
    const friendly = friendlyPrintError(err, station.name)
    return { ok: false, error: friendly.title, hint: friendly.hint, code: err?.code }
  }
  const target = (station.target || 'browser').trim()
  const bridge = mesaBridge().mesaPrint
  if (typeof bridge === 'function' && target.toLowerCase() !== 'browser') {
    try {
      await bridge({ ...job, html: browserPrintHtml(job) })
      return { ok: true, mode: 'silent' }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      return { ok: false, error: raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '') }
    }
  }
  const res = await printEscPos(job)
  if (!res.ok) return { ok: false, error: 'Print was blocked by the browser' }
  return { ok: true, mode: res.mode === 'bridge' ? 'pdf' : 'dialog' }
}
