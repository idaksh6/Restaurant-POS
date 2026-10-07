/**
 * Inventory of mesa-* persistence keys and target Dexie / API stores.
 * Phase 0 schema documentation — keep in sync with live writers.
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
  { key: 'mesa-ingredients', purpose: 'Ingredient masters', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-ingredient-categories', purpose: 'Custom ingredient categories', dexieTable: 'kv' },
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
  { key: 'mesa-discount-rates', purpose: 'Discount rates', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-units', purpose: 'Measure units', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-addon-masters', purpose: 'Addon / variation masters', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-beverage-qtys', purpose: 'Beverage serving sizes', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-beverage-prices', purpose: 'Beverage size prices', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-menu-timetables', purpose: 'Menu timetables', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-table-areas', purpose: 'Floor table areas', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-stock-locations', purpose: 'Storage locations', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-yield-links', purpose: 'Production yield conversions', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-suppliers', purpose: 'Vendors / suppliers', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-vendor-ledger', purpose: 'Vendor payable ledger', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-sales-ledger', purpose: 'Sales ledger', dexieTable: 'kv', apiModule: 'ledger' },
  { key: 'mesa-day-closed', purpose: 'Day close flag', dexieTable: 'kv', apiModule: 'shift' },
  { key: 'mesa-shifts', purpose: 'Cashier shifts', dexieTable: 'kv', apiModule: 'shift' },
  { key: 'mesa-stock-receipts', purpose: 'Stock receiving receipts', dexieTable: 'kv', apiModule: 'inventory' },
  { key: 'mesa-stock-cost-history', purpose: 'Stock cost history (local)', dexieTable: 'kv' },
  { key: 'mesa-purchase-orders', purpose: 'Purchase orders', dexieTable: 'kv', apiModule: 'inventory' },
  { key: 'mesa-stock-transfers', purpose: 'Stock transfer documents', dexieTable: 'kv', apiModule: 'inventory' },
  { key: 'mesa-audit-log', purpose: 'Audit trail', dexieTable: 'kv', apiModule: 'audit' },
  { key: 'mesa-sequences', purpose: 'Branch ticket numbers (delivery, drive-thru, takeaway, quick serve)', dexieTable: 'kv', apiModule: 'orders' },
  { key: 'mesa-open-tickets', purpose: 'Open order tickets mirror', dexieTable: 'tickets', apiModule: 'orders' },
  { key: 'mesa-print-stations', purpose: 'Receipt and KOT printers', dexieTable: 'kv', apiModule: 'masters' },
  { key: 'mesa-delivery-integrations', purpose: 'Delivery channel config (local)', dexieTable: 'kv' },
  { key: 'mesa-zatca-invoices', purpose: 'ZATCA invoice submissions', dexieTable: 'kv', apiModule: 'zatca' },
  { key: 'mesa-zatca-phase2-cfg', purpose: 'ZATCA device config (local)', dexieTable: 'kv' },
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
