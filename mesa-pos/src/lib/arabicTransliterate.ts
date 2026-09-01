/** Latin keyboard → Arabic script (Saudi/Levantine-friendly digraph map). */

const DIGRAPHS: [string, string][] = [
  ['sh', 'ش'],
  ['kh', 'خ'],
  ['th', 'ث'],
  ['gh', 'غ'],
  ['dh', 'ذ'],
  ['aa', 'ا'],
  ['ee', 'ي'],
  ['oo', 'و'],
  ['ou', 'و'],
  ['ai', 'ي'],
  ['ay', 'ي'],
  ['ey', 'ي'],
]

const SINGLE: Record<string, string> = {
  a: 'ا',
  b: 'ب',
  c: 'ك',
  d: 'د',
  e: 'ي',
  f: 'ف',
  g: 'ج',
  h: 'ه',
  i: 'ي',
  j: 'ج',
  k: 'ك',
  l: 'ل',
  m: 'م',
  n: 'ن',
  o: 'و',
  p: 'ب',
  q: 'ق',
  r: 'ر',
  s: 'س',
  t: 'ت',
  u: 'و',
  v: 'ف',
  w: 'و',
  x: 'كس',
  y: 'ي',
  z: 'ز',
  "'": 'ء',
  '’': 'ء',
  '`': 'ع',
}

function isArabicChar(ch: string) {
  const code = ch.codePointAt(0) ?? 0
  return (code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)
}

/** Convert Latin letters to Arabic; keep Arabic, digits, and punctuation as-is. */
export function latinToArabic(input: string): string {
  let out = ''
  let i = 0
  const lower = input.toLowerCase()

  while (i < input.length) {
    const ch = input[i]
    if (isArabicChar(ch) || /\d/.test(ch) || /[\s.,\-_/\\()+:@]/.test(ch)) {
      out += ch
      i += 1
      continue
    }

    let matched = false
    for (const [latin, ar] of DIGRAPHS) {
      if (lower.startsWith(latin, i)) {
        out += ar
        i += latin.length
        matched = true
        break
      }
    }
    if (matched) continue

    const mapped = SINGLE[lower[i]]
    if (mapped) {
      out += mapped
      i += 1
      continue
    }

    out += ch
    i += 1
  }

  return out
}

export function suggestArabicFromLatin(latin: string): string {
  return latinToArabic(latin.trim())
}

/** Best-effort Arabic → Latin (Google-style romanization). */
export function arabicToLatin(input: string): string {
  const pairs: [string, string][] = [
    ['كس', 'x'],
    ['ش', 'sh'],
    ['خ', 'kh'],
    ['ث', 'th'],
    ['غ', 'gh'],
    ['ذ', 'dh'],
    ['ا', 'a'],
    ['أ', 'a'],
    ['إ', 'i'],
    ['آ', 'a'],
    ['ى', 'a'],
    ['ة', 'a'],
    ['ب', 'b'],
    ['ك', 'k'],
    ['د', 'd'],
    ['ي', 'y'],
    ['ف', 'f'],
    ['ج', 'j'],
    ['ه', 'h'],
    ['ح', 'h'],
    ['ل', 'l'],
    ['م', 'm'],
    ['ن', 'n'],
    ['و', 'w'],
    ['ق', 'q'],
    ['ر', 'r'],
    ['س', 's'],
    ['ص', 's'],
    ['ت', 't'],
    ['ط', 't'],
    ['ز', 'z'],
    ['ض', 'd'],
    ['ظ', 'z'],
    ['ء', "'"],
    ['ع', 'a'],
  ]

  let out = ''
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (!isArabicChar(ch)) {
      out += ch
      i += 1
      continue
    }
    // Initial ي ≈ "ya" (Google-style: يسارفا → Yasarfa)
    const atWordStart = i === 0 || /\s/.test(input[i - 1] ?? '')
    if (ch === 'ي' && atWordStart) {
      out += 'ya'
      i += 1
      continue
    }
    let matched = false
    for (const [ar, latin] of pairs) {
      if (input.startsWith(ar, i)) {
        out += latin
        i += ar.length
        matched = true
        break
      }
    }
    if (!matched) {
      out += ch
      i += 1
    }
  }
  return out
}

/** Arabic → Latin with leading capital (e.g. يسارفا → Yasarfa). */
export function arabicToLatinName(input: string): string {
  const latin = arabicToLatin(input.trim())
  if (!latin) return latin
  return latin.charAt(0).toUpperCase() + latin.slice(1)
}

export function looksMostlyLatin(value: string): boolean {
  const letters = value.replace(/[^a-zA-Z\u0600-\u06FF]/g, '')
  if (!letters) return false
  const latin = letters.replace(/[^a-zA-Z]/g, '').length
  return latin / letters.length > 0.5
}
