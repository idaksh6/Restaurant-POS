import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getPermissions, navMeta, type NavKey } from '../auth/roles'
import { navI18n, useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import BrandMark from './BrandMark'
import LangSwitch from './LangSwitch'
import MesaSelect from './MesaSelect'
import PwaInstallButton from './PwaInstallButton'
import { branchDisplayName, companyDisplayName } from '../lib/branding'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  )
}

function IconTables() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="7" width="18" height="4" rx="1.5" />
      <path d="M6 11v7M18 11v7M10 11v4M14 11v4" />
    </svg>
  )
}

function IconBag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 7h10v4H7V7Z" />
      <path d="M9 11v8M15 11v8M5 19h14" />
    </svg>
  )
}

function IconTruck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7h11v10H3V7Z" />
      <path d="M14 10h4l3 3v4h-7v-7Z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </svg>
  )
}

function IconKitchen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10h16v9H4v-9Z" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function IconBoxes() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M3 8.5 12 14l9-5.5M12 14v7" />
    </svg>
  )
}

function IconOffice() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V6a2 2 0 0 1 2-2h7v16H4Z" />
      <path d="M13 10h5a2 2 0 0 1 2 2v8h-7V10Z" />
      <path d="M7 8h2M7 12h2M7 16h2M16 14h2M16 17h2" />
    </svg>
  )
}

function IconPay() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 14h4" />
    </svg>
  )
}

function IconOnline() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M3 12h18M12 4c2.5 2.8 2.5 12.2 0 16M12 4c-2.5 2.8-2.5 12.2 0 16" />
    </svg>
  )
}

function IconCrm() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 19c0-2 2-3.5 4.5-3.5S23 17 23 19" />
    </svg>
  )
}

function IconMasters() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M4 12h16M4 17h10" />
      <circle cx="18" cy="17" r="2" />
    </svg>
  )
}

function IconSuppliers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
    </svg>
  )
}

function IconPO() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M15 3v4h4M9 12h6M9 16h6" />
    </svg>
  )
}

function IconExpenses() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h7l3 3v15H7V3Z" />
      <path d="M14 3v3h3" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  )
}

const icons: Record<NavKey, () => ReactNode> = {
  home: IconHome,
  'dine-in': IconTables,
  payments: IconPay,
  takeaway: IconBag,
  delivery: IconTruck,
  online: IconOnline,
  kitchen: IconKitchen,
  inventory: IconBoxes,
  suppliers: IconSuppliers,
  'purchase-orders': IconPO,
  crm: IconCrm,
  masters: IconMasters,
  settings: IconMasters,
  'back-office': IconOffice,
  expenses: IconExpenses,
}

