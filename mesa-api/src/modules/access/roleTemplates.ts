export type AccessFlags = {
  nav: string[]
  canOpenTable: boolean
  canSendOrders: boolean
  canChangeTable: boolean
  canTempBill: boolean
  canSettle: boolean
  canManageStock: boolean
  canMasters: boolean
  canBackOffice: boolean
  canManageUsers: boolean
}

const allNav = [
  'home',
  'dine-in',
  'payments',
  'takeaway',
  'delivery',
  'online',
  'kitchen',
  'inventory',
  'suppliers',
  'purchase-orders',
  'crm',
  'masters',
  'settings',
  'back-office',
  'expenses',
] as const

const templateNav = ['dine-in', 'kitchen', 'takeaway', 'crm']

export function navRequiredByFlags(flags: Omit<AccessFlags, 'nav'>): string[] {
  const keys = new Set<string>(['home'])
  if (flags.canOpenTable || flags.canSendOrders || flags.canChangeTable || flags.canTempBill) {
    keys.add('dine-in')
  }
  if (flags.canSettle) {
    keys.add('payments')
    keys.add('dine-in')
  }
  if (flags.canManageStock) {
    keys.add('inventory')
    keys.add('suppliers')
    keys.add('purchase-orders')
  }
  if (flags.canMasters) {
    keys.add('settings')
    keys.add('masters')
    keys.add('expenses')
  }
  if (flags.canBackOffice) {
    keys.add('back-office')
    keys.add('expenses')
  }
  if (flags.canManageUsers) keys.add('settings')
  return [...keys]
}

function hasOperationalFlags(flags: Omit<AccessFlags, 'nav'>) {
  return (
    flags.canOpenTable ||
    flags.canSendOrders ||
    flags.canChangeTable ||
    flags.canTempBill ||
    flags.canSettle ||
    flags.canManageStock ||
    flags.canMasters
  )
}

function explicitNavItems(storedNav: string[], flags: Omit<AccessFlags, 'nav'>) {
  const required = new Set(navRequiredByFlags(flags))
  return storedNav.filter((k) => allNav.includes(k as (typeof allNav)[number]) && !required.has(k))
}

function effectiveNav(raw: AccessFlags): string[] {
  const stored = Array.isArray(raw.nav)
    ? raw.nav.filter((k): k is (typeof allNav)[number] => allNav.includes(k as (typeof allNav)[number]))
    : ['home']
  let explicit = explicitNavItems(stored, raw)
  if (explicit.length && explicit.every((k) => templateNav.includes(k)) && !hasOperationalFlags(raw)) {
    explicit = []
  }
  const picked = new Set<string>([...navRequiredByFlags(raw), ...explicit])
  if (!picked.has('home')) picked.add('home')
  return allNav.filter((k) => picked.has(k))
}

export function normalizeAccessFlags(raw: AccessFlags): AccessFlags {
  const base: AccessFlags = {
    nav: Array.isArray(raw?.nav) ? raw.nav.map(String) : ['home'],
    canOpenTable: Boolean(raw?.canOpenTable),
    canSendOrders: Boolean(raw?.canSendOrders),
    canChangeTable: Boolean(raw?.canChangeTable),
    canTempBill: Boolean(raw?.canTempBill),
    canSettle: Boolean(raw?.canSettle),
    canManageStock: Boolean(raw?.canManageStock),
    canMasters: Boolean(raw?.canMasters),
    canBackOffice: Boolean(raw?.canBackOffice),
    canManageUsers: Boolean(raw?.canManageUsers),
  }
  return { ...base, nav: effectiveNav(base) }
}

export const systemRoleTemplates: Array<{
  key: string
  name: string
  nameAr: string
  privileges: AccessFlags
}> = [
  {
    key: 'admin',
    name: 'Admin',
    nameAr: 'مدير',
    privileges: {
      nav: [...allNav],
      canOpenTable: true,
      canSendOrders: true,
      canChangeTable: true,
      canTempBill: true,
      canSettle: true,
      canManageStock: true,
      canMasters: true,
      canBackOffice: true,
      canManageUsers: true,
    },
  },
  {
    key: 'cashier',
    name: 'Cashier',
    nameAr: 'أمين الصندوق',
    privileges: {
      nav: ['home', 'payments', 'dine-in', 'takeaway', 'delivery', 'online', 'crm'],
      canOpenTable: true,
      canSendOrders: true,
      canChangeTable: false,
      canTempBill: true,
      canSettle: true,
      canManageStock: false,
      canMasters: false,
      canBackOffice: false,
      canManageUsers: false,
    },
  },
  {
    key: 'food-server',
    name: 'Food Server',
    nameAr: 'نادل',
    privileges: {
      nav: ['home', 'dine-in', 'kitchen', 'takeaway'],
      canOpenTable: true,
      canSendOrders: true,
      canChangeTable: true,
      canTempBill: true,
      canSettle: false,
      canManageStock: false,
      canMasters: false,
      canBackOffice: false,
      canManageUsers: false,
    },
  },
  {
    key: 'kitchen-manager',
    name: 'Kitchen Manager',
    nameAr: 'مدير المطبخ',
    privileges: {
      nav: ['home', 'kitchen'],
      canOpenTable: false,
      canSendOrders: false,
      canChangeTable: false,
      canTempBill: false,
      canSettle: false,
      canManageStock: false,
      canMasters: false,
      canBackOffice: false,
      canManageUsers: false,
    },
  },
]
