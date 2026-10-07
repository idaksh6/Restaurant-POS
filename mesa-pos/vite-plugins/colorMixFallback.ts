import fs from 'node:fs'
import path from 'node:path'
import type { AtRule, Declaration, Plugin, Root, Rule } from 'postcss'

/**
 * Chrome < 111 (the last Chrome on Windows 7 is 109) drops every declaration that uses
 * `color-mix()`. Because most of ours also contain `var()`, a plain fallback line above
 * does not help (the property becomes invalid at computed time), so the resolved colours
 * go into an `@supports not (color: color-mix(...))` twin of each rule instead.
 */

type Rgba = [number, number, number, number]
type Resolved = { c: Rgba } | { raw: string }

const SUPPORTS_PARAMS = 'not (color: color-mix(in srgb, red 50%, blue))'

function listCssFiles(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) listCssFiles(full, out)
    else if (entry.name.endsWith('.css')) out.push(full)
  }
  return out
}

type VarDef = { selector: string; value: string }

function collectVarDefs(srcDir: string) {
  const defs = new Map<string, VarDef[]>()
  for (const file of listCssFiles(srcDir)) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g
    let rule: RegExpExecArray | null
    while ((rule = ruleRe.exec(css))) {
      const selector = rule[1].trim()
      const declRe = /(--[\w-]+)\s*:\s*([^;]+)/g
      let decl: RegExpExecArray | null
      while ((decl = declRe.exec(rule[2]))) {
        const list = defs.get(decl[1]) ?? []
        list.push({ selector, value: decl[2].trim() })
        defs.set(decl[1], list)
      }
    }
  }
  return defs
}

function splitTopLevel(input: string, sep = ',') {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (ch === sep && depth === 0) {
      parts.push(input.slice(start, i))
      start = i + 1
    }
  }
  parts.push(input.slice(start))
  return parts.map((p) => p.trim())
}

function matchParen(input: string, open: number) {
  let depth = 0
  for (let i = open; i < input.length; i += 1) {
    if (input[i] === '(') depth += 1
    else if (input[i] === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function parseHex(hex: string): Rgba | null {
  const h = hex.slice(1)
  if (![3, 4, 6, 8].includes(h.length) || /[^0-9a-f]/i.test(h)) return null
  const full = h.length <= 4 ? [...h].map((c) => c + c).join('') : h
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16)
  return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1]
}

function parseRgbFn(value: string): Rgba | null {
  const m = /^rgba?\((.*)\)$/i.exec(value)
  if (!m) return null
  const parts = m[1].replace(/\//g, ' ').replace(/,/g, ' ').trim().split(/\s+/)
  if (parts.length < 3) return null
  const chan = (p: string) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p))
  const alpha = parts[3] == null ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
  const out: Rgba = [chan(parts[0]), chan(parts[1]), chan(parts[2]), alpha]
  return out.some((v) => Number.isNaN(v)) ? null : out
}

const NAMED: Record<string, Rgba> = {
  transparent: [0, 0, 0, 0],
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
}

function formatColor([r, g, b, a]: Rgba) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  if (a >= 0.999) return `#${[r, g, b].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${Number(a.toFixed(3))})`
}

function isRootSelector(selector: string) {
  return selector.split(',').some((s) => /^(:root|html)$/.test(s.trim()))
}

