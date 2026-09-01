import { printBrowserDocument } from '../hardware/printer'
import { money } from '../locale/saudi'
import type { FoodVoucherCode } from '../data/foodVouchers'

export type FoodVoucherPrintOpts = {
  brandName: string
  brandAr?: string
  logoDataUrl?: string | null
  branchLabel?: string
  title?: string
  lang?: 'en' | 'ar'
}

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Decorative plated-meal illustration (inline SVG — prints reliably). */
function mealArtSvg() {
  return `<svg class="art" viewBox="0 0 220 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="gPlate" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8faf9"/>
      <stop offset="100%" stop-color="#d7ebe4"/>
    </linearGradient>
    <linearGradient id="gFood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#ea580c"/>
    </linearGradient>
    <linearGradient id="gLeaf" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <circle cx="110" cy="128" r="78" fill="url(#gPlate)" opacity="0.95"/>
  <circle cx="110" cy="128" r="62" fill="none" stroke="#0f766e" stroke-width="3" opacity="0.35"/>
  <ellipse cx="110" cy="128" rx="38" ry="28" fill="url(#gFood)"/>
  <path d="M78 118c12-18 28-22 42-8 8 8 6 22-4 28-18 10-38 2-38-20z" fill="#fbbf24" opacity="0.9"/>
  <path d="M118 108c16-6 34 2 36 18 2 14-10 26-24 24-12-2-20-14-12-42z" fill="#ef4444" opacity="0.85"/>
  <path d="M96 142c10 14 28 18 40 8 6-5 4-16-4-20-14-6-30 0-36 12z" fill="#a16207" opacity="0.75"/>
  <path d="M70 96c18-22 40-18 48 2 2 6-2 10-8 8-16-4-28 6-40-10z" fill="url(#gLeaf)"/>
  <path d="M148 88c-8 16-4 30 10 36 6 2 10-2 8-8-6-16 0-30-18-28z" fill="url(#gLeaf)" opacity="0.9"/>
  <g stroke="#0f766e" stroke-width="3.2" stroke-linecap="round" fill="none" opacity="0.55">
    <path d="M42 210v-54"/>
    <path d="M34 156h16"/>
    <path d="M178 156c10 0 16 8 16 18s-6 18-16 18"/>
    <path d="M178 192v18"/>
  </g>
  <text x="110" y="248" text-anchor="middle" fill="#ecfdf5" font-family="Georgia, serif" font-size="15" font-weight="700" letter-spacing="3">MEAL PASS</text>
</svg>`
}

function voucherCardHtml(code: FoodVoucherCode, opts: FoodVoucherPrintOpts, lang: 'en' | 'ar') {
  const brand = escapeHtml(opts.brandName || 'Restaurant')
  const brandAr = opts.brandAr?.trim() ? escapeHtml(opts.brandAr.trim()) : ''
  const name = escapeHtml(code.name)
  const amount = escapeHtml(money(code.amount, lang))
  const expiry = escapeHtml(code.expiryDate)
  const codeVal = escapeHtml(code.code)
  const branch = opts.branchLabel ? escapeHtml(opts.branchLabel) : ''
  const logo = opts.logoDataUrl
    ? `<img class="logo" src="${escapeHtml(opts.logoDataUrl)}" alt="" />`
    : `<div class="logo-fallback">${escapeHtml(brand.slice(0, 2).toUpperCase())}</div>`
  const status =
    code.status === 'used'
      ? `<span class="badge used">${lang === 'ar' ? 'مستخدم' : 'Used'}</span>`
      : `<span class="badge">${lang === 'ar' ? 'صالح' : 'Valid'}</span>`

  return `<article class="card">
  <div class="rail">
    ${mealArtSvg()}
    <div class="rail-fade"></div>
  </div>
  <div class="body">
    <header class="top">
      ${logo}
      <div class="brand-block">
        <strong class="brand">${brand}</strong>
        ${brandAr ? `<em class="brand-ar">${brandAr}</em>` : ''}
        ${branch ? `<span class="branch">${branch}</span>` : ''}
      </div>
      ${status}
    </header>
    <p class="kind">${lang === 'ar' ? 'قسيمة طعام' : 'Food voucher'}</p>
    <h1 class="amount">${amount}</h1>
    <p class="batch">${name}</p>
    <div class="code-box">
      <span class="code-label">${lang === 'ar' ? 'رمز القسيمة' : 'Voucher code'}</span>
      <strong class="code">${codeVal}</strong>
    </div>
    <footer class="foot">
      <span>${lang === 'ar' ? 'ينتهي' : 'Expires'} <b>${expiry}</b></span>
      <span class="hint">${lang === 'ar' ? 'اعرض عند الدفع' : 'Present at payment'}</span>
    </footer>
  </div>
</article>`
}

