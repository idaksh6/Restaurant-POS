/**
 * Inventory of mesa-* persistence keys and target Dexie / API stores.
 * Phase 0 schema documentation.
 */
export type StorageSchemaEntry = {
  key: string
  purpose: string
  dexieTable?: string
  apiModule?: string
}

export const MESA_STORAGE_SCHEMAS: StorageSchemaEntry[] = [
  { key: 'mesa-crm-customers', purpose: 'CRM customers', dexieTable: 'customers', apiModule: 'crm' },
  { key: 'mesa-master-categories', purpose: 'Menu categories', dexieTable: 'categories', apiModule: 'masters' },
  { key: 'mesa-master-dishes', purpose: 'Products', dexieTable: 'dishes', apiModule: 'masters' },
  { key: 'mesa-stock', purpose: 'Stock items', dexieTable: 'stock', apiModule: 'inventory' },
  { key: 'mesa-gift-cards', purpose: 'Gift cards', dexieTable: 'kv', apiModule: 'payments' },
  { key: 'mesa-food-voucher-batches', purpose: 'Food voucher batches', dexieTable: 'kv', apiModule: 'payments' },
  { key: 'mesa-food-voucher-codes', purpose: 'Food voucher codes', dexieTable: 'kv', apiModule: 'payments' },
  { key: 'mesa-expense-types', purpose: 'Expense types', dexieTable: 'kv', apiModule: 'accounts' },
  { key: 'mesa-expense-details', purpose: 'Expense details', dexieTable: 'kv', apiModule: 'accounts' },
  { key: 'mesa-payment-types', purpose: 'Payment types', dexieTable: 'kv', apiModule: 'accounts' },
  { key: 'mesa-extra-charges', purpose: 'Extra charges catalog', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-delivery-riders', purpose: 'Delivery riders', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-company', purpose: 'Company profile (shared HQ)', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-branches', purpose: 'Branch list for company', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-active-branch-id', purpose: 'Terminal active branch', dexieTable: 'meta' },
  { key: 'mesa-company-details', purpose: 'Legacy flat company+branch snapshot', dexieTable: 'kv' },
  { key: 'mesa-tax-rates', purpose: 'Tax rates', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-menu-timetables', purpose: 'Menu timetables', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-sales-ledger', purpose: 'Sales ledger', dexieTable: 'kv', apiModule: 'ledger' },
  { key: 'mesa-day-closed', purpose: 'Day close flag', dexieTable: 'kv', apiModule: 'shift' },
  { key: 'mesa-shifts', purpose: 'Cashier shifts', dexieTable: 'kv', apiModule: 'shift' },
  { key: 'mesa-stock-receipts', purpose: 'Stock receiving receipts', dexieTable: 'kv', apiModule: 'inventory' },
  { key: 'mesa-purchase-orders', purpose: 'Purchase orders', dexieTable: 'kv', apiModule: 'inventory' },
  { key: 'mesa-stock-transfers', purpose: 'Stock transfer documents', dexieTable: 'kv', apiModule: 'inventory' },
  { key: 'mesa-audit-log', purpose: 'Audit trail', dexieTable: 'kv', apiModule: 'audit' },
  { key: 'mesa-sequences', purpose: 'Branch ticket numbers (delivery, drive-thru, takeaway, quick serve)', dexieTable: 'kv', apiModule: 'orders' },
  { key: 'mesa-print-stations', purpose: 'Receipt and KOT printers', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-lang', purpose: 'UI language', dexieTable: 'meta' },
  { key: 'mesa-device-id', purpose: 'Terminal device id', dexieTable: 'meta' },
  { key: 'mesa-sync-cursor', purpose: 'Last pull cursor', dexieTable: 'meta' },
]

export const POS_RUNTIME_KEYS = [
  'tickets',
  'tableOrders',
  'kitchen',
  'outbox',
] as const
