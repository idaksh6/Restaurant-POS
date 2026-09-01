/** Built-in thermal receipt / KOT layout templates — scale with paperWidthMm. */

export type PrintTemplateId =
  | 'classic'
  | 'compact'
  | 'bold'
  | 'brand'
  | 'bilingual'
  | 'minimal'
  | 'kitchen'
  | 'board'

export type PrintTemplateDef = {
  id: PrintTemplateId
  name: string
  blurb: string
  /** Best for receipt vs KOT */
  kinds: Array<'receipt' | 'kot'>
}

export const PRINT_TEMPLATES: PrintTemplateDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'Centered brand, clear rows — guest & paid receipts',
    kinds: ['receipt', 'kot'],
  },
  {
    id: 'compact',
    name: 'Compact',
    blurb: 'Tighter spacing for 58mm rolls and short tickets',
    kinds: ['receipt', 'kot'],
  },
  {
    id: 'bold',
    name: 'Bold total',
    blurb: 'Large total and strong hierarchy for FOH',
    kinds: ['receipt'],
  },
  {
    id: 'brand',
    name: 'Brand block',
    blurb: 'Framed logo-style header with double rules',
    kinds: ['receipt'],
  },
  {
    id: 'bilingual',
    name: 'Bilingual',
    blurb: 'EN + AR friendly spacing for dual-language slips',
    kinds: ['receipt'],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'Clean sparse layout with thin separators',
    kinds: ['receipt'],
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    blurb: 'Large qty/name lines for KOT boards',
    kinds: ['kot'],
  },
  {
    id: 'board',
    name: 'KOT board',
    blurb: 'Extra-large items and bold source line for kitchens',
    kinds: ['kot'],
  },
]

const ALL_IDS: PrintTemplateId[] = PRINT_TEMPLATES.map((t) => t.id)

/** Common thermal roll widths (mm). Custom values still work. */
export const PAPER_WIDTH_PRESETS = [58, 72, 80, 112] as const

export function normalizeTemplateId(
  value: unknown,
  kind: 'receipt' | 'kot' = 'receipt',
): PrintTemplateId {
  const id = String(value || '') as PrintTemplateId
  if (ALL_IDS.includes(id)) {
    const def = PRINT_TEMPLATES.find((t) => t.id === id)
    if (def && !def.kinds.includes(kind)) {
      return kind === 'kot' ? 'kitchen' : 'classic'
    }
    return id
  }
  return kind === 'kot' ? 'kitchen' : 'classic'
}

export function templateLabel(id: PrintTemplateId) {
  return PRINT_TEMPLATES.find((t) => t.id === id)?.name ?? id
}

function scale(widthMm: number, base80: number) {
  const w = Math.max(48, Math.min(120, widthMm || 80))
  return Math.round(base80 * (w / 80) * 10) / 10
}

