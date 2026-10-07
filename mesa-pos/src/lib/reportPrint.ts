import { printBrowserDocument } from '../hardware/printer'

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #12201c;
    font: 12.5px/1.45 "Source Sans 3", "Segoe UI", system-ui, sans-serif;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 750;
    letter-spacing: -0.02em;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 750;
  }
  h3 {
    margin: 1rem 0 0.4rem;
    font-size: 13px;
    font-weight: 750;
  }
  p { margin: 0.25rem 0 0; color: #5f7169; }
  .sheet { padding: 0; }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
    padding-bottom: 0.75rem;
    margin-bottom: 0.85rem;
    border-bottom: 1px solid #d5ddd8;
  }
  .range {
    font-weight: 700;
    color: #1f6b5c;
    white-space: nowrap;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.45rem;
    margin-bottom: 0.9rem;
  }
  .metric {
    border: 1px solid #d5ddd8;
    border-radius: 10px;
    padding: 0.55rem 0.65rem;
    break-inside: avoid;
  }
  .metric span {
    display: block;
    font-size: 10.5px;
    font-weight: 650;
    color: #5f7169;
    margin-bottom: 0.2rem;
  }
  .metric strong {
    font-size: 13.5px;
    font-weight: 750;
  }
  .tone-rose strong { color: #b42318; }
  .tone-teal strong, .tone-lime strong { color: #1f6b5c; }
  .tone-violet strong { color: #6b4f9a; }
  .tone-ocean strong { color: #1a6b8a; }
  .tone-amber strong { color: #b7791f; }
  .panel { margin-top: 0.35rem; }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    margin: 0.2rem 0 0.45rem;
  }
  .muted { color: #5f7169; font-size: 11.5px; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
  }
  th, td {
    border-bottom: 1px solid #e3ebe6;
    padding: 0.38rem 0.45rem;
    text-align: start;
    vertical-align: top;
  }
  th {
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #5f7169;
    font-weight: 750;
  }
  td:last-child, th:last-child { text-align: end; }
  tbody tr:nth-child(even) { background: #f7faf8; }
  .mesa-ltr-nums { unicode-bidi: isolate; direction: ltr; }
  .rpt-pill {
    display: inline-block;
    margin-inline-start: 0.35rem;
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    font-size: 10px;
    font-style: normal;
    font-weight: 700;
    background: #f6e7c8;
    color: #b7791f;
  }
  .no-print, button, input, label, .rpt-toolbar, .rpt-pager, .rpt-back, .rpt-hero-actions {
    display: none !important;
  }
  svg { width: 18px; height: 18px; }
`

export type ReportPrintOpts = {
  title: string
  subtitle?: string
  rangeLabel: string
  /** Element that contains .rpt-metrics + .rpt-body (or the whole .rpt-page). */
  source: HTMLElement
  dir?: 'ltr' | 'rtl'
  lang?: string
}

/** Clone report DOM into a clean iframe document and print (avoids blank app-shell prints). */
export async function printReportFromElement(opts: ReportPrintOpts): Promise<{ ok: boolean }> {
  const clone = opts.source.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.no-print, button, input, .rpt-toolbar, .rpt-pager, .rpt-back, .rpt-hero-actions').forEach((el) => {
    el.remove()
  })

  const metrics = clone.querySelector('.rpt-metrics')
  const body = clone.querySelector('.rpt-body')
  const metricsHtml = metrics?.outerHTML ?? ''
  const bodyHtml = body?.innerHTML ?? clone.innerHTML

  const title = escapeHtml(opts.title)
  const subtitle = opts.subtitle ? `<p>${escapeHtml(opts.subtitle)}</p>` : ''
  const range = escapeHtml(opts.rangeLabel)
  const dir = opts.dir === 'rtl' ? 'rtl' : 'ltr'
  const lang = escapeHtml(opts.lang || (dir === 'rtl' ? 'ar' : 'en'))

  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>${PRINT_CSS}
  .rpt-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.45rem; margin-bottom: 0.9rem; }
  .rpt-metric { border: 1px solid #d5ddd8; border-radius: 10px; padding: 0.55rem 0.65rem; break-inside: avoid; }
  .rpt-metric span { display: block; font-size: 10.5px; font-weight: 650; color: #5f7169; margin-bottom: 0.2rem; }
  .rpt-metric strong { font-size: 13.5px; font-weight: 750; }
  .rpt-panel-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; margin: 0.2rem 0 0.45rem; }
  .rpt-muted, .rpt-cogs-hint, .rpt-panel-lead { color: #5f7169; font-size: 11.5px; }
  .rpt-subhead { margin: 1rem 0 0.4rem; font-size: 13px; font-weight: 750; }
  .rpt-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .rpt-table th, .rpt-table td { border-bottom: 1px solid #e3ebe6; padding: 0.38rem 0.45rem; text-align: start; vertical-align: top; }
  .rpt-table th { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7169; font-weight: 750; }
  .rpt-table td:last-child, .rpt-table th:last-child { text-align: end; }
  .rpt-table tbody tr:nth-child(even) { background: #f7faf8; }
  .rpt-empty { padding: 1rem 0; color: #5f7169; }
  .rpt-table-block, .rpt-table-wrap { overflow: visible !important; }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="head">
      <div>
        <h1>${title}</h1>
        ${subtitle}
      </div>
      <div class="range mesa-ltr-nums">${range}</div>
    </header>
    ${metricsHtml}
    <div class="panel">${bodyHtml}</div>
  </div>
</body>
</html>`

  return printBrowserDocument(html, { widthMm: 210 })
}
