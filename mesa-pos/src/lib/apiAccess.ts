import {
  loadManagedRoles,
  mergeRemoteRoles,
  saveManagedRoles,
  type CustomPrivileges,
  type ManagedRole,
  normalizePrivileges,
} from '../auth/roles'
import { accessOutboxOverlay } from '../sync/accessOutbox'
import { getApiBaseUrl } from './apiBase'

export type ApiRole = {
  id: string
  key: string
  name: string
  nameAr?: string | null
  system: boolean
  privileges: CustomPrivileges
}

export type ApiAccessUser = {
  id: string
  username: string
  name: string
  nameAr?: string | null
  role: string
  active: boolean
  branchId?: string | null
  companyId?: string | null
}

const API_BASE = () => getApiBaseUrl()

function token() {
  return sessionStorage.getItem('mesa-token')
}

async function parseError(res: Response) {
  const text = await res.text()
  try {
    const json = JSON.parse(text) as { message?: string | string[] }
    const msg = Array.isArray(json.message) ? json.message.join(', ') : json.message
    return msg || text || `Request failed (${res.status})`
  } catch {
    return text || `Request failed (${res.status})`
  }
}

async function accessFetch(path: string, init?: RequestInit) {
  const base = API_BASE()
  if (!base) throw new Error('API not configured')
  const auth = token()
  if (!auth) throw new Error('Sign in required')
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(await parseError(res))
  if (res.status === 204) return null
  return res.json()
}

export function apiAccessReady() {
  return Boolean(API_BASE() && token() && navigator.onLine)
}

export async function apiListRoles(): Promise<ApiRole[]> {
  return accessFetch('/access/roles') as Promise<ApiRole[]>
}

export async function apiSaveRole(input: {
  id?: string
  name: string
  nameAr?: string
  key?: string
  privileges: CustomPrivileges
}): Promise<ApiRole> {
  if (input.id) {
    return accessFetch(`/access/roles/${input.id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }) as Promise<ApiRole>
  }
  return accessFetch('/access/roles', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as Promise<ApiRole>
}

export async function apiDeleteRole(id: string) {
  return accessFetch(`/access/roles/${id}`, { method: 'DELETE' })
}

export async function apiListUsers(branchId?: string): Promise<ApiAccessUser[]> {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return accessFetch(`/access/users${qs}`) as Promise<ApiAccessUser[]>
}

export async function apiSaveUser(input: {
  id?: string
  name: string
  nameAr?: string
  username: string
  pin?: string
  role: string
  branchId?: string | null
  active?: boolean
}): Promise<ApiAccessUser> {
  if (input.id) {
    return accessFetch(`/access/users/${input.id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }) as Promise<ApiAccessUser>
  }
  return accessFetch('/access/users', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as Promise<ApiAccessUser>
}

export function cacheApiRoles(companyId: string, rows: ApiRole[]) {
  const mapped: ManagedRole[] = rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    nameAr: r.nameAr ?? '',
    system: r.system,
    privileges: normalizePrivileges(r.privileges),
  }))
  saveManagedRoles(mapped, companyId)
}

export async function syncCompanyRoles(companyId: string) {
  const overlay = accessOutboxOverlay()
  if (!apiAccessReady()) {
    return mergeRemoteRoles(
      loadManagedRoles(companyId),
      [],
      overlay.pendingRoles,
      overlay.pendingRoleDeletes,
    )
  }
  const rows = await apiListRoles()
  const remote: ManagedRole[] = rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    nameAr: r.nameAr ?? '',
    system: r.system,
    privileges: normalizePrivileges(r.privileges),
  }))
  const merged = mergeRemoteRoles(
    loadManagedRoles(companyId),
    remote,
    overlay.pendingRoles,
    overlay.pendingRoleDeletes,
  )
  saveManagedRoles(merged, companyId)
  return merged
}