export function buildFoodVoucherPrintHtml(
  codes: FoodVoucherCode[],
  opts: FoodVoucherPrintOpts,
): string {
  const lang = opts.lang ?? 'en'
  const title = escapeHtml(opts.title || (lang === 'ar' ? 'قسائم الطعام' : 'Food vouchers'))
  const cards = codes.map((c) => voucherCardHtml(c, opts, lang)).join('')

  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #0f172a;
    font-family: "Segoe UI", "Trebuchet MS", system-ui, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10mm;
  }
  .card {
    display: grid;
    grid-template-columns: 78mm 1fr;
    min-height: 78mm;
    max-width: 186mm;
    margin: 0 auto;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid #0f766e33;
    box-shadow: 0 8px 24px rgba(15, 118, 110, 0.12);
    page-break-inside: avoid;
    break-inside: avoid;
    background: #fff;
    position: relative;
  }
  .card::after {
    content: "";
    position: absolute;
    inset-inline-start: 78mm;
    top: 0;
    bottom: 0;
    width: 0;
    border-inline-start: 2px dashed #0f766e55;
  }
  .rail {
    position: relative;
    background:
      radial-gradient(circle at 30% 20%, #14b8a6 0%, transparent 45%),
      radial-gradient(circle at 80% 80%, #0369a1 0%, transparent 50%),
      linear-gradient(160deg, #0f766e 0%, #0d9488 45%, #115e59 100%);
    display: grid;
    place-items: center;
    padding: 10px 8px 18px;
  }
  .art { width: 88%; max-width: 190px; height: auto; }
  .rail-fade {
    position: absolute;
    inset: auto 0 0;
    height: 28%;
    background: linear-gradient(to top, #0f766ecc, transparent);
    pointer-events: none;
  }
  .body {
    padding: 14px 18px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background:
      linear-gradient(180deg, #f8fffc 0%, #ffffff 40%, #f0fdfa 100%);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .logo {
    width: 42px;
    height: 42px;
    object-fit: contain;
    border-radius: 10px;
    background: #fff;
    border: 1px solid #e2e8f0;
  }
  .logo-fallback {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    font-weight: 800;
    font-size: 13px;
    color: #fff;
    background: linear-gradient(145deg, #0f766e, #14b8a6);
  }
  .brand-block { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .brand {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: #134e4a;
    line-height: 1.2;
  }
  .brand-ar {
    font-style: normal;
    font-size: 12px;
    color: #0f766e;
  }
  .branch {
    font-size: 10px;
    color: #64748b;
  }
  .badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 4px 8px;
    border-radius: 999px;
    background: #d1fae5;
    color: #065f46;
  }
  .badge.used {
    background: #fee2e2;
    color: #991b1b;
  }
  .kind {
    margin: 8px 0 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #0f766e;
  }
  .amount {
    margin: 0;
    font-size: 34px;
    line-height: 1.05;
    font-weight: 800;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
  }
  .batch {
    margin: 0;
    font-size: 13px;
    color: #334155;
  }
  .code-box {
    margin-top: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    background: #0f172a;
    color: #f8fafc;
    display: grid;
    gap: 2px;
  }
  .code-label {
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .code {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.22em;
    font-variant-numeric: tabular-nums;
    font-family: "Cascadia Mono", "Consolas", ui-monospace, monospace;
  }
  .foot {
    margin-top: auto;
    padding-top: 8px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
    color: #475569;
  }
  .foot b { color: #0f172a; }
  .hint { opacity: 0.85; }
  @media print {
    .sheet { gap: 8mm; }
    .card { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="sheet">${cards}</div>
</body>
</html>`
}

export async function printFoodVouchers(
  codes: FoodVoucherCode[],
  opts: FoodVoucherPrintOpts,
): Promise<{ ok: boolean }> {
  if (!codes.length) return { ok: false }
  const html = buildFoodVoucherPrintHtml(codes, opts)
  return printBrowserDocument(html, { widthMm: 210 })
}