/** CSS variables + template-specific rules for a given paper width. */
export function thermalTemplateCss(templateId: PrintTemplateId, widthMm: number) {
  const w = Math.max(48, Math.min(120, widthMm || 80))
  const padX = scale(
    w,
    templateId === 'minimal' ? 3 : templateId === 'compact' ? 2 : 2.5,
  )
  const padY = scale(
    w,
    templateId === 'minimal' ? 4.5 : templateId === 'compact' ? 2.8 : 3.5,
  )
  const brand = scale(
    w,
    templateId === 'bold' || templateId === 'brand'
      ? 20
      : templateId === 'board'
        ? 19
        : templateId === 'compact' || templateId === 'minimal'
          ? 15
          : 18,
  )
  const body = scale(
    w,
    templateId === 'compact' || templateId === 'minimal'
      ? 11
      : templateId === 'kitchen' || templateId === 'board'
        ? 13.5
        : 12.5,
  )
  const total = scale(
    w,
    templateId === 'bold' ? 16 : templateId === 'board' ? 15 : 14,
  )
  const gap =
    templateId === 'compact' || templateId === 'minimal'
      ? 2
      : templateId === 'kitchen' || templateId === 'board'
        ? 5
        : 4

  let extra = ''
  if (templateId === 'bold') {
    extra = `
  .brand { letter-spacing: 0.08em; }
  .row.strong {
    font-size: ${total}px;
    padding: 6px 0 2px;
    border-top: 2px solid #111;
  }
  .tag { border-width: 2px; }
`
  } else if (templateId === 'compact') {
    extra = `
  .head { margin-bottom: 4px; }
  .rule { margin: 5px 0; }
  .row { margin: 2px 0; gap: 6px; }
  .thanks { margin-top: 8px; font-size: ${scale(w, 10.5)}px; }
`
  } else if (templateId === 'brand') {
    extra = `
  .brand {
    display: inline-block;
    margin: 0 auto 8px;
    padding: 6px 10px;
    border: 2px solid #111;
    letter-spacing: 0.12em;
  }
  .head { margin-bottom: 10px; }
  .rule {
    border-top-width: 2px;
    margin: 6px 0 8px;
  }
  .rule + .rule { margin-top: -4px; border-top-style: solid; border-top-width: 1px; }
  .slip .rule:first-of-type {
    border-top: 2px solid #111;
  }
  .tag {
    border-radius: 0;
    letter-spacing: 0.08em;
  }
`
  } else if (templateId === 'bilingual') {
    extra = `
  .brand {
    letter-spacing: 0.06em;
    margin-bottom: 8px;
  }
  .meta {
    font-size: ${scale(w, 11)}px;
    line-height: 1.45;
  }
  .meta.ar {
    direction: rtl;
    font-weight: 600;
  }
  .head { margin-bottom: 10px; }
  .row {
    margin: 5px 0;
    gap: 8px;
  }
  .thanks .ar {
    display: block;
    direction: rtl;
    margin-top: 2px;
    font-weight: 600;
  }
`
  } else if (templateId === 'minimal') {
    extra = `
  .brand {
    font-weight: 700;
    letter-spacing: 0.14em;
    margin-bottom: 10px;
  }
  .meta { color: #555; }
  .tag {
    border: 0;
    padding: 0;
    margin-top: 6px;
    letter-spacing: 0.1em;
    font-size: ${scale(w, 9.5)}px;
  }
  .rule {
    border-top: 1px solid #999;
    margin: 10px 0;
  }
  .row { margin: 3px 0; }
  .row.strong {
    border-top: 0;
    padding-top: 8px;
    margin-top: 8px;
    font-size: ${scale(w, 13)}px;
  }
  .thanks {
    margin-top: 14px;
    color: #666;
    font-size: ${scale(w, 10)}px;
  }
`
  } else if (templateId === 'kitchen') {
    extra = `
  .brand { font-size: ${brand}px; }
  .kot-line, .row span:first-child {
    font-size: ${body}px;
    font-weight: 750;
  }
  .row { margin: ${gap}px 0; }
  .meta { font-size: ${scale(w, 12)}px; font-weight: 700; }
`
  } else if (templateId === 'board') {
    extra = `
  .brand {
    font-size: ${brand}px;
    text-transform: uppercase;
    border-bottom: 3px solid #111;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .meta {
    font-size: ${scale(w, 13)}px;
    font-weight: 800;
  }
  .kot-line, .row span:first-child {
    font-size: ${scale(w, 15)}px;
    font-weight: 800;
  }
  .row { margin: 7px 0; }
  .rule { border-top-width: 2px; }
`
  }

  return `
  :root {
    --prn-pad-x: ${padX}mm;
    --prn-pad-y: ${padY}mm;
    --prn-brand: ${brand}px;
    --prn-body: ${body}px;
    --prn-total: ${total}px;
    --prn-gap: ${gap}px;
  }
  body {
    font-size: var(--prn-body);
    padding: var(--prn-pad-y) var(--prn-pad-x);
  }
  .brand { font-size: var(--prn-brand); }
  .row.strong { font-size: var(--prn-total); }
  ${extra}
`
}

export function templatesForKind(kind: 'receipt' | 'kot') {
  return PRINT_TEMPLATES.filter((t) => t.kinds.includes(kind))
}
