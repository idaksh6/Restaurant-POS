import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as bcrypt from 'bcryptjs'
import { staffAccounts, type StaffAccount } from '../data/staff'
import { loadManagedUsers, toStaffAccount } from '../data/staffUsers'
import { hydrateCompanySession, seedBranches, seedCompany } from '../data/company'
import { mapApiBranches } from '../lib/branding'
import { roleDisplayName } from '../auth/roles'
import { syncCompanyRoles } from '../lib/apiAccess'
import {
  apiActivateTerminal,
  apiConfigured,
  apiHealth,
  apiListStaff,
  apiLogin,
  apiRiderLogin,
  mapApiRole,
  type ApiCompany,
  type ApiStaff,
} from '../lib/apiAuth'
import { loadAllRiders, seedRiders } from '../data/deliveryRiders'
import { apiGetCompany, apiListBranches, apiMastersReady } from '../lib/apiMasters'
import { activeMesaDbCompanyId, openMesaDbForCompany } from '../data/repos/db'
import { companyOutboxOverlay } from '../sync/companyOutbox'

type CachedStaff = StaffAccount & {
  username: string
  pinHash?: string
  companyId?: string | null
}

type AuthContextValue = {
  user: StaffAccount | null
  staffList: StaffAccount[]
  companyId: string | null
  selectedCompany: ApiCompany | null
  authMode: 'api' | 'local' | 'offline-cache'
  apiOnline: boolean
  token: string | null
  login: (username: string, pin: string) => Promise<true | false | 'inactive'>
  loginRider: (pin: string) => Promise<boolean>
  logout: () => void
  refreshStaff: () => Promise<boolean>
  /** Keep signed-in user in sync after editing users (branch, name, role). */
  applyUserProfile: (patch: Partial<StaffAccount> & { id: string }) => void
  bindTerminal: (company: ApiCompany) => Promise<void>
  activateTerminal: (taxId: string) => Promise<void>
  /** Clear company bind (e.g. license expired) so activation page shows again. */
  clearTerminalBinding: () => void
  updateSelectedCompany: (company: ApiCompany) => void | Promise<void>
}

const TOKEN_KEY = 'mesa-token'
const USER_KEY = 'mesa-user'
const USER_BRANCH_KEY = 'mesa-user-branch'

function persistUserSession(user: StaffAccount, accessToken?: string | null) {
  sessionStorage.setItem(USER_KEY, user.id)
  if (user.branchId) sessionStorage.setItem(USER_BRANCH_KEY, user.branchId)
  else sessionStorage.removeItem(USER_BRANCH_KEY)
  if (accessToken) {
    sessionStorage.setItem(TOKEN_KEY, accessToken)
  }
}

