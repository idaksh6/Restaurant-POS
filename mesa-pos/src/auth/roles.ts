import type { SettingsSectionId } from '../lib/settingsHub'

export type SystemRoleKey = 'admin' | 'cashier' | 'food-server' | 'kitchen-manager' | 'rider'
export type RoleKey = SystemRoleKey | 'custom' | (string & {})

export type NavKey =
  | 'home'
  | 'dine-in'
  | 'payments'
  | 'takeaway'
  | 'delivery'
  | 'online'
  | 'kitchen'
  | 'inventory'
  | 'suppliers'
  | 'purchase-orders'
  | 'crm'
  | 'masters'
  | 'settings'
  | 'back-office'
  | 'expenses'

export type AccessFlags = {
  nav: NavKey[]
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

export type RolePermissions = AccessFlags & {
  label: string
  homeTitle: string
  homeSubtitle: string
}

/** Editable subset for a role (stored locally and on the API). */
export type CustomPrivileges = AccessFlags

const CUSTOM_KEY = 'mesa-custom-role'
const COMPANY_KEY = 'mesa-login-company-id'
const TERMINAL_KEY = 'mesa-terminal-company'
const ROLES_PREFIX = 'mesa-roles:'

const allNav: NavKey[] = [
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
]

export const defaultCustomPrivileges: CustomPrivileges = {
  nav: ['home', 'dine-in', 'kitchen', 'takeaway', 'crm'],
  canOpenTable: true,
  canSendOrders: true,
  canChangeTable: true,
  canTempBill: true,
  canSettle: false,
  canManageStock: false,
  canMasters: false,
  canBackOffice: false,
  canManageUsers: false,
}

export const accessFlagLabels: { key: keyof Omit<AccessFlags, 'nav'>; label: string; hint: string }[] = [
  { key: 'canOpenTable', label: 'Open tables', hint: 'Start a dine-in check' },
  { key: 'canSendOrders', label: 'Send KOT', hint: 'Send items to kitchen' },
  { key: 'canChangeTable', label: 'Change / merge table', hint: 'Move or merge occupied tables' },
  { key: 'canTempBill', label: 'Temporary bill', hint: 'Print a guest check before pay' },
  { key: 'canSettle', label: 'Settle / pay', hint: 'Take payment and close the ticket' },
  { key: 'canManageStock', label: 'Stock / purchasing', hint: 'Inventory, vendors, POs' },
  { key: 'canMasters', label: 'Masters & settings', hint: 'Products, tax, company, database' },
  { key: 'canBackOffice', label: 'Back office', hint: 'Day close, ledger, shifts' },
  { key: 'canManageUsers', label: 'Users & roles', hint: 'Create staff and edit access rights' },
]

export const rolePermissions: Record<SystemRoleKey, RolePermissions> = {
  admin: {
    label: 'Admin',
    homeTitle: 'Admin · KSA',
    homeSubtitle: 'Full ZKPOS access — floor, settle, stock, masters, day close',
    nav: allNav,
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
  cashier: {
    label: 'Cashier',
    homeTitle: 'Cashier Desk · KSA',
    homeSubtitle: 'Settle with mada / Apple Pay / STC Pay, takeaway & delivery',
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
  'food-server': {
    label: 'Food Server',
    homeTitle: 'Food Server · Floor',
    homeSubtitle: 'Seat guests, take orders, send kitchen, request payment',
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
  'kitchen-manager': {
    label: 'Kitchen Manager',
    homeTitle: 'Kitchen Manager · KOT',
    homeSubtitle: 'Kitchen display — prep status and ticket pace',
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
  rider: {
    label: 'Delivery rider',
    homeTitle: 'Rider',
    homeSubtitle: 'Assigned deliveries — start & mark delivered',
    nav: ['delivery'],
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
}

export type ManagedRole = {
  id: string
  key: string
  name: string
  nameAr?: string
  system: boolean
  privileges: CustomPrivileges
}

export function isSystemRoleKey(key: string): key is SystemRoleKey {
  return (
    key === 'admin' ||
    key === 'cashier' ||
    key === 'food-server' ||
    key === 'kitchen-manager' ||
    key === 'rider'
  )
}

export function navRequiredByFlags(flags: Omit<AccessFlags, 'nav'>): NavKey[] {
  const keys = new Set<NavKey>(['home'])
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
  if (flags.canManageUsers) {
    keys.add('settings')
  }
  return [...keys]
}

const templateNavKeys: NavKey[] = defaultCustomPrivileges.nav.filter((k) => k !== 'home')

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

/** Screens picked beyond what action flags auto-assign. */
export function explicitNavItems(storedNav: NavKey[], flags: Omit<AccessFlags, 'nav'>): NavKey[] {
  const required = new Set(navRequiredByFlags(flags))
  return storedNav.filter((k): k is NavKey => allNav.includes(k as NavKey) && !required.has(k))
}

function pruneStaleTemplateNav(explicit: NavKey[], flags: Omit<AccessFlags, 'nav'>): NavKey[] {
  if (!explicit.length) return explicit
  const onlyTemplate = explicit.every((k) => templateNavKeys.includes(k))
  if (onlyTemplate && !hasOperationalFlags(flags)) return []
  return explicit
}

/** Union of action-required screens and any explicit module picks. */
export function effectiveNav(flags: CustomPrivileges | RolePermissions): NavKey[] {
  const stored = flags.nav.filter((k): k is NavKey => allNav.includes(k as NavKey))
  const explicit = pruneStaleTemplateNav(explicitNavItems(stored, flags), flags)
  const picked = new Set<NavKey>([...navRequiredByFlags(flags), ...explicit])
  if (!picked.has('home')) picked.add('home')
  return allNav.filter((k) => picked.has(k))
}

/** Recompute nav when action flags change but keep manually chosen modules. */
export function privilegesWithFlagToggle(
  prev: CustomPrivileges,
  key: keyof Omit<AccessFlags, 'nav'>,
): CustomPrivileges {
  const nextFlags = { ...prev, [key]: !prev[key] }
  const explicit = pruneStaleTemplateNav(explicitNavItems(prev.nav, prev), prev)
  return normalizePrivileges({
    ...nextFlags,
    nav: [...new Set<NavKey>([...navRequiredByFlags(nextFlags), ...explicit])],
  })
}

/** Recompute nav when a module toggle is changed. */
export function privilegesWithNavToggle(prev: CustomPrivileges, key: NavKey): CustomPrivileges {
  if (key === 'home') return prev
  const has = prev.nav.includes(key)
  const required = new Set(navRequiredByFlags(prev))
  const explicit = new Set(
    pruneStaleTemplateNav(explicitNavItems(prev.nav, prev), prev).filter((k) => k !== key),
  )
  if (!has) explicit.add(key)
  return normalizePrivileges({
    ...prev,
    nav: [...new Set<NavKey>([...required, ...explicit])],
  })
}

export const emptyRolePrivileges = (): CustomPrivileges =>
  normalizePrivileges({
    nav: ['home'],
    canOpenTable: false,
    canSendOrders: false,
    canChangeTable: false,
    canTempBill: false,
    canSettle: false,
    canManageStock: false,
    canMasters: false,
    canBackOffice: false,
    canManageUsers: false,
  })

export function normalizePrivileges(raw: Partial<CustomPrivileges> | null | undefined): CustomPrivileges {
  const nav = Array.isArray(raw?.nav)
    ? raw.nav.filter((k): k is NavKey => allNav.includes(k as NavKey))
    : [...defaultCustomPrivileges.nav]
  const base: CustomPrivileges = {
    nav,
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

export function flagsFromPermissions(p: RolePermissions): CustomPrivileges {
  return {
    nav: [...p.nav],
    canOpenTable: p.canOpenTable,
    canSendOrders: p.canSendOrders,
    canChangeTable: p.canChangeTable,
    canTempBill: p.canTempBill,
    canSettle: p.canSettle,
    canManageStock: p.canManageStock,
    canMasters: p.canMasters,
    canBackOffice: p.canBackOffice,
    canManageUsers: p.canManageUsers,
  }
}

export function systemManagedRoles(): ManagedRole[] {
  return (Object.keys(rolePermissions) as SystemRoleKey[]).map((key) => {
    const p = rolePermissions[key]
    return {
      id: `sys-${key}`,
      key,
      name: p.label,
      nameAr:
        key === 'admin'
          ? 'مدير'
          : key === 'cashier'
            ? 'أمين الصندوق'
            : key === 'food-server'
              ? 'نادل'
              : 'مدير المطبخ',
      system: true,
      privileges: flagsFromPermissions(p),
    }
  })
}

export function activeCompanyId() {
  try {
    const raw = localStorage.getItem(TERMINAL_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string }
      if (parsed?.id) return parsed.id
    }
  } catch {
    /* ignore */
  }
  return localStorage.getItem(COMPANY_KEY) || 'co-mesa'
}

function rolesStorageKey(companyId: string) {
  return `${ROLES_PREFIX}${companyId}`
}

export function loadManagedRoles(companyId = activeCompanyId()): ManagedRole[] {
  const seeded = systemManagedRoles()
  try {
    const raw = localStorage.getItem(rolesStorageKey(companyId))
    if (!raw) return seeded
    const parsed = JSON.parse(raw) as ManagedRole[]
    if (!Array.isArray(parsed) || !parsed.length) return seeded
    const byKey = new Map(parsed.map((r) => [r.key, r]))
    for (const sys of seeded) {
      const existing = byKey.get(sys.key)
      if (!existing) byKey.set(sys.key, sys)
      else {
        byKey.set(sys.key, {
          ...existing,
          system: true,
          privileges: normalizePrivileges(existing.privileges),
        })
      }
    }
    return [...byKey.values()].map((r) => ({
      ...r,
      privileges: normalizePrivileges(r.privileges),
    }))
  } catch {
    return seeded
  }
}

export function saveManagedRoles(roles: ManagedRole[], companyId = activeCompanyId()) {
  localStorage.setItem(rolesStorageKey(companyId), JSON.stringify(roles))
  window.dispatchEvent(new Event('mesa:roles-changed'))
}

export function fromApiRole(row: Record<string, unknown>): ManagedRole {
  return {
    id: String(row.id),
    key: String(row.key ?? ''),
    name: String(row.name ?? ''),
    nameAr: row.nameAr ? String(row.nameAr) : '',
    system: row.system === true,
    privileges: normalizePrivileges(row.privileges as Partial<CustomPrivileges>),
  }
}

export function mergeRemoteRoles(
  local: ManagedRole[],
  remote: ManagedRole[],
  pendingUpserts: ManagedRole[] = [],
  pendingDeletes: string[] = [],
): ManagedRole[] {
  const byKey = new Map<string, ManagedRole>()
  if (remote.length) {
    // Server list wins — do not keep local-only custom roles that peers never had.
    for (const row of remote) {
      if (row.key) byKey.set(row.key, row)
    }
    for (const row of local) {
      if (!row.key || byKey.has(row.key)) continue
      // Keep system templates if API omitted them briefly.
      if (row.system) byKey.set(row.key, row)
    }
  } else {
    for (const row of local) {
      if (row.key) byKey.set(row.key, row)
    }
  }
  for (const row of pendingUpserts) {
    if (!row?.key) continue
    const prev = byKey.get(row.key)
    byKey.set(row.key, {
      ...prev,
      ...row,
      privileges: normalizePrivileges(row.privileges ?? prev?.privileges),
    })
  }
  for (const id of pendingDeletes) {
    for (const [key, row] of byKey) {
      if (row.id === id) byKey.delete(key)
    }
  }
  return [...byKey.values()]
}

export function findManagedRole(key: string, companyId = activeCompanyId()) {
  return loadManagedRoles(companyId).find((r) => r.key === key) ?? null
}

export function upsertManagedRole(
  input: { id?: string; key?: string; name: string; nameAr?: string; privileges: CustomPrivileges },
  companyId = activeCompanyId(),
) {
  const roles = loadManagedRoles(companyId)
  const name = input.name.trim()
  const key = (input.key ?? name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!name || !key) throw new Error('Role name required')
  const nameTaken = roles.some(
    (r) => r.name.trim().toLowerCase() === name.toLowerCase() && r.id !== input.id,
  )
  if (nameTaken) throw new Error('Role name already exists')
  const privileges = normalizePrivileges(input.privileges)

  if (input.id) {
    const idx = roles.findIndex((r) => r.id === input.id)
    if (idx < 0) throw new Error('Role not found')
    const existing = roles[idx]
    roles[idx] = {
      ...existing,
      name,
      nameAr: input.nameAr?.trim() || existing.nameAr,
      privileges: existing.key === 'admin' ? flagsFromPermissions(rolePermissions.admin) : privileges,
      key: existing.system ? existing.key : key,
    }
    saveManagedRoles(roles, companyId)
    return roles[idx]
  }

  if (roles.some((r) => r.key === key)) throw new Error('Role key already exists')
  const row: ManagedRole = {
    id: `role-${Date.now()}`,
    key,
    name,
    nameAr: input.nameAr?.trim() || '',
    system: false,
    privileges,
  }
  saveManagedRoles([...roles, row], companyId)
  return row
}

export function deleteManagedRole(id: string, companyId = activeCompanyId()) {
  const roles = loadManagedRoles(companyId)
  const role = roles.find((r) => r.id === id)
  if (!role) throw new Error('Role not found')
  if (role.system) throw new Error('System roles cannot be deleted')
  saveManagedRoles(
    roles.filter((r) => r.id !== id),
    companyId,
  )
}

export function loadCustomPrivileges(): CustomPrivileges {
  const managed = findManagedRole('custom')
  if (managed) return normalizePrivileges(managed.privileges)
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as CustomPrivileges
      if (parsed && Array.isArray(parsed.nav)) return normalizePrivileges(parsed)
    }
  } catch {
    /* ignore */
  }
  return { ...defaultCustomPrivileges, nav: [...defaultCustomPrivileges.nav] }
}

export function saveCustomPrivileges(priv: CustomPrivileges) {
  const next = normalizePrivileges(priv)
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(next))
  try {
    const companyId = activeCompanyId()
    const roles = loadManagedRoles(companyId)
    const idx = roles.findIndex((r) => r.key === 'custom')
    if (idx >= 0) {
      roles[idx] = { ...roles[idx], privileges: next }
    } else {
      roles.push({
        id: 'role-custom',
        key: 'custom',
        name: 'Custom',
        nameAr: 'مخصص',
        system: false,
        privileges: next,
      })
    }
    saveManagedRoles(roles, companyId)
  } catch {
    /* ignore */
  }
}

function permissionsFromManaged(role: ManagedRole): RolePermissions {
  const locked = role.key === 'admin'
  const flags = locked ? flagsFromPermissions(rolePermissions.admin) : normalizePrivileges(role.privileges)
  return {
    label: role.name,
    homeTitle: `${role.name} · KSA`,
    homeSubtitle: isSystemRoleKey(role.key)
      ? rolePermissions[role.key].homeSubtitle
      : 'Privileges set by Admin',
    ...flags,
    nav: locked ? allNav : flags.nav,
  }
}

const deniedPermissions = (label: string): RolePermissions => ({
  label,
  homeTitle: `${label} · KSA`,
  homeSubtitle: 'Privileges set by Admin',
  nav: ['home'],
  canOpenTable: false,
  canSendOrders: false,
  canChangeTable: false,
  canTempBill: false,
  canSettle: false,
  canManageStock: false,
  canMasters: false,
  canBackOffice: false,
  canManageUsers: false,
})

export function getPermissions(role: RoleKey): RolePermissions {
  const managed = findManagedRole(role)
  if (managed) return permissionsFromManaged(managed)
  if (role === 'custom') {
    const c = normalizePrivileges(loadCustomPrivileges())
    return {
      label: 'Custom',
      homeTitle: 'Custom role · KSA',
      homeSubtitle: 'Privileges set by Admin (Role Privilege)',
      ...c,
    }
  }
  if (isSystemRoleKey(role)) return rolePermissions[role]
  return deniedPermissions(roleDisplayName(role))
}

export function roleDisplayName(role: RoleKey) {
  return findManagedRole(role)?.name ?? getPermissions(role).label
}

export const navMeta: Record<NavKey, { to: string; label: string; end?: boolean }> = {
  home: { to: '/', label: 'Home', end: true },
  'dine-in': { to: '/dine-in', label: 'Floor' },
  payments: { to: '/payments', label: 'Payments' },
  takeaway: { to: '/takeaway', label: 'Takeaway' },
  delivery: { to: '/delivery', label: 'Delivery' },
  online: { to: '/online', label: 'Online' },
  kitchen: { to: '/kitchen', label: 'KOT' },
  inventory: { to: '/inventory', label: 'Stock' },
  suppliers: { to: '/suppliers', label: 'Vendors' },
  'purchase-orders': { to: '/purchase-orders', label: 'POs' },
  crm: { to: '/crm', label: 'CRM' },
  masters: { to: '/masters', label: 'Masters' },
  settings: { to: '/settings', label: 'Settings', end: true },
  'back-office': { to: '/back-office', label: 'Office' },
  expenses: { to: '/expenses', label: 'Expenses', end: true },
}

export const allNavKeys = allNav

export function pathAllowed(role: RoleKey, pathname: string) {
  if (role === 'rider') {
    return pathname === '/rider' || pathname.startsWith('/rider/')
  }
  const perms = getPermissions(role)
  const isAdmin = role === 'admin'

  if (pathname.startsWith('/settings/users') || pathname.startsWith('/settings/roles')) {
    return perms.canManageUsers || isAdmin
  }

  if (pathname === '/settings') {
    return (
      perms.canMasters ||
      perms.canManageUsers ||
      perms.canBackOffice ||
      isAdmin ||
      perms.nav.includes('settings')
    )
  }

  if (pathname.startsWith('/settings/accounts') || pathname.startsWith('/expenses')) {
    return perms.canBackOffice || perms.canMasters || isAdmin || perms.nav.includes('expenses')
  }

  if (pathname.startsWith('/back-office')) {
    return perms.canBackOffice || isAdmin || perms.nav.includes('back-office')
  }

  if (pathname.startsWith('/settings/ingredients')) {
    return perms.canMasters || isAdmin
  }
  if (pathname.startsWith('/settings/inventory')) {
    return perms.canManageStock || perms.canMasters || isAdmin
  }
  if (
    pathname.startsWith('/settings/database') ||
    pathname.startsWith('/settings/company') ||
    pathname.startsWith('/settings/tax') ||
    pathname.startsWith('/settings/tax-update') ||
    pathname.startsWith('/settings/discount') ||
    pathname.startsWith('/settings/extra-charges') ||
    pathname.startsWith('/settings/printers') ||
    pathname.startsWith('/settings/delivery') ||
    pathname.startsWith('/settings/notifications') ||
    pathname.startsWith('/settings/units') ||
    pathname.startsWith('/settings/menu-details') ||
    pathname.startsWith('/settings/departments') ||
    pathname.startsWith('/settings/gift-cards') ||
    pathname.startsWith('/settings/food-vouchers') ||
    pathname.startsWith('/settings/menu-timetable') ||
    pathname.startsWith('/settings/floor') ||
    pathname.startsWith('/settings/vendors') ||
    pathname.startsWith('/settings/accounts') ||
    pathname.startsWith('/settings/products') ||
    pathname.startsWith('/masters')
  ) {
    return perms.canMasters || isAdmin
  }

  if (pathname === '/inventory' || pathname.startsWith('/inventory/')) {
    return perms.canManageStock || perms.canMasters || isAdmin || perms.nav.includes('inventory')
  }
  if (pathname === '/suppliers' || pathname.startsWith('/suppliers/')) {
    return perms.canManageStock || isAdmin || perms.nav.includes('suppliers')
  }
  if (pathname === '/purchase-orders' || pathname.startsWith('/purchase-orders/')) {
    return perms.canManageStock || isAdmin || perms.nav.includes('purchase-orders')
  }

  const allowed = perms.nav.map((key) => navMeta[key].to)
  if (pathname === '/') return allowed.includes('/')
  if (pathname.startsWith('/quick-serve') || pathname.startsWith('/drive-thru')) {
    return allowed.some((to) => to === '/takeaway' || to === '/payments' || to === '/dine-in')
  }
  if (pathname === '/crm' || pathname.startsWith('/settings/customers')) {
    return allowed.includes('/crm') || allowed.includes('/settings')
  }
  if (pathname.startsWith('/rider')) {
    return allowed.includes('/delivery') || isAdmin
  }
  if (pathname.startsWith('/courier')) {
    return allowed.includes('/delivery') || isAdmin
  }
  return allowed.some((to) => to !== '/' && (pathname === to || pathname.startsWith(`${to}/`)))
}

export function settingsSectionAllowed(
  section: SettingsSectionId,
  role: RoleKey,
): boolean {
  const perms = getPermissions(role)
  if (role === 'admin') return true
  switch (section) {
    case 'user':
      return perms.canManageUsers
    case 'accounts':
      return perms.canBackOffice || perms.canMasters
    case 'inventory':
      return perms.canManageStock || perms.canMasters
    case 'ingredients':
    case 'products':
    case 'printer':
    case 'database':
    case 'settings':
      return perms.canMasters
    default:
      return false
  }
}

export const systemRoleKeys: SystemRoleKey[] = [
  'admin',
  'cashier',
  'food-server',
  'kitchen-manager',
]

/** Built-in + custom for login / UI lists */
export const roleKeys: RoleKey[] = [...systemRoleKeys, 'custom']

export function assignableRoleKeys(companyId = activeCompanyId()): string[] {
  const keys = loadManagedRoles(companyId).map((r) => r.key)
  if (!keys.includes('custom')) keys.push('custom')
  return keys
}
