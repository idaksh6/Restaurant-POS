import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  allNavKeys,
  emptyRolePrivileges,
  flagsFromPermissions,
  normalizePrivileges,
  privilegesWithFlagToggle,
  privilegesWithNavToggle,
  roleDisplayName,
  rolePermissions,
  upsertManagedRole,
  type CustomPrivileges,
  type ManagedRole,
  type NavKey,
  type SystemRoleKey,
} from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import { cashFromLedger, ledgerForDay, tenderTotals, todayKey } from '../data/ledger'
import { money } from '../data/mock'
import { personDisplayName } from '../lib/branding'
import { buildStaffOnShift, resolveStaffDisplayName } from '../lib/staffOnShift'
import { useBranchUsers } from '../hooks/useBranchUsers'
import { useManagedRoles } from '../hooks/useManagedRoles'
import { apiAccessReady, apiSaveRole } from '../lib/apiAccess'
import { settingsHubPath } from '../lib/settingsHub'
import { localeTag, navI18n, useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'

type Tab = 'overview' | 'sales' | 'day' | 'shift' | 'voids' | 'discounts' | 'roles'

const TAB_IDS: Tab[] = ['overview', 'sales', 'day', 'shift', 'voids', 'discounts', 'roles']

function parseBoTab(value: string | null): Tab {
  if (value && TAB_IDS.includes(value as Tab)) return value as Tab
  return 'overview'
}

function BoIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="bo-ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function IconSales() {
  return (
    <BoIcon>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15v-4M12 15V8M16 15v-6" />
    </BoIcon>
  )
}
function IconCash() {
  return (
    <BoIcon>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M7 12h.01M17 12h.01" />
    </BoIcon>
  )
}
function IconTables() {
  return (
    <BoIcon>
      <rect x="3" y="7" width="18" height="4" rx="1.5" />
      <path d="M6 11v7M18 11v7M10 11v4M14 11v4" />
    </BoIcon>
  )
}
function IconDay() {
  return (
    <BoIcon>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </BoIcon>
  )
}
function IconOffice() {
  return (
    <BoIcon>
      <path d="M4 20V6a2 2 0 0 1 2-2h7v16H4Z" />
      <path d="M13 10h5a2 2 0 0 1 2 2v8h-7V10Z" />
      <path d="M7 8h2M7 12h2M7 16h2" />
    </BoIcon>
  )
}
function IconLedger() {
  return (
    <BoIcon>
      <path d="M7 4h8l2 2v14H7V4Z" />
      <path d="M9.5 10h5M9.5 13h5M9.5 16h3" />
    </BoIcon>
  )
}
function IconShift() {
  return (
    <BoIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </BoIcon>
  )
}
function IconVoid() {
  return (
    <BoIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </BoIcon>
  )
}
function IconDiscount() {
  return (
    <BoIcon>
      <path d="M5 12h14" />
      <circle cx="8" cy="8" r="1.6" />
      <circle cx="16" cy="16" r="1.6" />
      <path d="M7 17 17 7" />
    </BoIcon>
  )
}
function IconRoles() {
  return (
    <BoIcon>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 19c0-2 2-3.5 4.5-3.5S23 17 23 19" />
    </BoIcon>
  )
}
function IconOverview() {
  return (
    <BoIcon>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </BoIcon>
  )
}
function IconTender() {
  return (
    <BoIcon>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </BoIcon>
  )
}
function IconStaff() {
  return (
    <BoIcon>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
    </BoIcon>
  )
}

function localizedRoleName(role: ManagedRole, lang: 'en' | 'ar') {
  if (lang === 'ar' && role.nameAr?.trim()) return role.nameAr.trim()
  return role.name
}

function roleInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

const PRIV_ACTION_KEYS: (keyof Omit<CustomPrivileges, 'nav'>)[] = [
  'canOpenTable',
  'canSendOrders',
  'canChangeTable',
  'canTempBill',
  'canSettle',
  'canManageStock',
  'canMasters',
  'canBackOffice',
  'canManageUsers',
]

function countRoleActions(p: CustomPrivileges) {
  return PRIV_ACTION_KEYS.filter((k) => p[k]).length
}

function methodLabel(
  entry: { method: string; splitPayments?: { method: string; amount: number }[] },
  fmt: (n: number) => string,
) {
  if (entry.splitPayments?.length) {
    return entry.splitPayments.map((p) => `${p.method} ${fmt(p.amount)}`).join(' · ')
  }
  return entry.method || '—'
}