export default function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { kitchen } = usePos()
  const { t, lang } = useI18n()
  const { connectivity, queued, outbox, runSync } = useSync()
  const { company, branches, activeBranch, switchBranch } = useBranch()
  const kitchenQueue = kitchen.filter((k) => k.status !== 'ready').length
  const brandName = companyDisplayName(company, lang)
  const poison = outbox.filter((op) => op.status === 'poison').length
  const pendingOps = outbox.filter((op) => op.status === 'pending' || op.status === 'syncing')
  const lastErr = outbox.find((op) => op.lastError)?.lastError
  const queueHint = pendingOps.length
    ? Object.entries(
        pendingOps.reduce<Record<string, number>>((acc, op) => {
          acc[op.type] = (acc[op.type] ?? 0) + 1
          return acc
        }, {}),
      )
        .map(([type, n]) => `${type} × ${n}`)
        .join(', ')
    : ''

  const syncLabel =
    connectivity === 'offline'
      ? t.offline
      : connectivity === 'syncing'
        ? `${t.syncing}${queued ? ` (${queued})` : ''}`
        : poison
          ? `${t.online} · ${t.syncPoison}`
          : queued
            ? `${t.online} · ${queued} ${t.queuedCount}`
            : t.online

  const syncTitle =
    [queueHint ? `Pending: ${queueHint}` : '', lastErr].filter(Boolean).join(' — ') || syncLabel

  if (!user) return null

  const perms = getPermissions(user.role)
  const titleMap: Record<string, { title: string; subtitle: string }> = {
    '/': { title: t.mainMenu, subtitle: perms.homeSubtitle },
    '/dine-in': {
      title: user.role === 'food-server' ? t.tileFoodServer : t.dineIn,
      subtitle: t.vat,
    },
    '/payments': {
      title: t.payments,
      subtitle: t.vat,
    },
    '/takeaway': { title: t.navTakeaway, subtitle: t.vat },
    '/delivery': { title: t.navDelivery, subtitle: t.vat },
    '/online': { title: t.navOnline, subtitle: t.vat },
    '/kitchen': { title: t.kitchen, subtitle: t.sendOrders },
    '/inventory': { title: t.inventory, subtitle: t.vat },
    '/suppliers': { title: t.vendors, subtitle: t.inventory },
    '/purchase-orders': { title: t.navPurchaseOrders, subtitle: t.inventory },
    '/crm': { title: t.crm, subtitle: t.customerSearch },
    '/masters': { title: t.navMasters, subtitle: t.menuItems },
    '/settings': { title: t.settings, subtitle: t.companyDetails },
    '/back-office': { title: t.backOfficeHub, subtitle: t.vat },
    '/expenses': { title: t.expenseDetails, subtitle: t.expenseDetailsHint },
  }
  const meta = titleMap[pathname] ?? titleMap['/']
  const expensesHub = pathname === '/expenses' || pathname.startsWith('/expenses/')
  const settingsHub =
    pathname.startsWith('/settings/') && pathname !== '/settings/customers'
  const immersive =
    pathname === '/' ||
    pathname === '/payments' ||
    pathname === '/back-office' ||
    expensesHub ||
    pathname === '/takeaway' ||
    pathname === '/kitchen' ||
    pathname === '/inventory' ||
    pathname === '/purchase-orders' ||
    pathname === '/suppliers' ||
    pathname === '/crm' ||
    pathname === '/settings' ||
    pathname === '/settings/customers' ||
    pathname === '/masters' ||
    pathname === '/dine-in' ||
    settingsHub ||
    pathname.startsWith('/quick-serve') ||
    pathname.startsWith('/drive-thru') ||
    pathname.startsWith('/delivery') ||
    pathname === '/online' ||
    pathname.startsWith('/rider') ||
    pathname.startsWith('/courier')
  const counterMode =
    pathname.startsWith('/drive-thru') ||
    pathname.startsWith('/rider') ||
    pathname.startsWith('/courier')

  return (
    <div
      className={`app-shell role-${user.role}${pathname === '/' ? ' home-mode' : ''}${settingsHub ? ' settings-mode' : ''}${counterMode ? ' counter-mode' : ''}`}
    >
      {!settingsHub && !counterMode ? (
      <aside className="side-nav">
        <div className="brand">
          <BrandMark name={brandName} logoUrl={company.logoDataUrl} />
          <span>{brandName}</span>
        </div>

        <nav className="nav-links">
          {perms.nav.map((key) => {
            const item = navMeta[key]
            const Icon = icons[key]
            return (
              <NavLink
                key={key}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                <Icon />
                <strong>{t[navI18n[key]]}</strong>
                {key === 'kitchen' && kitchenQueue > 0 ? (
                  <em className="nav-badge">{kitchenQueue}</em>
                ) : null}
              </NavLink>
            )
          })}
        </nav>

        <div className="side-meta">
          <strong>{user.name}</strong>
          {user.roleLabel !== user.name ? <span>{user.roleLabel}</span> : null}
        </div>
      </aside>
      ) : null}

      <main className="main-stage">
        {!immersive ? (
          <header className="topbar">
            <div>
              <h1>{meta.title}</h1>
              <p>{meta.subtitle}</p>
            </div>
            <div className="topbar-actions">
              <MesaSelect
                aria-label={t.branch}
                title={t.activeBranch}
                value={activeBranch.id}
                onChange={(id) => {
                  switchBranch(id)
                  window.location.reload()
                }}
                options={branches
                  .filter((b) => b.active)
                  .map((b) => ({
                    value: b.id,
                    label: `${b.code} · ${branchDisplayName(b, lang)}`,
                  }))}
              />
              <button
                type="button"
                className={`mesa-sync-chip ${poison ? 'poison' : connectivity}`}
                onClick={() => void runSync({ force: true })}
                title={syncTitle}
              >
                <span className="mesa-sync-dot" aria-hidden />
                {syncLabel}
              </button>
              <PwaInstallButton className="btn btn-ghost" />
              <LangSwitch variant="field" />
              <span className={`chip role-chip ${user.role}`}>{user.roleLabel}</span>
              <span className="chip">{t.service}</span>
              <span className="chip">{brandName}</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  logout()
                  navigate('/', { replace: true })
                }}
              >
                {t.lock}
              </button>
            </div>
          </header>
        ) : null}
        <Outlet />
      </main>
    </div>
  )
}