export function colorMixFallback(srcDir: string): Plugin {
  const defs = collectVarDefs(srcDir)
  const varCache = new Map<string, Rgba | null>()

  function resolveVar(name: string, stack: string[]): Rgba | null {
    if (varCache.has(name)) return varCache.get(name) ?? null
    if (stack.includes(name)) return null
    const list = defs.get(name)
    let out: Rgba | null = null
    if (list?.length) {
      const root = list.find((d) => isRootSelector(d.selector))
      if (root) {
        out = resolveStatic(root.value, [...stack, name])
      } else {
        const values = list.map((d) => resolveStatic(d.value, [...stack, name]))
        const first = values[0]
        if (first && values.every((v) => v && formatColor(v) === formatColor(first))) out = first
      }
    }
    varCache.set(name, out)
    return out
  }

  /** Static colour, or null when it depends on runtime / per-element values. */
  function resolveStatic(expr: string, stack: string[] = []): Rgba | null {
    const r = resolve(expr.trim(), '', stack)
    return 'c' in r ? r.c : null
  }

  function resolve(expr: string, prop: string, stack: string[] = []): Resolved {
    const value = expr.trim()
    const lower = value.toLowerCase()
    if (lower in NAMED) return { c: NAMED[lower] }
    if (value.startsWith('#')) {
      const c = parseHex(value)
      return c ? { c } : { raw: value }
    }
    if (/^rgba?\(/i.test(value)) {
      const c = parseRgbFn(value)
      return c ? { c } : { raw: value }
    }
    const varMatch = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]*))?\)$/.exec(value)
    if (varMatch) {
      const c = resolveVar(varMatch[1], stack)
      return c ? { c } : { raw: value }
    }
    if (/^color-mix\(/i.test(value)) return mix(value.slice(value.indexOf('(') + 1, -1), prop, stack)
    return { raw: value }
  }

  function mix(inner: string, prop: string, stack: string[]): Resolved {
    const [, ...args] = splitTopLevel(inner)
    if (args.length !== 2) return { raw: `color-mix(${inner})` }
    const parsed = args.map((arg) => {
      const lead = /^(\d*\.?\d+)%\s+([\s\S]+)$/.exec(arg)
      if (lead) return { color: lead[2], pct: parseFloat(lead[1]) }
      const trail = /^([\s\S]+?)\s+(\d*\.?\d+)%$/.exec(arg)
      if (trail) return { color: trail[1], pct: parseFloat(trail[2]) }
      return { color: arg, pct: undefined as number | undefined }
    })
    let [p1, p2] = parsed.map((p) => p.pct)
    if (p1 == null && p2 == null) p1 = p2 = 50
    else if (p1 == null) p1 = 100 - (p2 as number)
    else if (p2 == null) p2 = 100 - p1
    const sum = (p1 as number) + (p2 as number)
    if (sum <= 0) return { raw: 'transparent' }
    const w1 = (p1 as number) / sum
    const w2 = (p2 as number) / sum
    const alphaScale = sum < 100 ? sum / 100 : 1

    const a = resolve(parsed[0].color, prop, stack)
    const b = resolve(parsed[1].color, prop, stack)

    if ('c' in a && 'c' in b) {
      const alpha = a.c[3] * w1 + b.c[3] * w2
      if (alpha === 0) return { c: [0, 0, 0, 0] }
      const ch = (i: number) => (a.c[i] * a.c[3] * w1 + b.c[i] * b.c[3] * w2) / alpha
      return { c: [ch(0), ch(1), ch(2), alpha * alphaScale] }
    }

    // One side is per-element / runtime: keep the dominant colour, or the static side.
    const outline = /^(border|outline)/.test(prop)
    const pick = (dyn: { raw: string }, stat: Resolved, dynWeight: number): Resolved => {
      if (dynWeight >= 0.5) return dyn
      if ('c' in stat) return stat.c[3] === 0 ? (outline ? dyn : { raw: 'transparent' }) : stat
      return dynWeight >= 0.25 ? dyn : stat
    }
    if ('raw' in a && 'c' in b) return pick(a, b, w1)
    if ('c' in a && 'raw' in b) return pick(b, a, w2)
    return w1 >= 0.5 ? a : b
  }

  function fallbackValue(value: string, prop: string): string | null {
    let out = value
    for (let guard = 0; guard < 50; guard += 1) {
      const start = out.toLowerCase().indexOf('color-mix(')
      if (start < 0) return out
      const end = matchParen(out, start + 'color-mix'.length)
      if (end < 0) return null
      const r = resolve(out.slice(start, end + 1), prop)
      const text = 'c' in r ? formatColor(r.c) : r.raw
      if (/color-mix\(/i.test(text)) return null
      out = out.slice(0, start) + text + out.slice(end + 1)
    }
    return null
  }

  function insideKeyframesOrFallback(rule: Rule) {
    for (let p: Rule['parent'] | Root['parent'] = rule.parent; p; p = p.parent) {
      if (p.type !== 'atrule') continue
      const at = p as AtRule
      if (/keyframes$/i.test(at.name)) return true
      if (at.name === 'supports' && at.params === SUPPORTS_PARAMS) return true
    }
    return false
  }

  return {
    postcssPlugin: 'mesa-color-mix-fallback',
    OnceExit(root, { AtRule }) {
      const work: { rule: Rule; decls: { decl: Declaration; value: string }[] }[] = []
      root.walkRules((rule) => {
        if (insideKeyframesOrFallback(rule)) return
        const decls: { decl: Declaration; value: string }[] = []
        rule.each((node) => {
          if (node.type !== 'decl' || !/color-mix\(/i.test(node.value)) return
          const value = fallbackValue(node.value, node.prop.toLowerCase())
          if (value != null && value !== node.value) decls.push({ decl: node, value })
        })
        if (decls.length) work.push({ rule, decls })
      })
      for (const { rule, decls } of work) {
        const twin = rule.clone({ nodes: [] })
        for (const { decl, value } of decls) twin.append(decl.clone({ value }))
        const wrapper = new AtRule({ name: 'supports', params: SUPPORTS_PARAMS })
        wrapper.append(twin)
        rule.after(wrapper)
      }
    },
  }
}
