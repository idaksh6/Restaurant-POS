/* Scenario check for printer routing: npx tsx scripts/check-print-routing.ts */
const store = new Map<string, string>()
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

const { explainRoute, normalizePrinter } = await import('../src/data/printers')

const B = 'br-1'
const p = (id: string, purposes: string[], extra: Record<string, unknown> = {}, routing: Record<string, unknown> = {}) =>
  normalizePrinter({ id, name: id, branchId: B, purposes, connection: 'lan', host: '10.0.0.1', options: { routing } as never, ...extra } as never)

const printers = [
  p('kitchen-main', ['kot'], { isDefault: true }),
  p('grill', ['kot'], { departmentId: 'dept-grill' }),
  p('pizza-only', ['kot'], {}, { categoryIds: ['cat-pizza'] }),
  p('terrace-kot', ['kot'], {}, { areaIds: ['area-terrace'] }),
  p('front-receipt', ['receipt', 'bill'], { isDefault: true }),
  p('delivery-receipt', ['receipt'], {}, { orderTypes: ['delivery', 'online'] }),
  p('vip-bill', ['bill'], {}, { areaIds: ['area-vip'] }),
]

const cases: [string, Parameters<typeof explainRoute>[1], Parameters<typeof explainRoute>[2], string][] = [
  ['KOT burger (grill dept)', 'kot', { orderType: 'dine-in', categoryIds: ['cat-burger', 'dept-grill'] }, 'grill'],
  ['KOT pizza (leaf cat under grill dept)', 'kot', { categoryIds: ['cat-pizza', 'dept-grill'] }, 'pizza-only'],
  ['KOT salad (no rule)', 'kot', { categoryIds: ['cat-salad', 'dept-cold'] }, 'kitchen-main'],
  ['KOT salad on terrace', 'kot', { orderType: 'dine-in', areaId: 'area-terrace', categoryIds: ['cat-salad'] }, 'terrace-kot'],
  ['Receipt takeaway', 'receipt', { orderType: 'takeaway' }, 'front-receipt'],
  ['Receipt delivery', 'receipt', { orderType: 'delivery' }, 'delivery-receipt'],
  ['Bill VIP table', 'bill', { orderType: 'dine-in', areaId: 'area-vip' }, 'vip-bill'],
  ['Bill hall table', 'bill', { orderType: 'dine-in', areaId: 'area-hall' }, 'front-receipt'],
]

let failed = 0
for (const [label, purpose, ctx, want] of cases) {
  const r = explainRoute(printers, purpose, ctx, B)
  const ok = r.printer?.id === want
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} -> ${r.printer?.id ?? '(none)'} [${r.reason}]${ok ? '' : `  expected ${want}`}`)
}

const onlyDelivery = [p('d-only', ['receipt'], {}, { orderTypes: ['delivery'] })]
const fb = explainRoute(onlyDelivery, 'receipt', { orderType: 'dine-in' }, B)
console.log(`${fb.printer?.id === 'd-only' && fb.reason === 'fallback' ? 'PASS' : 'FAIL'}  No match falls back to default -> ${fb.printer?.id} [${fb.reason}]`)
if (!(fb.printer?.id === 'd-only' && fb.reason === 'fallback')) failed += 1

const roundTrip = normalizePrinter(JSON.parse(JSON.stringify(printers[2])))
const keeps = roundTrip.options.routing.categoryIds[0] === 'cat-pizza'
console.log(`${keeps ? 'PASS' : 'FAIL'}  Routing survives save/load`)
if (!keeps) failed += 1

process.exit(failed ? 1 : 0)