export default function BackOfficePage() {
  const { user, companyId } = useAuth()
  const { t, lang } = useI18n()
  const cid = companyId ?? 'co-mesa'
  const fmtMoney = (n: number) => money(n, lang)
  const { users: managedUsers } = useBranchUsers()
  const {
    ledger,
    tables,
    tickets,
    dayIsClosed,
    closeDay,
    reopenDay,
    flash,
  } = usePos()
  const { activeShift, history, openShift, closeShift } = useShift()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseBoTab(searchParams.get('tab'))

  function setTab(next: Tab) {
    setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true })
  }

  const [search, setSearch] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [floatAmt, setFloatAmt] = useState('200')
  const [shiftCounted, setShiftCounted] = useState('')
  const { roles: managedRoles, loading: rolesLoading } = useManagedRoles(cid)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [roleDraft, setRoleDraft] = useState<CustomPrivileges | null>(null)
  const [roleBusy, setRoleBusy] = useState(false)
  const [rolesMobilePane, setRolesMobilePane] = useState<'list' | 'edit'>('list')

  function pickRole(roleId: string) {
    setSelectedRoleId(roleId)
    setRolesMobilePane('edit')
  }

  useEffect(() => {
    if (tab !== 'roles') setRolesMobilePane('list')
  }, [tab])

  const selectedRole = useMemo(() => {
    if (!managedRoles.length) return null
    return managedRoles.find((r) => r.id === selectedRoleId) ?? managedRoles[0]
  }, [managedRoles, selectedRoleId])

  useEffect(() => {
    if (!selectedRole) {
      setRoleDraft(null)
      return
    }
    setRoleDraft(normalizePrivileges(selectedRole.privileges))
  }, [selectedRole?.id])

  const tabs = useMemo(
    (): { id: Tab; label: string; icon: ReactNode }[] => [
      { id: 'overview', label: t.boTabOverview, icon: <IconOverview /> },
      { id: 'sales', label: t.boTabSalesLedger, icon: <IconLedger /> },
      { id: 'day', label: t.boTabDayClose, icon: <IconDay /> },
      { id: 'shift', label: t.boTabShift, icon: <IconShift /> },
      { id: 'voids', label: t.boTabVoidReport, icon: <IconVoid /> },
      { id: 'discounts', label: t.boTabDiscountReport, icon: <IconDiscount /> },
      { id: 'roles', label: t.boTabRoles, icon: <IconRoles /> },
    ],
    [t],
  )

  const flagLabels = useMemo(
    (): { key: keyof Omit<CustomPrivileges, 'nav'>; label: string }[] => [
      { key: 'canOpenTable', label: t.boPrivOpenTables },
      { key: 'canSendOrders', label: t.boPrivSendKot },
      { key: 'canChangeTable', label: t.boPrivChangeTable },
      { key: 'canTempBill', label: t.boPrivTempBill },
      { key: 'canSettle', label: t.boPrivSettle },
      { key: 'canManageStock', label: t.boPrivStock },
      { key: 'canMasters', label: t.boPrivMasters },
      { key: 'canBackOffice', label: t.boPrivBackOffice },
      { key: 'canManageUsers', label: t.boPrivUsers },
    ],
    [t],
  )

  const navLabel = (key: NavKey) => t[navI18n[key]]

  const day = todayKey()
  const dayEntries = useMemo(() => ledgerForDay(ledger, day), [ledger, day])
  const sales = dayEntries.filter((e) => e.type === 'sale' && e.source !== 'Day Close')
  const voids = dayEntries.filter((e) => e.type === 'void')
  const discounts = dayEntries.filter((e) => e.type === 'discount')
  const tenders = tenderTotals(sales)
  const expectedCash = cashFromLedger(sales)
  const salesTotal = sales.reduce((s, e) => s + e.total, 0)
  const openTables = tables.filter((t) => t.status === 'occupied' || t.status === 'billing')
  const openTickets = tickets.length
  const isAdmin = user?.role === 'admin'
  const q = search.trim().toLowerCase()

  const hourly = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}`,
      amount: 0,
    }))
    for (const e of sales) {
      const h = new Date(e.at).getHours()
      if (Number.isFinite(h)) buckets[h].amount += e.total
    }
    const activeIdx = buckets.map((b, i) => (b.amount > 0 ? i : -1)).filter((i) => i >= 0)
    if (activeIdx.length === 0) {
      return buckets.slice(10, 22).map((b) => ({ ...b, amount: 0 }))
    }
    const start = Math.max(0, Math.min(...activeIdx) - 1)
    const end = Math.min(23, Math.max(...activeIdx) + 1)
    const span = buckets.slice(start, end + 1)
    // Keep the chart readable: pad to at least 6 hour slots when sparse
    if (span.length >= 6) return span
    const padStart = Math.max(0, end - 5)
    return buckets.slice(padStart, Math.min(24, padStart + 6))
  }, [sales])
  const chartMax = Math.max(...hourly.map((h) => h.amount), 1)
  const chartH = 132
  const avatarTone = ['teal', 'amber', 'blue', 'green', 'rose', 'violet'] as const

  const tenderChart = useMemo(() => {
    const rows = Object.entries(tenders)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
    const total = rows.reduce((s, r) => s + r.amount, 0) || 1
    return rows.map((r, i) => ({
      ...r,
      pct: (r.amount / total) * 100,
      tone: (['teal', 'amber', 'blue', 'green', 'rose', 'violet'] as const)[i % 6],
    }))
  }, [tenders])

  const channelChart = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of sales) {
      const key = e.source?.trim() || t.boOther
      map.set(key, (map.get(key) ?? 0) + e.total)
    }
    const rows = [...map.entries()]
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
    const max = Math.max(...rows.map((r) => r.amount), 1)
    return rows.map((r, i) => ({
      ...r,
      pct: (r.amount / max) * 100,
      tone: (['teal', 'ocean', 'amber', 'violet', 'rose', 'lime'] as const)[i % 6],
    }))
  }, [sales, t.boOther])

  const staffSalesChart = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of sales) {
      const key = e.staff?.trim() || t.boUnassigned
      map.set(key, (map.get(key) ?? 0) + e.total)
    }
    const rows = [...map.entries()]
      .map(([label, amount]) => ({
        label: resolveStaffDisplayName(label, managedUsers, lang, personDisplayName),
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
    const max = Math.max(...rows.map((r) => r.amount), 1)
    return rows.map((r) => ({ ...r, pct: (r.amount / max) * 100 }))
  }, [sales, t.boUnassigned, lang, managedUsers])

  const staffOnShift = useMemo(
    () =>
      buildStaffOnShift({
        users: managedUsers,
        sales,
        activeShift,
        locale: localeTag(lang),
        nowLabel: t.boShiftNow,
      }),
    [managedUsers, sales, activeShift, lang, t.boShiftNow],
  )

  const weekChart = useMemo(() => {
    const locale = localeTag(lang)
    const days: { key: string; label: string; amount: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setHours(12, 0, 0, 0)
      d.setDate(d.getDate() - i)
      const key = todayKey(d)
      const label = d.toLocaleDateString(locale, { weekday: 'short' })
      const amount = ledgerForDay(ledger, key)
        .filter((e) => e.type === 'sale' && e.source !== 'Day Close')
        .reduce((s, e) => s + e.total, 0)
      days.push({ key, label, amount })
    }
    const max = Math.max(...days.map((d) => d.amount), 1)
    return { days, max }
  }, [ledger, lang])

  const filteredSales = useMemo(() => {
    const rows = [...sales].sort((a, b) => b.at.localeCompare(a.at))
    if (!q) return rows
    return rows.filter(
      (e) =>
        e.source.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        (e.staff ?? '').toLowerCase().includes(q) ||
        methodLabel(e, fmtMoney).toLowerCase().includes(q),
    )
  }, [sales, q])

  function toggleRoleNav(key: NavKey) {
    if (!selectedRole || selectedRole.key === 'admin' || key === 'home' || !roleDraft) return
    setRoleDraft((prev) => (prev ? privilegesWithNavToggle(prev, key) : prev))
  }

  function toggleRoleFlag(key: keyof Omit<CustomPrivileges, 'nav'>) {
    if (!selectedRole || selectedRole.key === 'admin' || !roleDraft) return
    setRoleDraft((prev) => (prev ? privilegesWithFlagToggle(prev, key) : prev))
  }

  async function saveSelectedRole() {
    if (!selectedRole || !roleDraft || selectedRole.key === 'admin') return
    setRoleBusy(true)
    try {
      const privileges = normalizePrivileges(roleDraft)
      const local = upsertManagedRole(
        {
          id: selectedRole.id,
          name: selectedRole.name,
          nameAr: selectedRole.nameAr,
          key: selectedRole.key,
          privileges,
        },
        cid,
      )
      if (apiAccessReady()) {
        await apiSaveRole({
          id: local.id,
          name: local.name,
          nameAr: local.nameAr,
          key: local.key,
          privileges,
        })
      }
      flash(t.boCustomSaved)
    } catch (err) {
      flash(err instanceof Error ? err.message : t.boRoleSaveFailed)
    } finally {
      setRoleBusy(false)
    }
  }

  function resetSelectedRole() {
    if (!selectedRole) return
    if (selectedRole.system && selectedRole.key in rolePermissions) {
      setRoleDraft(flagsFromPermissions(rolePermissions[selectedRole.key as SystemRoleKey]))
      return
    }
    setRoleDraft(emptyRolePrivileges())
  }

  function confirmDayClose() {
    const counted = Number(countedCash)
    if (Number.isNaN(counted)) {
      flash(t.boEnterCountedCash)
      return
    }
    const res = closeDay(counted, user?.name)
    flash(res.message)
    if (res.ok) setCountedCash('')
  }

  function confirmOpenShift() {
    if (!user) return
    if (activeShift) {
      flash(t.boShiftAlreadyOpen)
      return
    }
    const f = Number(floatAmt) || 0
    openShift(user.id, user.name, f)
    flash(t.boShiftOpened.replace('{amount}', fmtMoney(f)))
  }

  function confirmCloseShift() {
    const counted = Number(shiftCounted)
    if (Number.isNaN(counted)) {
      flash(t.boEnterCountedCash)
      return
    }
    const res = closeShift(counted)
    flash(res.message)
    if (res.ok) setShiftCounted('')
  }

  return (
    <div className="zk-bo">
      <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />

      <div className="bo-page">
        <header className="bo-hero">
          <div className="bo-hero-copy">
            <span className="bo-hero-mark">
              <IconOffice />
            </span>
            <div>
              <h1>{t.backOfficeHub}</h1>
              <p>
                {t.boHeroLead} · {day}
                {dayIsClosed ? ` · ${t.boHeroDayClosed}` : ` · ${t.boHeroDayOpen}`}
              </p>
            </div>
          </div>
          <div className={`bo-day-pill ${dayIsClosed ? 'closed' : 'open'}`}>
            <IconDay />
            <strong>{dayIsClosed ? t.dayClosed : t.dayOpen}</strong>
          </div>
        </header>

        <div className="bo-metrics">
          <article className="bo-metric tone-teal">
            <span className="bo-metric-ico">
              <IconSales />
            </span>
            <div>
              <span>{t.boTodaySales}</span>
              <strong>{fmtMoney(salesTotal)}</strong>
            </div>
          </article>
          <article className="bo-metric tone-amber">
            <span className="bo-metric-ico">
              <IconCash />
            </span>
            <div>
              <span>{t.boCashExpected}</span>
              <strong>{fmtMoney(expectedCash)}</strong>
            </div>
          </article>
          <article className="bo-metric tone-blue">
            <span className="bo-metric-ico">
              <IconTables />
            </span>
            <div>
              <span>{t.boOpenTablesTickets}</span>
              <strong>
                {openTables.length} / {openTickets}
              </strong>
            </div>
          </article>
          <article className={`bo-metric ${dayIsClosed ? 'tone-rose' : 'tone-green'}`}>
            <span className="bo-metric-ico">
              <IconDay />
            </span>
            <div>
              <span>{t.boDayStatus}</span>
              <strong>{dayIsClosed ? t.boClosed : t.boOpen}</strong>
            </div>
          </article>
        </div>

        <div className="bo-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        <div className="bo-body">
          {tab === 'overview' ? (
            <div className="bo-overview">
              <div className="bo-charts">
                <section className="bo-panel">
                  <div className="bo-panel-head">
                    <h2>
                      <IconSales /> {t.boHourlySales}
                    </h2>
                    <span className="bo-chip">{fmtMoney(salesTotal)}</span>
                  </div>
                  <div className="bo-chart" style={{ ['--bo-chart-h' as string]: `${chartH}px` }}>
                    <div className="bo-chart-grid" aria-hidden>
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="bo-chart-bars">
                      {hourly.map((row) => {
                        const pct = row.amount / chartMax
                        const barPx = row.amount > 0 ? Math.max(Math.round(pct * chartH), 12) : 4
                        return (
                          <div
                            key={row.label}
                            className={`bo-bar${row.amount > 0 ? ' has-val' : ''}`}
                            title={`${row.label}:00 · ${fmtMoney(row.amount)}`}
                          >
                            <em className="bo-bar-val mesa-ltr-nums">
                              {row.amount > 0 ? fmtMoney(row.amount) : ''}
                            </em>
                            <i style={{ height: `${barPx}px` }} />
                            <span className="mesa-ltr-nums">{row.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {salesTotal <= 0 ? (
                    <p className="bo-chart-empty">{t.boNoSalesChart}</p>
                  ) : null}
                </section>

                <section className="bo-panel">
                  <div className="bo-panel-head">
                    <h2>
                      <IconSales /> {t.boLast7Days}
                    </h2>
                    <span className="bo-chip mesa-ltr-nums">
                      {fmtMoney(weekChart.days.reduce((s, d) => s + d.amount, 0))}
                    </span>
                  </div>
                  <div className="bo-chart bo-chart-week" style={{ ['--bo-chart-h' as string]: `110px` }}>
                    <div className="bo-chart-grid" aria-hidden>
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="bo-chart-bars">
                      {weekChart.days.map((row) => {
                        const barPx =
                          row.amount > 0
                            ? Math.max(Math.round((row.amount / weekChart.max) * 110), 10)
                            : 4
                        return (
                          <div
                            key={row.key}
                            className={`bo-bar${row.amount > 0 ? ' has-val' : ''}${row.key === day ? ' is-today' : ''}`}
                            title={`${row.key} · ${fmtMoney(row.amount)}`}
                          >
                            <em className="bo-bar-val mesa-ltr-nums">
                              {row.amount > 0 ? fmtMoney(row.amount) : ''}
                            </em>
                            <i style={{ height: `${barPx}px` }} />
                            <span>{row.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </section>

                <section className="bo-panel">
                  <div className="bo-panel-head">
                    <h2>
                      <IconTender /> {t.boTenderMix}
                    </h2>
                  </div>
                  {tenderChart.length === 0 ? (
                    <div className="bo-empty-inline">
                      <strong>{t.boNoTenders}</strong>
                      <span>{t.boNoTendersHint}</span>
                    </div>
                  ) : (
                    <div className="bo-mix">
                      <div className="bo-mix-track" aria-hidden>
                        {tenderChart.map((row) => (
                          <i
                            key={row.label}
                            className={`tone-${row.tone}`}
                            style={{ width: `${Math.max(row.pct, 2)}%` }}
                            title={`${row.label} · ${fmtMoney(row.amount)}`}
                          />
                        ))}
                      </div>
                      <div className="bo-mix-legend">
                        {tenderChart.map((row) => (
                          <div key={row.label} className={`bo-mix-row tone-${row.tone}`}>
                            <span className="bo-mix-dot" aria-hidden />
                            <strong>{row.label}</strong>
                            <em className="mesa-ltr-nums">{row.pct.toFixed(0)}%</em>
                            <b className="mesa-ltr-nums">{fmtMoney(row.amount)}</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="bo-panel">
                  <div className="bo-panel-head">
                    <h2>
                      <IconTables /> {t.boByChannel}
                    </h2>
                  </div>
                  {channelChart.length === 0 ? (
                    <div className="bo-empty-inline">
                      <strong>{t.boNoChannelSales}</strong>
                      <span>{t.boNoChannelHint}</span>
                    </div>
                  ) : (
                    <div className="bo-hbars">
                      {channelChart.map((row) => (
                        <div key={row.label} className="bo-hbar">
                          <div className="bo-hbar-meta">
                            <strong>{row.label}</strong>
                            <em className="mesa-ltr-nums">{fmtMoney(row.amount)}</em>
                          </div>
                          <div className="bo-hbar-track">
                            <i className={`tone-${row.tone}`} style={{ width: `${Math.max(row.pct, 4)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="bo-panel">
                  <div className="bo-panel-head">
                    <h2>
                      <IconStaff /> {t.boStaffSales}
                    </h2>
                  </div>
                  <div className="bo-hbars">
                    {staffSalesChart.map((row) => (
                      <div key={row.label} className="bo-hbar">
                        <div className="bo-hbar-meta">
                          <strong>{row.label}</strong>
                          <em className="mesa-ltr-nums">{fmtMoney(row.amount)}</em>
                        </div>
                        <div className="bo-hbar-track">
                          <i className="tone-teal" style={{ width: `${Math.max(row.pct, 4)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="bo-panel bo-side-panel">
                <div className="bo-panel-head">
                  <h2>
                    <IconStaff /> {t.boStaffOnShift}
                  </h2>
                </div>
                <div className="bo-staff">
                  {staffOnShift.length === 0 ? (
                    <div className="bo-empty-inline">
                      <strong>{t.boStaffOnShiftEmpty}</strong>
                      <span>{t.boStaffOnShiftEmptyHint}</span>
                    </div>
                  ) : (
                    staffOnShift.map((person, i) => {
                      const displayName = personDisplayName(person, lang)
                      return (
                        <div key={person.id} className="bo-staff-row">
                          <span
                            className={`bo-avatar tone-${avatarTone[i % avatarTone.length]}`}
                            aria-hidden
                          >
                            {(displayName.trim()[0] || '?').toUpperCase()}
                          </span>
                          <div>
                            <strong>{displayName}</strong>
                            <span>
                              {roleDisplayName(person.role)}
                              {person.shift !== '—' ? (
                                <>
                                  {' · '}
                                  <span className="mesa-ltr-nums">{person.shift}</span>
                                </>
                              ) : null}
                            </span>
                          </div>
                          <em className="mesa-ltr-nums">{fmtMoney(person.sales)}</em>
                        </div>
                      )
                    })
                  )}
                </div>
                {activeShift ? (
                  <div className="bo-shift-banner open">
                    <IconShift />
                    <div>
                      <strong>{t.boActiveShift}</strong>
                      <span>
                        {t.boActiveShiftDetail
                          .replace('{name}', activeShift.userName)
                          .replace('{float}', fmtMoney(activeShift.floatAmount))
                          .replace('{cashIn}', fmtMoney(activeShift.cashIn))}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bo-shift-banner">
                    <IconShift />
                    <div>
                      <strong>{t.boNoShiftOpen}</strong>
                      <span>{t.boNoShiftOpenHint}</span>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          ) : null}

          {tab === 'sales' ? (
            <section className="bo-panel">
              <div className="bo-panel-head">
                <h2>
                  <IconLedger /> {t.boSalesPaymentLog}
                </h2>
                <span className="bo-chip">
                  {filteredSales.length} · {fmtMoney(salesTotal)}
                </span>
              </div>
              <div className="table-wrap">
                <table className="data-table bo-table">
                  <thead>
                    <tr>
                      <th>{t.boColTime}</th>
                      <th>{t.boColSource}</th>
                      <th>{t.boColMethod}</th>
                      <th>{t.boColSubtotal}</th>
                      <th>{t.boColTax}</th>
                      <th>{t.boColTotal}</th>
                      <th>{t.boColStaff}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((e) => (
                      <tr key={e.id}>
                        <td>{new Date(e.at).toLocaleTimeString()}</td>
                        <td>{e.source}</td>
                        <td>
                          <span className="bo-method-pill">{methodLabel(e, fmtMoney)}</span>
                        </td>
                        <td>{fmtMoney(e.subtotal)}</td>
                        <td>{fmtMoney(e.tax)}</td>
                        <td>
                          <strong>{fmtMoney(e.total)}</strong>
                        </td>
                        <td>{e.staff ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredSales.length === 0 ? (
                <div className="ticket-empty">
                  <strong>{t.boNoPayments}</strong>
                  {t.boNoPaymentsHint}
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'day' ? (
            <section className="bo-panel">
              <div className="bo-panel-head">
                <h2>
                  <IconDay /> {t.boEndOfDay}
                </h2>
                <span className="bo-chip">{day}</span>
              </div>
              {(openTables.length > 0 || openTickets > 0) && (
                <div className="toast-banner">
                  {t.boDayCloseWarning
                    .replace('{tables}', String(openTables.length))
                    .replace('{tickets}', String(openTickets))}
                </div>
              )}
              <div className="bo-tenders">
                <div className="bo-tender tone-teal">
                  <span className="bo-tender-ico">
                    <IconSales />
                  </span>
                  <strong>{t.boSalesTotal}</strong>
                  <em>{fmtMoney(salesTotal)}</em>
                </div>
                <div className="bo-tender tone-amber">
                  <span className="bo-tender-ico">
                    <IconCash />
                  </span>
                  <strong>{t.boExpectedCash}</strong>
                  <em>{fmtMoney(expectedCash)}</em>
                </div>
                <div className="bo-tender tone-rose">
                  <span className="bo-tender-ico">
                    <IconVoid />
                  </span>
                  <strong>{t.boVoidsDiscounts}</strong>
                  <em>
                    {voids.length} · {discounts.length}
                  </em>
                </div>
                {Object.entries(tenders).map(([method, amt], i) => (
                  <div key={method} className={`bo-tender tone-${['blue', 'green', 'teal', 'amber'][i % 4]}`}>
                    <span className="bo-tender-ico">
                      <IconTender />
                    </span>
                    <strong>{method}</strong>
                    <em>{fmtMoney(amt)}</em>
                  </div>
                ))}
              </div>
              {!dayIsClosed ? (
                <div className="bo-form">
                  <label className="field-label">{t.boCountedCashDrawer}</label>
                  <input
                    className="search"
                    inputMode="decimal"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder={String(expectedCash)}
                  />
                  <p className="modal-lead">
                    {t.boVariancePreview} {fmtMoney((Number(countedCash) || 0) - expectedCash)}
                  </p>
                  <button type="button" className="btn btn-teal" onClick={confirmDayClose}>
                    {t.boConfirmDayClose}
                  </button>
                </div>
              ) : (
                <div className="bo-form">
                  <p className="modal-lead">{t.boDayClosedLock}</p>
                  <button type="button" className="btn btn-primary" onClick={() => reopenDay()}>
                    {t.boReopenDay}
                  </button>
                </div>
              )}
            </section>
          ) : null}

          {tab === 'shift' ? (
            <section className="bo-panel">
              <div className="bo-panel-head">
                <h2>
                  <IconShift /> {t.boShiftCashClose}
                </h2>
                <span className="bo-chip">{user?.name}</span>
              </div>
              {activeShift ? (
                <div className="bo-form">
                  <div className="bo-tenders">
                    <div className="bo-tender tone-blue">
                      <strong>{t.boOpened}</strong>
                      <em>{new Date(activeShift.openedAt).toLocaleString(localeTag(lang))}</em>
                    </div>
                    <div className="bo-tender tone-amber">
                      <strong>{t.boFloat}</strong>
                      <em>{fmtMoney(activeShift.floatAmount)}</em>
                    </div>
                    <div className="bo-tender tone-teal">
                      <strong>{t.boCashIn}</strong>
                      <em>{fmtMoney(activeShift.cashIn)}</em>
                    </div>
                    <div className="bo-tender tone-green">
                      <strong>{t.boExpectedDrawer}</strong>
                      <em>{fmtMoney(activeShift.floatAmount + activeShift.cashIn)}</em>
                    </div>
                  </div>
                  <label className="field-label">{t.boCountedCash}</label>
                  <input
                    className="search"
                    inputMode="decimal"
                    value={shiftCounted}
                    onChange={(e) => setShiftCounted(e.target.value)}
                  />
                  <button type="button" className="btn btn-teal" onClick={confirmCloseShift}>
                    {t.boCloseShift}
                  </button>
                </div>
              ) : (
                <div className="bo-form">
                  <label className="field-label">{t.boOpeningFloat}</label>
                  <input
                    className="search"
                    inputMode="decimal"
                    value={floatAmt}
                    onChange={(e) => setFloatAmt(e.target.value)}
                  />
                  <button type="button" className="btn btn-primary" onClick={confirmOpenShift}>
                    {t.boOpenShift}
                  </button>
                </div>
              )}
              <div className="bo-panel-head" style={{ marginTop: '1.2rem' }}>
                <h2>{t.boRecentShifts}</h2>
              </div>
              <div className="simple-list">
                {history.slice(0, 8).map((s) => (
                  <div key={s.id} className="simple-item">
                    <strong>
                      {s.userName} {s.open ? t.boShiftOpenTag : ''}
                    </strong>
                    <span>
                      {t.boShiftHistory
                        .replace('{float}', fmtMoney(s.floatAmount))
                        .replace('{cashIn}', fmtMoney(s.cashIn))}
                      {typeof s.variance === 'number'
                        ? t.boShiftHistoryVar.replace('{variance}', fmtMoney(s.variance))
                        : ''}
                    </span>
                  </div>
                ))}
                {history.length === 0 ? (
                  <div className="simple-item">
                    <strong>{t.boNoShifts}</strong>
                    <span>{t.boNoShiftsHint}</span>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {tab === 'voids' ? (
            <section className="bo-panel">
              <div className="bo-panel-head">
                <h2>
                  <IconVoid /> {t.boTabVoidReport}
                </h2>
                <span className="bo-chip rose">{t.boTodayCount.replace('{n}', String(voids.length))}</span>
              </div>
              <div className="table-wrap">
                <table className="data-table bo-table">
                  <thead>
                    <tr>
                      <th>{t.boColTime}</th>
                      <th>{t.boColSource}</th>
                      <th>{t.boColItem}</th>
                      <th>{t.boColReason}</th>
                      <th>{t.boColAmount}</th>
                      <th>{t.boColStaff}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voids.map((v) => (
                      <tr key={v.id}>
                        <td>{new Date(v.at).toLocaleTimeString()}</td>
                        <td>{v.source}</td>
                        <td>{v.voidLineName ?? '—'}</td>
                        <td>{v.voidReason ?? v.method}</td>
                        <td>{fmtMoney(v.total)}</td>
                        <td>{v.staff ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {voids.length === 0 ? (
                <div className="ticket-empty">
                  <strong>{t.boNoVoids}</strong>
                  {t.boNoVoidsHint}
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'discounts' ? (
            <section className="bo-panel">
              <div className="bo-panel-head">
                <h2>
                  <IconDiscount /> {t.boTabDiscountReport}
                </h2>
                <span className="bo-chip amber">
                  {t.boTodayCount.replace('{n}', String(discounts.length))}
                </span>
              </div>
              <div className="table-wrap">
                <table className="data-table bo-table">
                  <thead>
                    <tr>
                      <th>{t.boColTime}</th>
                      <th>{t.boColSource}</th>
                      <th>{t.boColAmount}</th>
                      <th>{t.boColStaff}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discounts.map((d) => (
                      <tr key={d.id}>
                        <td>{new Date(d.at).toLocaleTimeString()}</td>
                        <td>{d.source}</td>
                        <td>{fmtMoney(d.total)}</td>
                        <td>{d.staff ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {discounts.length === 0 ? (
                <div className="ticket-empty">
                  <strong>{t.boNoDiscounts}</strong>
                  {t.boNoDiscountsHint}
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'roles' ? (
            <div className="bo-roles-layout">
              <aside
                className={`bo-panel bo-roles-sidebar${rolesMobilePane === 'edit' ? ' bo-roles-mobile-hide' : ''}`}
              >
                <div className="bo-panel-head">
                  <h2>
                    <IconRoles /> {t.boZkDesignations}
                  </h2>
                  <span className="bo-chip">
                    {managedRoles.length} {t.rolesWord}
                  </span>
                </div>
                {rolesLoading && managedRoles.length === 0 ? (
                  <p className="modal-lead">{t.boLoadingRoles}</p>
                ) : (
                  <div className="bo-roles-list">
                    {managedRoles.map((role) => {
                      const active = selectedRole?.id === role.id
                      const displayName = localizedRoleName(role, lang)
                      const screens = normalizePrivileges(role.privileges).nav.length
                      return (
                        <button
                          key={role.id}
                          type="button"
                          className={`bo-role-card${active ? ' active' : ''}`}
                          onClick={() => pickRole(role.id)}
                        >
                          <span className="bo-role-avatar" aria-hidden>
                            {roleInitials(displayName)}
                          </span>
                          <span className="bo-role-card-body">
                            <strong>{displayName}</strong>
                            <span className="bo-role-meta">
                              <span className={`bo-role-badge ${role.system ? 'system' : 'custom'}`}>
                                {role.system ? t.boSystemRole : t.boCustomRoleLabel}
                              </span>
                              <span>
                                {screens} {t.screens}
                              </span>
                            </span>
                          </span>
                          <span className="bo-role-chevron" aria-hidden>
                            ›
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </aside>

              <section
                className={`bo-panel bo-roles-editor${rolesMobilePane === 'list' ? ' bo-roles-mobile-hide' : ''}`}
              >
                <div className="bo-panel-head bo-roles-editor-head">
                  <div className="bo-roles-editor-title">
                    <button
                      type="button"
                      className="bo-roles-back"
                      onClick={() => setRolesMobilePane('list')}
                      aria-label={t.boBackToRoles}
                    >
                      ←
                    </button>
                    <h2>
                      <IconRoles />{' '}
                      {selectedRole
                        ? t.boRolePrivilegeTitle.replace('{name}', localizedRoleName(selectedRole, lang))
                        : t.boRolePrivilegeTitle.replace('{name}', '—')}
                    </h2>
                  </div>
                  <span className="bo-chip bo-roles-user-chip">
                    {user?.name ?? '—'} · {user ? roleDisplayName(user.role) : '—'}
                  </span>
                </div>

                {!selectedRole || !roleDraft ? (
                  <div className="bo-roles-editor-body">
                    <p className="modal-lead">{t.boSelectRoleHint}</p>
                  </div>
                ) : !isAdmin ? (
                  <div className="bo-roles-editor-body">
                    <p className="modal-lead">{t.boOnlyAdminPrivileges}</p>
                  </div>
                ) : (
                  <>
                    <div className="bo-roles-editor-body">
                      <div className="bo-role-hero">
                        <div className="bo-role-hero-main">
                          <span className="bo-role-avatar" aria-hidden>
                            {roleInitials(localizedRoleName(selectedRole, lang))}
                          </span>
                          <div>
                            <h3>{localizedRoleName(selectedRole, lang)}</h3>
                            <p>
                              {selectedRole.system ? t.boSystemRole : t.boCustomRoleLabel}
                            </p>
                          </div>
                        </div>
                        <div className="bo-role-stats">
                          <div className="bo-role-stat">
                            <strong>{roleDraft.nav.length}</strong>
                            <span>{t.screens}</span>
                          </div>
                          <div className="bo-role-stat">
                            <strong>{countRoleActions(roleDraft)}</strong>
                            <span>{t.boActions}</span>
                          </div>
                        </div>
                      </div>

                      {selectedRole.key === 'admin' ? (
                        <div className="bo-role-locked">
                          <span className="bo-role-locked-icon" aria-hidden>
                            🔒
                          </span>
                          <p>{t.adminRoleHint}</p>
                        </div>
                      ) : (
                        <p className="modal-lead">{t.boTickRolePrivileges}</p>
                      )}

                      <div className="bo-role-section">
                        <div className="bo-role-section-head">
                          <h4>{t.boModules}</h4>
                          <span>
                            {roleDraft.nav.length} {t.screens}
                          </span>
                        </div>
                        <div className="bo-role-modules">
                          {allNavKeys
                            .filter((k) => k !== 'home')
                            .map((key) => {
                              const on = roleDraft.nav.includes(key)
                              const locked = selectedRole.key === 'admin'
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className={`bo-role-module${on ? ' on' : ''}`}
                                  disabled={locked}
                                  onClick={() => toggleRoleNav(key)}
                                >
                                  {navLabel(key)}
                                </button>
                              )
                            })}
                        </div>
                      </div>

                      <div className="bo-role-section">
                        <div className="bo-role-section-head">
                          <h4>{t.boActions}</h4>
                          <span>
                            {countRoleActions(roleDraft)} / {flagLabels.length}
                          </span>
                        </div>
                        <div className="bo-role-actions">
                          {flagLabels.map(({ key, label }) => {
                            const on = !!roleDraft[key]
                            const locked = selectedRole.key === 'admin'
                            return (
                              <label
                                key={key}
                                className={`bo-role-action${on ? ' on' : ''}${locked ? ' readonly' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  disabled={locked}
                                  onChange={() => toggleRoleFlag(key)}
                                />
                                {label}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {selectedRole.key !== 'admin' ? (
                      <div className="bo-role-footer">
                        <button type="button" className="btn btn-ghost" onClick={resetSelectedRole}>
                          {t.boResetDefaults}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => void saveSelectedRole()}
                          disabled={roleBusy}
                        >
                          {t.boSaveRole}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>

      <HubFooter backTo={settingsHubPath('accounts')} backLabel={t.accounts} />
    </div>
  )
}
