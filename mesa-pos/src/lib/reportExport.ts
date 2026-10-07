import type { LedgerEntry } from '../data/ledger'
import type { ExpenseDetail } from '../data/paymentTypes'
import type { NamedAmount, ReportOverview, ReportRange } from './reportStats'

export type ReportExportStockRow = {
  name: string
  sku: string
  category: string
  unit: string
  onHand: number
  reorderAt: number
  cost: number
  value: number
  vendor: string
}

export type ReportExportTransferRow = {
  date: string
  item: string
  kind: string
  status: string
  qty: number
  unit: string
  from: string
  to: string
  staff: string
}

export type ReportExportPoRow = {
  date: string
  id: string
  supplier: string
  status: string
  lines: number
  qtyOrdered: number
  qtyReceived: number
  amount: number
  notes: string
}

export type ReportExportBundle = {
  branchLabel: string
  range: ReportRange
  overview: ReportOverview
  cogs: number
  grossProfit: number
  netAfterExpenses: number
  daily: NamedAmount[]
  payments: NamedAmount[]
  channels: NamedAmount[]
  items: NamedAmount[]
  staff: NamedAmount[]
  expensesByType: NamedAmount[]
  sales: LedgerEntry[]
  expenses: ExpenseDetail[]
  stock?: ReportExportStockRow[]
  transfers?: ReportExportTransferRow[]
  purchaseOrders?: ReportExportPoRow[]
  labels: {
    overview: string
    daily: string
    payments: string
    channels: string
    items: string
    staff: string
    expenses: string
    salesDetail: string
    stock: string
    transfers: string
    purchaseOrders: string
    metric: string
    value: string
    name: string
    amount: string
    qty: string
    count: string
    day: string
    source: string
    method: string
    tax: string
    total: string
    staffCol: string
    type: string
    date: string
    description: string
    cogs: string
    gross: string
    net: string
    sku: string
    category: string
    unit: string
    onHand: string
    reorder: string
    cost: string
    vendor: string
    kind: string
    status: string
    from: string
    to: string
    poId: string
    supplier: string
    lines: string
    qtyOrdered: string
    qtyReceived: string
    notes: string
  }
}

function sheet(rows: (string | number)[][]) {
  return rows
}

export async function downloadReportsWorkbook(bundle: ReportExportBundle, filename: string) {
  const XLSX = await import('xlsx')
  const L = bundle.labels
  const wb = XLSX.utils.book_new()

  const overviewRows = sheet([
    [L.metric, L.value],
    ['Branch', bundle.branchLabel],
    ['From', bundle.range.from],
    ['To', bundle.range.to],
    [L.overview + ' · Sales', bundle.overview.salesTotal],
    ['Net (ex VAT)', bundle.overview.salesNet],
    [L.tax, bundle.overview.taxTotal],
    ['Discounts', bundle.overview.discountTotal],
    ['Voids', bundle.overview.voidTotal],
    ['Tickets', bundle.overview.ticketCount],
    ['Avg ticket', bundle.overview.avgTicket],
    ['Expenses', bundle.overview.expenseTotal],
    [L.cogs, bundle.cogs],
    [L.gross, bundle.grossProfit],
    [L.net, bundle.netAfterExpenses],
  ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overviewRows), L.overview.slice(0, 31))

  const dailyRows = [
    [L.day, L.amount],
    ...bundle.daily.map((r) => [r.name, r.amount]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dailyRows), L.daily.slice(0, 31))

  const payRows = [
    [L.name, L.amount],
    ...bundle.payments.map((r) => [r.name, r.amount]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payRows), L.payments.slice(0, 31))

  const chRows = [
    [L.name, L.amount, L.count],
    ...bundle.channels.map((r) => [r.name, r.amount, r.count ?? 0]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chRows), L.channels.slice(0, 31))

  const itemRows = [
    [L.name, L.qty, L.amount],
    ...bundle.items.map((r) => [r.name, r.qty ?? 0, r.amount]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemRows), L.items.slice(0, 31))

  const staffRows = [
    [L.staffCol, L.amount, L.count],
    ...bundle.staff.map((r) => [r.name, r.amount, r.count ?? 0]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(staffRows), L.staff.slice(0, 31))

  const expRows = [
    [L.type, L.amount, L.count],
    ...bundle.expensesByType.map((r) => [r.name, r.amount, r.count ?? 0]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), L.expenses.slice(0, 31))

  const saleRows: (string | number)[][] = [
    [L.day, L.source, L.method, L.staffCol, 'Subtotal', L.tax, L.total],
  ]
  for (const e of bundle.sales) {
    saleRows.push([
      e.day,
      e.source,
      e.method,
      e.staff ?? '',
      e.subtotal,
      e.tax,
      e.total,
    ])
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(saleRows), L.salesDetail.slice(0, 31))

  const detailExp: (string | number)[][] = [[L.date, L.type, L.description, L.amount]]
  for (const e of bundle.expenses) {
    detailExp.push([e.date, e.expenseTypeId, e.description || '', e.amount])
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(detailExp),
    `${L.expenses} detail`.slice(0, 31),
  )

  if (bundle.stock?.length) {
    const stockRows = [
      [L.name, L.sku, L.category, L.unit, L.onHand, L.reorder, L.cost, L.value, L.vendor],
      ...bundle.stock.map((r) => [
        r.name,
        r.sku,
        r.category,
        r.unit,
        r.onHand,
        r.reorderAt,
        r.cost,
        r.value,
        r.vendor,
      ]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stockRows), L.stock.slice(0, 31))
  }

  if (bundle.transfers?.length) {
    const xferRows = [
      [L.date, L.name, L.kind, L.status, L.qty, L.unit, L.from, L.to, L.staffCol],
      ...bundle.transfers.map((r) => [
        r.date,
        r.item,
        r.kind,
        r.status,
        r.qty,
        r.unit,
        r.from,
        r.to,
        r.staff,
      ]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(xferRows), L.transfers.slice(0, 31))
  }

  if (bundle.purchaseOrders?.length) {
    const poSheet = [
      [
        L.date,
        L.poId,
        L.supplier,
        L.status,
        L.lines,
        L.qtyOrdered,
        L.qtyReceived,
        L.amount,
        L.notes,
      ],
      ...bundle.purchaseOrders.map((r) => [
        r.date,
        r.id,
        r.supplier,
        r.status,
        r.lines,
        r.qtyOrdered,
        r.qtyReceived,
        r.amount,
        r.notes,
      ]),
    ]
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(poSheet),
      L.purchaseOrders.slice(0, 31),
    )
  }

  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}
