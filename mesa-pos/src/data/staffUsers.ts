import { staffAccounts, type StaffAccount } from './staff'
import { roleDisplayName, type RoleKey } from '../auth/roles'

export type ManagedUser = {
  id: string
  username: string
  name: string
  nameAr?: string
  role: RoleKey
  branchId?: string | null
  active: boolean
  pin?: string
  companyId?: string
}

const USERS_PREFIX = 'mesa-users:'

function usersKey(companyId: string) {
  return `${USERS_PREFIX}${companyId}`
}

function demoUsername(staff: StaffAccount) {
  const map: Record<string, string> = {
    st1: 'admin',
    st4: 'cashier',
    st2: 'server',
    st3: 'kitchen',
    st5: 'custom',
  }
  return map[staff.id] ?? staff.id
}

const SEED_NAME_AR: Record<string, string> = {
  st1: 'أمينة خان',
  st2: 'ليو مارتينز',
  st3: 'سارة نجوين',
  st4: 'عمر فارس',
  st5: 'حسن علي',
}

export function seedManagedUsers(): ManagedUser[] {
  return staffAccounts.map((s) => ({
    id: s.id,
    username: demoUsername(s),
    name: s.name,
    nameAr: SEED_NAME_AR[s.id] ?? '',
    role: s.role,
    branchId: null,
    active: true,
    pin: s.pin,
  }))
}

const SEED_USER_IDS = new Set(staffAccounts.map((s) => s.id))

/** Demo seed rows (Amina / Omar / …) — never show these once the API has real users. */
export function isSeedManagedUser(row: { id?: string; username?: string }) {
  if (row.id && SEED_USER_IDS.has(row.id)) return true
  const u = String(row.username ?? '').toLowerCase()
  return u === 'admin' || u === 'cashier' || u === 'server' || u === 'kitchen' || u === 'custom'
}

function backfillSeedNameAr(rows: ManagedUser[]): ManagedUser[] {
  return rows.map((row) => {
    if (row.nameAr?.trim() || !row.id) return row
    const fallback = SEED_NAME_AR[row.id]
    return fallback ? { ...row, nameAr: fallback } : row
  })
}

export function loadManagedUsers(companyId: string): ManagedUser[] {
  try {
    const raw = localStorage.getItem(usersKey(companyId))
    if (!raw) return seedManagedUsers()
    const parsed = JSON.parse(raw) as ManagedUser[]
    if (!Array.isArray(parsed) || !parsed.length) return seedManagedUsers()
    return backfillSeedNameAr(parsed)
  } catch {
    return seedManagedUsers()
  }
}

export function saveManagedUsers(companyId: string, rows: ManagedUser[]) {
  localStorage.setItem(usersKey(companyId), JSON.stringify(rows))
  window.dispatchEvent(new Event('mesa:users-changed'))
}

export function fromApiUser(row: Record<string, unknown>, companyId: string, keepPin?: string): ManagedUser {
  return {
    id: String(row.id),
    username: String(row.username ?? ''),
    name: String(row.name ?? ''),
    nameAr: row.nameAr ? String(row.nameAr) : '',
    role: String(row.role ?? 'cashier'),
    branchId: row.branchId ? String(row.branchId) : null,
    active: row.active !== false,
    companyId: row.companyId ? String(row.companyId) : companyId,
    pin: keepPin,
  }
}

export function mergeRemoteUsers(
  local: ManagedUser[],
  remote: ManagedUser[],
  pending: ManagedUser[] = [],
): ManagedUser[] {
  const pinByUsername = new Map<string, string>()
  for (const row of local) {
    if (row.pin) pinByUsername.set(row.username, row.pin)
  }
  const byUsername = new Map<string, ManagedUser>()
  // Server list wins. Do not resurrect seed/demo locals that are absent remotely.
  const source = remote.length ? remote : local.filter((r) => !isSeedManagedUser(r))
  for (const row of source) {
    if (!row.username) continue
    if (remote.length && isSeedManagedUser(row) && !remote.some((r) => r.id === row.id)) continue
    byUsername.set(row.username, { ...row, pin: row.pin || pinByUsername.get(row.username) })
  }
  if (remote.length) {
    for (const row of local) {
      if (!row.username || byUsername.has(row.username)) continue
      if (isSeedManagedUser(row)) continue
      byUsername.set(row.username, row)
    }
  }
  for (const row of pending) {
    if (!row?.username) continue
    const prev = byUsername.get(row.username)
    byUsername.set(row.username, { ...prev, ...row, pin: row.pin || prev?.pin })
  }
  return [...byUsername.values()]
}

export function toStaffAccount(row: ManagedUser): StaffAccount {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    roleLabel: roleDisplayName(row.role),
    pin: row.pin ?? '',
    initials: row.name
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  }
}

export function upsertManagedUser(
  companyId: string,
  input: {
    id?: string
    name: string
    nameAr?: string
    username: string
    pin?: string
    role: string
    branchId?: string | null
    active?: boolean
  },
) {
  const rows = loadManagedUsers(companyId)
  const username = input.username.trim().toLowerCase()
  const name = input.name.trim()
  if (!name) throw new Error('Name required')
  if (username.length < 3) throw new Error('Username min 3 characters')
  if (rows.some((r) => r.username === username && r.id !== input.id)) {
    throw new Error('Username already used')
  }

  if (input.id) {
    const idx = rows.findIndex((r) => r.id === input.id)
    if (idx < 0) throw new Error('User not found')
    const existing = rows[idx]
    if (existing.role === 'admin' && input.role !== 'admin') {
      throw new Error('Admin role cannot be changed')
    }
    if (existing.role !== 'admin' && input.role === 'admin') {
      throw new Error('Admin role cannot be assigned')
    }
    if (existing.role === 'admin' && input.active === false) {
      const otherAdmins = rows.filter((r) => r.id !== existing.id && r.role === 'admin' && r.active)
      if (!otherAdmins.length) throw new Error('Keep at least one active Admin')
    }
    if (input.pin && input.pin.trim().length < 4) throw new Error('PIN min 4 characters')
    rows[idx] = {
      ...existing,
      name,
      nameAr: input.nameAr?.trim() || existing.nameAr,
      username,
      role: input.role,
      branchId: input.branchId ?? existing.branchId,
      active: input.active !== false,
      pin: input.pin?.trim() || existing.pin,
      companyId,
    }
    saveManagedUsers(companyId, rows)
    return rows[idx]
  }

  if (!input.pin?.trim() || input.pin.trim().length < 4) throw new Error('PIN min 4 characters')
  if (input.role === 'admin') throw new Error('Admin role cannot be assigned')
  const row: ManagedUser = {
    id: `u-${Date.now()}`,
    username,
    name,
    nameAr: input.nameAr?.trim() || '',
    role: input.role,
    branchId: input.branchId ?? null,
    active: input.active !== false,
    pin: input.pin.trim(),
    companyId,
  }
  saveManagedUsers(companyId, [row, ...rows])
  return row
}