function clearUserSession() {
  sessionStorage.removeItem(USER_KEY)
  sessionStorage.removeItem(USER_BRANCH_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem('mesa-rider-session')
}
const COMPANY_KEY = 'mesa-login-company-id'
const TERMINAL_COMPANY_KEY = 'mesa-terminal-company'
const STAFF_CACHE_PREFIX = 'mesa-staff-cache:'

const LOCAL_COMPANY: ApiCompany = {
  id: seedCompany.id,
  companyName: seedCompany.companyName,
  aliasName: seedCompany.aliasName,
  taxId: seedCompany.taxId,
  hqPhone: seedCompany.hqPhone,
}

function toCompanyProfile(company: ApiCompany) {
  return {
    id: company.id,
    companyName: company.companyName,
    aliasName: company.aliasName ?? '',
    taxId: company.taxId ?? '',
    enableTax: company.enableTax ?? true,
    ...(company.zatcaEnabled !== undefined ? { zatcaEnabled: !!company.zatcaEnabled } : {}),
    currency: company.currency ?? 'Saudi Arabia · SAR',
    hqPhone: company.hqPhone ?? undefined,
    logoDataUrl: company.logoDataUrl ?? undefined,
  }
}

function persistBoundCompany(
  company: ApiCompany,
  branches?: ApiCompany['branches'],
  activeBranchId?: string | null,
) {
  let mapped = mapApiBranches(company.id, branches ?? company.branches)
  if (!mapped.length) {
    mapped =
      company.id === seedCompany.id
        ? seedBranches
        : [
            {
              id: `${company.id}-main`,
              companyId: company.id,
              name: 'Main',
              nameAr: '',
              code: 'MAIN',
              address: '',
              addressAr: '',
              phone: company.hqPhone ?? '',
              active: true,
            },
          ]
  }
  hydrateCompanySession(toCompanyProfile(company), mapped, {
    ...companyOutboxOverlay(),
    activeBranchId,
  })
}

const AuthContext = createContext<AuthContextValue | null>(null)

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function fromApiStaff(s: ApiStaff): CachedStaff {
  const role = mapApiRole(s.role)
  return {
    id: s.id,
    name: s.name,
    role,
    roleLabel: roleDisplayName(role),
    pin: '',
    initials: initials(s.name),
    branchId: s.branchId ?? null,
    username: s.username,
    pinHash: s.pinHash,
    companyId: s.companyId,
  }
}

function staffCacheKey(companyId: string) {
  return `${STAFF_CACHE_PREFIX}${companyId}`
}

function loadStaffCache(companyId: string): CachedStaff[] {
  try {
    const raw = localStorage.getItem(staffCacheKey(companyId))
    if (!raw) return []
    return (JSON.parse(raw) as ApiStaff[]).map(fromApiStaff)
  } catch {
    return []
  }
}

function saveStaffCache(companyId: string, rows: ApiStaff[]) {
  localStorage.setItem(staffCacheKey(companyId), JSON.stringify(rows))
}

function loadTerminalCompany(): ApiCompany | null {
  try {
    const raw = localStorage.getItem(TERMINAL_COMPANY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ApiCompany
    return parsed?.id ? parsed : null
  } catch {
    return null
  }
}

function saveTerminalCompany(company: ApiCompany) {
  localStorage.setItem(TERMINAL_COMPANY_KEY, JSON.stringify(company))
  localStorage.setItem(COMPANY_KEY, company.id)
}

function clearTerminalCompany() {
  localStorage.removeItem(TERMINAL_COMPANY_KEY)
  localStorage.removeItem(COMPANY_KEY)
}

function demoUsernameFor(staffId: string, role: StaffAccount['role']) {
  const map: Record<string, string> = {
    st1: 'admin',
    st4: 'cashier',
    st2: 'server',
    st3: 'kitchen',
  }
  if (map[staffId]) return map[staffId]
  if (role === 'admin') return 'admin'
  if (role === 'cashier') return 'cashier'
  if (role === 'food-server') return 'server'
  if (role === 'kitchen-manager') return 'kitchen'
  return staffId
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiOnline, setApiOnline] = useState(false)
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))
  const [selectedCompany, setSelectedCompany] = useState<ApiCompany | null>(loadTerminalCompany)
  const [companyId, setCompanyId] = useState<string | null>(
    () => loadTerminalCompany()?.id ?? localStorage.getItem(COMPANY_KEY),
  )
  const [cachedApiStaff, setCachedApiStaff] = useState<CachedStaff[]>(() => {
    const id = loadTerminalCompany()?.id ?? localStorage.getItem(COMPANY_KEY)
    return id ? loadStaffCache(id) : []
  })
  const [user, setUser] = useState<StaffAccount | null>(() => {
    const saved = sessionStorage.getItem(USER_KEY)
    if (!saved) return null
    const id = loadTerminalCompany()?.id ?? localStorage.getItem(COMPANY_KEY)
    const cached = id ? loadStaffCache(id) : []
    const found =
      cached.find((s) => s.id === saved) ?? staffAccounts.find((s) => s.id === saved) ?? null
    if (!found) return null
    // Prefer staff/API branchId (including explicit null = all branches).
    // Do not fall back to session when cache says null — that kept Admin locked to one branch.
    return {
      ...found,
      branchId: found.branchId ?? null,
    }
  })

  const authMode: 'api' | 'local' | 'offline-cache' = !apiConfigured()
    ? 'local'
    : apiOnline
      ? 'api'
      : cachedApiStaff.length || selectedCompany
        ? 'offline-cache'
        : 'local'

  const staffList: StaffAccount[] = useMemo(() => {
    if (!companyId) return []
    if (cachedApiStaff.length) return cachedApiStaff
    if (authMode === 'local' && companyId === LOCAL_COMPANY.id) {
      return loadManagedUsers(companyId)
        .filter((u) => u.active)
        .map(toStaffAccount)
    }
    return []
  }, [cachedApiStaff, companyId, authMode])

  const loadStaffFor = useCallback(async (id: string) => {
    const rows = await apiListStaff(id)
    saveStaffCache(id, rows)
    const mapped = rows.map(fromApiStaff)
    setCachedApiStaff(mapped)
    setUser((prev) => {
      if (!prev) return prev
      const match = mapped.find((s) => s.id === prev.id)
      if (!match) return prev
      const next: StaffAccount = {
        ...prev,
        name: match.name,
        role: match.role,
        roleLabel: match.roleLabel,
        branchId: match.branchId ?? null,
        initials: match.initials,
      }
      persistUserSession(next)
      return next
    })
    void syncCompanyRoles(id).catch(() => undefined)
    const fromStaff = rows[0]?.company
    if (fromStaff?.companyName) {
      const companyName = fromStaff.companyName
      setSelectedCompany((prev) => {
        const next: ApiCompany = {
          ...(prev ?? { id, companyName }),
          id,
          companyName,
          aliasName: fromStaff.aliasName ?? prev?.aliasName,
        }
        const stored = loadTerminalCompany()
        if (!stored) saveTerminalCompany(next)
        return next
      })
    }
  }, [])

  const applyUserProfile = useCallback((patch: Partial<StaffAccount> & { id: string }) => {
    setUser((prev) => {
      if (!prev || prev.id !== patch.id) return prev
      const next: StaffAccount = {
        ...prev,
        ...patch,
        branchId: patch.branchId !== undefined ? patch.branchId : prev.branchId,
      }
      persistUserSession(next)
      return next
    })
  }, [])

  const bindTerminal = useCallback(
    async (company: ApiCompany) => {
      const prevDb = activeMesaDbCompanyId()
      await openMesaDbForCompany(company.id)
      saveTerminalCompany(company)
      setSelectedCompany(company)
      setCompanyId(company.id)
      setCachedApiStaff(loadStaffCache(company.id))
      persistBoundCompany(company)
      if (apiConfigured() && navigator.onLine) {
        try {
          await loadStaffFor(company.id)
          setApiOnline(true)
        } catch {
          setApiOnline(false)
        }
      }
      // Different company = different offline DB — reload so React state matches.
      if (prevDb !== company.id) {
        window.location.reload()
      }
    },
    [loadStaffFor],
  )

  const updateSelectedCompany = useCallback(async (company: ApiCompany) => {
    const prevDb = activeMesaDbCompanyId()
    await openMesaDbForCompany(company.id)
    saveTerminalCompany(company)
    setSelectedCompany(company)
    setCompanyId(company.id)
    persistBoundCompany(company, company.branches)
    if (prevDb !== company.id) window.location.reload()
  }, [])

  const clearTerminalBinding = useCallback(() => {
    clearTerminalCompany()
    setSelectedCompany(null)
    setCompanyId(null)
    setCachedApiStaff([])
    setUser(null)
    setToken(null)
    clearUserSession()
  }, [])

  const activateTerminal = useCallback(
    async (taxId: string) => {
      const vat = taxId.trim()
      if (apiConfigured() && navigator.onLine) {
        const company = await apiActivateTerminal(vat)
        await bindTerminal(company)
        return
      }
      if (vat === LOCAL_COMPANY.taxId) {
        await bindTerminal(LOCAL_COMPANY)
        return
      }
      throw new Error('No company for this company code or VAT / tax ID')
    },
    [bindTerminal],
  )

  const refreshStaff = useCallback(async () => {
    if (!apiConfigured() || !navigator.onLine) {
      setApiOnline(false)
      return false
    }
    const up = await apiHealth()
    setApiOnline(up)
    if (!up) return false
    const activeId = loadTerminalCompany()?.id ?? localStorage.getItem(COMPANY_KEY)
    if (!activeId) return true
    try {
      await loadStaffFor(activeId)
      return true
    } catch {
      setApiOnline(false)
      return false
    }
  }, [loadStaffFor])

  useEffect(() => {
    void refreshStaff()
    const on = () => void refreshStaff()
    const off = () => setApiOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener('mesa:access-refresh', on)
    window.addEventListener('mesa:users-changed', on)
    const id = window.setInterval(() => void refreshStaff(), 20000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener('mesa:access-refresh', on)
      window.removeEventListener('mesa:users-changed', on)
      window.clearInterval(id)
    }
  }, [refreshStaff])

  useEffect(() => {
    if (!token || !companyId || !apiMastersReady()) return
    let cancelled = false
    void (async () => {
      try {
        const [row, rows] = await Promise.all([apiGetCompany(), apiListBranches()])
        if (cancelled || !row?.id || !row.companyName) return
        const next: ApiCompany = { ...row, branches: rows }
        saveTerminalCompany(next)
        setSelectedCompany(next)
        persistBoundCompany(next, rows)
      } catch {
        /* keep the bound / local company */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, companyId])

  const login = useCallback(
    async (username: string, pin: string): Promise<true | false | 'inactive'> => {
      const uname = username.trim().toLowerCase()
      if (!uname || !pin) return false
      const cached = cachedApiStaff.find((s) => s.username.toLowerCase() === uname)
      const managed = loadManagedUsers(companyId ?? LOCAL_COMPANY.id).find(
        (s) => s.username.toLowerCase() === uname,
      )

      // Known inactive staff — show a clear message (do not treat as wrong PIN).
      if (managed && managed.active === false) return 'inactive'

      if (apiConfigured() && (apiOnline || navigator.onLine)) {
        try {
          const result = await apiLogin(uname, pin, companyId ?? undefined)
          const role = mapApiRole(result.user.role)
          const next: StaffAccount = {
            id: result.user.id,
            name: result.user.name,
            role,
            roleLabel: roleDisplayName(role),
            pin: '',
            initials: initials(result.user.name),
            branchId: result.user.branchId ?? null,
          }
          setUser(next)
          setToken(result.accessToken)
          persistUserSession(next, result.accessToken)
          if (result.company) {
            const bound: ApiCompany = {
              id: result.company.id,
              companyName: result.company.companyName,
              aliasName: result.company.aliasName,
              taxId: result.company.taxId,
              hqPhone: result.company.hqPhone,
              enableTax: result.company.enableTax,
              currency: result.company.currency,
              logoDataUrl: result.company.logoDataUrl,
              branches: result.branches,
            }
            saveTerminalCompany(bound)
            setSelectedCompany(bound)
            setCompanyId(result.company.id)
            persistBoundCompany(bound, result.branches, result.user.branchId)
          }
          setApiOnline(true)
          if (result.company?.id) void syncCompanyRoles(result.company.id).catch(() => undefined)
          void refreshStaff()
          return true
        } catch (err) {
          const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : ''
          const msg = err instanceof Error ? err.message : ''
          if (code === 'inactive' || /inactive/i.test(msg)) return 'inactive'
          if (/license expired|suspended|not activated/i.test(msg)) {
            throw err instanceof Error ? err : new Error(msg || 'POS license blocked')
          }
          setApiOnline(false)
        }
      }

      // Offline / local login — clear JWT so we don't pretend /sync/push will work.
      if (cached?.pinHash) {
        const ok = await bcrypt.compare(pin, cached.pinHash)
        if (ok) {
          setUser(cached)
          setToken(null)
          persistUserSession(cached)
          sessionStorage.removeItem(TOKEN_KEY)
          return true
        }
        return false
      }

      if (managed) {
        if (managed.pin !== pin) return false
        const next = toStaffAccount(managed)
        setUser(next)
        setToken(null)
        persistUserSession(next)
        sessionStorage.removeItem(TOKEN_KEY)
        return true
      }

      const local = staffAccounts.find((s) => demoUsernameFor(s.id, s.role) === uname)
      if (local && local.pin === pin) {
        setUser(local)
        setToken(null)
        persistUserSession(local)
        sessionStorage.removeItem(TOKEN_KEY)
        return true
      }

      return false
    },
    [apiOnline, cachedApiStaff, companyId, refreshStaff],
  )

  const loginRider = useCallback(
    async (pin: string) => {
      const code = pin.replace(/\D/g, '').slice(-4)
      if (code.length < 4) return false
      const cid = companyId ?? loadTerminalCompany()?.id
      if (!cid) return false

      const applyRider = (
        riderId: string,
        name: string,
        accessToken?: string,
        branchId?: string | null,
      ) => {
        const next: StaffAccount = {
          id: `rider:${riderId}`,
          name,
          role: 'rider',
          roleLabel: roleDisplayName('rider'),
          pin: '',
          initials: initials(name),
          riderId,
          branchId: branchId ?? null,
        }
        setUser(next)
        persistUserSession(next, accessToken)
        sessionStorage.setItem(
          'mesa-rider-session',
          JSON.stringify({ riderId, name }),
        )
        if (accessToken) setToken(accessToken)
      }

      if (apiConfigured() && (apiOnline || navigator.onLine)) {
        try {
          const result = await apiRiderLogin(code, cid)
          const riderId = result.user.riderId ?? String(result.user.id).replace(/^rider:/, '')
          applyRider(riderId, result.user.name, result.accessToken, result.user.branchId)
          if (result.company) {
            const bound: ApiCompany = {
              id: result.company.id,
              companyName: result.company.companyName,
              aliasName: result.company.aliasName,
              taxId: result.company.taxId,
              hqPhone: result.company.hqPhone,
              enableTax: result.company.enableTax,
              currency: result.company.currency,
              logoDataUrl: result.company.logoDataUrl,
              branches: result.branches,
            }
            saveTerminalCompany(bound)
            setSelectedCompany(bound)
            setCompanyId(result.company.id)
            persistBoundCompany(bound, result.branches, result.user.branchId)
          }
          setApiOnline(true)
          return true
        } catch {
          setApiOnline(false)
        }
      }

      const localRiders = [...loadAllRiders(), ...seedRiders.map((r) => ({ ...r, branchId: cid }))]
      const matched = localRiders.filter((r) => {
        if (r.active === false) return false
        const digits = String(r.phone ?? '').replace(/\D/g, '')
        return digits.slice(-4) === code
      })
      if (matched.length !== 1) return false
      applyRider(matched[0].id, matched[0].name, undefined, matched[0].branchId)
      return true
    },
    [apiOnline, companyId],
  )

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    clearUserSession()
  }, [])

  const value = useMemo(
    () => ({
      user,
      staffList,
      companyId,
      selectedCompany,
      authMode,
      apiOnline,
      token,
      login,
      loginRider,
      logout,
      refreshStaff,
      applyUserProfile,
      bindTerminal,
      activateTerminal,
      clearTerminalBinding,
      updateSelectedCompany,
    }),
    [
      user,
      staffList,
      companyId,
      selectedCompany,
      authMode,
      apiOnline,
      token,
      login,
      loginRider,
      logout,
      refreshStaff,
      applyUserProfile,
      bindTerminal,
      activateTerminal,
      clearTerminalBinding,
      updateSelectedCompany,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
