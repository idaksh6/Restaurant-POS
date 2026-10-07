import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getPermissions, navMeta } from '../auth/roles'
import { navI18n, useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import BrandMark from './BrandMark'
import LangSwitch from './LangSwitch'
import MesaSelect from './MesaSelect'
import PwaInstallButton from './PwaInstallButton'
import { navIcons } from './navIcons'
import { branchDisplayName, companyDisplayName } from '../lib/branding'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'

export default function AppShell() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { kitchen } = usePos()
  const { t, lang } = useI18n()
  const { connectivity, queued, outbox, runSync } = useSync()
  const { company, allowedBranches, activeBranch, switchBranch } = useBranch()
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

  if (!user) {
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <p style={{ color: '#5f7169', fontWeight: 700 }}>Loading…</p>
      </div>
    )
  }

  const perms = getPermissions(user.role)
  const dineServerMode =
    pathname === '/dine-in' &&
    (user.role === 'food-server' || new URLSearchParams(search).get('mode') === 'server')
  const titleMap: Record<string, { title: string; subtitle: string }> = {
    '/': { title: t.mainMenu, subtitle: perms.homeSubtitle },
    '/dine-in': {
      title: dineServerMode ? t.tileFoodServer : t.dineIn,
      subtitle: dineServerMode ? t.foodServerModeHint : t.vat,
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
    '/accounts': { title: t.accountsHubTitle, subtitle: t.accountsHubHint },
    '/expenses': { title: t.expensesHubTitle, subtitle: t.expensesHubHint },
    '/expenses/hub': { title: t.expensesHubTitle, subtitle: t.expensesHubHint },
    '/reports': { title: t.rptTitle, subtitle: t.rptHint },
    '/barcode': { title: t.tileBarcode, subtitle: t.bcHint },
  }
  const meta = titleMap[pathname] ?? titleMap['/']
  const homeMode = pathname === '/'
  const accountsHub =
    pathname === '/accounts' ||
    pathname.startsWith('/accounts/')
  const expensesHub =
    pathname === '/expenses' ||
    pathname.startsWith('/expenses/')
  const settingsHub =
    pathname.startsWith('/settings/') && pathname !== '/settings/customers'
  const immersive =
    homeMode ||
    pathname === '/payments' ||
    pathname === '/back-office' ||
    pathname === '/reports' ||
    pathname === '/barcode' ||
    accountsHub ||
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
    pathname.startsWith('/rider') ||
    pathname.startsWith('/courier')

  return (
    <div
      className={`app-shell role-${user.role}${homeMode ? ' home-mode' : ''}${settingsHub ? ' settings-mode' : ''}${counterMode ? ' counter-mode' : ''}`}
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
            const Icon = navIcons[key]
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
                options={allowedBranches.map((b) => ({
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
