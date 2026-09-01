/** CSV helpers + export/import table registry for Database hub */

import { tenantGetItem, tenantRemoveItem, tenantSetItem } from '../data/repos/db'

export type TransferTableId =
  | 'department'
  | 'products'
  | 'customer'
  | 'vendor'
  | 'side-dish'
  | 'ingredients'
  | 'recipe'

export const transferTables: { id: TransferTableId; label: string }[] = [
  { id: 'department', label: 'Department' },
  { id: 'products', label: 'Products' },
  { id: 'customer', label: 'Customer' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'side-dish', label: 'Side Dish' },
  { id: 'ingredients', label: 'Ingredients' },
  { id: 'recipe', label: 'Recipe' },
]

export type FileTypeOpt = 'csv' | 'json'

export function escapeCsv(value: string | number | undefined | null) {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(headers: string[], rows: Array<Array<string | number | undefined | null>>) {
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ]
  return `${lines.join('\r\n')}\r\n`
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    const next = src[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (ch === '\r') continue
    cell += ch
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? '').trim()
    })
    return obj
  })
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const templates: Record<TransferTableId, { headers: string[]; sample: string[][] }> = {
  department: {
    headers: ['Name', 'Alias', 'Parent', 'Active', 'Sort'],
    sample: [
      ['Breakfast', 'BF', '', '1', '1'],
      ['Soups', 'Soup', 'Food', '1', '2'],
    ],
  },
  products: {
    headers: [
      'ProductName',
      'Alias_Name',
      'upc_code',
      'Department',
      'vendor',
      'Cost_Price',
      'Sale_Price',
      'barcode',
      'hsn_code',
      'Unit_Name',
    ],
    sample: [
      [
        '2 Piece Grilled Crab Cake',
        '2 Piece Grilled Crab Cake',
        'UPC10',
        'Breakfast',
        'SupplierA',
        '120',
        '175',
        '',
        '',
        'KG',
      ],
    ],
  },
  customer: {
    headers: ['Name', 'mobile_no1', 'address', 'email_id'],
    sample: [['Appu', '0500000000', 'Riyadh', 'appu@example.com']],
  },
  vendor: {
    headers: ['Name', 'Phone', 'Email', 'City', 'Active'],
    sample: [['SupplierA', '+966 50 000 0000', 'a@vendor.com', 'Riyadh', '1']],
  },
  'side-dish': {
    headers: ['ProductName', 'Alias_Name', 'upc_code', 'Department', 'Sale_Price', 'Active'],
    sample: [['Fries', 'Fries', 'SIDE01', 'Sides', '15', '1']],
  },
  ingredients: {
    headers: ['Name', 'Unit', 'Qty', 'Reorder', 'Cost'],
    sample: [['Tomato', 'kg', '20', '5', '4']],
  },
  recipe: {
    headers: ['ProductCode', 'ProductName', 'Ingredient', 'Qty'],
    sample: [['101', 'Tomato Bisque', 'Tomato', '0.2']],
  },
}

export function templateCsv(table: TransferTableId) {
  const t = templates[table]
  return toCsv(t.headers, t.sample)
}

/** Keys used for full JSON backup */
export const backupKeys = [
  'mesa-crm-customers',
  'mesa-master-categories',
  'mesa-master-dishes',
  'mesa-stock',
  'mesa-gift-cards',
  'mesa-food-voucher-batches',
  'mesa-food-voucher-codes',
  'mesa-expense-types',
  'mesa-expense-details',
  'mesa-payment-types',
  'mesa-extra-charges',
  'mesa-delivery-riders',
  'mesa-company',
  'mesa-branches',
  'mesa-active-branch-id',
  'mesa-company-details',
  'mesa-tax-rates',
  'mesa-menu-timetables',
  'mesa-sales-ledger',
  'mesa-day-closed',
  'mesa-shifts',
  'mesa-stock-receipts',
  'mesa-purchase-orders',
  'mesa-stock-transfers',
  'mesa-open-tickets',
  'mesa-outbox',
  'mesa-audit-log',
  'mesa-sequences',
  'mesa-print-stations',
  'mesa-sync-cursor',
]

export function buildFullBackup() {
  const data: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    app: 'mesa-pos',
  }
  for (const key of backupKeys) {
    try {
      const raw = tenantGetItem(key)
      data[key] = raw ? JSON.parse(raw) : null
    } catch {
      data[key] = null
    }
  }
  return data
}

export function restoreFullBackup(payload: Record<string, unknown>) {
  let count = 0
  for (const key of backupKeys) {
    if (key in payload && payload[key] != null) {
      tenantSetItem(key, JSON.stringify(payload[key]))
      count++
    }
  }
  return count
}

export function clearDemoStorage() {
  const cleared: string[] = []
  for (const key of backupKeys) {
    if (tenantGetItem(key) != null) {
      tenantRemoveItem(key)
      cleared.push(key)
    }
  }
  return cleared
}
