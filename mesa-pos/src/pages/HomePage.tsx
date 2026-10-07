import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { money } from '../data/mock'
import { getPermissions, type NavKey } from '../auth/roles'
import { badgeCount, useHomeDashboardStats } from '../lib/homeDashboardStats'
import { dayKeyFromToday, daySales, recentOrders, trendVsPrevious } from '../lib/dashboardData'
import { ticketHref } from '../lib/ticketHref'
import { useAuth } from '../state/AuthContext'
import { useI18n, type I18nKey } from '../locale/i18n'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'
import DashHeader from '../components/DashHeader'
import KpiCard, { type Tone } from '../components/dashboard/KpiCard'
import ShortcutTile from '../components/dashboard/ShortcutTile'
import LiveStatusCard from '../components/dashboard/LiveStatusCard'
import TableStatusStrip from '../components/dashboard/TableStatusStrip'
import RecentOrdersCard from '../components/dashboard/RecentOrdersCard'
import SalesPanel from '../components/dashboard/SalesPanel'
import {
  IconAccounts,
  IconArrowDown,
  IconArrowUp,
  IconBag,
  IconBarcode,
  IconBike,
  IconBolt,
  IconCalendar,
  IconCar,
  IconCash,
  IconChef,
  IconChevron,
  IconGear,
  IconGlobe,
  IconKitchen,
  IconMoon,
  IconPlate,
  IconReceipt,
  IconServer,
  IconSun,
  IconTable,
  IconTicket,
  IconUnsettled,
  IconUser,
  IconWallet,
} from '../components/dashboard/dashIcons'

type TileDef = {
  id: string
  labelKey: I18nKey
  to?: string
  nav?: NavKey
  /** Always show for admin; otherwise require nav */
  adminAlways?: boolean
  icon: ReactNode
  tone: Tone
  badge?: number
}

const opsTiles: TileDef[] = [
  { id: 'dine', labelKey: 'tileDineIn', to: '/dine-in', nav: 'dine-in', icon: <IconPlate />, tone: 'green' },
  { id: 'quick', labelKey: 'tileQuickServe', to: '/quick-serve', nav: 'takeaway', icon: <IconBolt />, tone: 'orange' },
  { id: 'drive', labelKey: 'tileDriveThru', to: '/drive-thru', nav: 'drive-thru', icon: <IconCar />, tone: 'purple' },
  { id: 'delivery', labelKey: 'tileDelivery', to: '/delivery', nav: 'delivery', icon: <IconBike />, tone: 'blue' },
  { id: 'online', labelKey: 'tileOnline', to: '/online', nav: 'online', icon: <IconGlobe />, tone: 'teal' },
  { id: 'takeaway', labelKey: 'tileTakeAway', to: '/takeaway', nav: 'takeaway', icon: <IconBag />, tone: 'blue' },
  { id: 'customer', labelKey: 'tileCustomer', to: '/crm', nav: 'crm', icon: <IconUser />, tone: 'pink' },
  { id: 'bar', labelKey: 'tileBarcode', to: '/barcode', adminAlways: true, icon: <IconBarcode />, tone: 'slate' },
  { id: 'unset', labelKey: 'tileUnsettled', to: '/payments', nav: 'payments', icon: <IconUnsettled />, tone: 'purple' },
]

const toolTiles: TileDef[] = [
  { id: 'day', labelKey: 'tileDayClose', to: '/back-office?tab=day', nav: 'back-office', icon: <IconCalendar />, tone: 'green' },
  { id: 'exp', labelKey: 'navExpenses', to: '/expenses', nav: 'expenses', icon: <IconWallet />, tone: 'pink' },
  { id: 'acc', labelKey: 'tileAccounts', to: '/accounts', nav: 'accounts', adminAlways: true, icon: <IconAccounts />, tone: 'teal' },
  { id: 'set', labelKey: 'tileSettings', to: '/settings', nav: 'settings', icon: <IconGear />, tone: 'blue' },
  { id: 'kds', labelKey: 'tileKitchenDisplay', to: '/kitchen', nav: 'kitchen', icon: <IconKitchen />, tone: 'orange' },
  { id: 'fs', labelKey: 'tileFoodServer', to: '/dine-in?mode=server', nav: 'dine-in', icon: <IconServer />, tone: 'teal' },
  { id: 'tkt', labelKey: 'tileTicket', to: '/back-office?tab=sales', nav: 'back-office', icon: <IconTicket />, tone: 'purple' },
]

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export default function HomePage() {
  const { user } = useAuth()
  const { kitchen, tables, tickets, ledger, dayIsClosed, flash, tableOrders, tableDiscounts, getTableChargeLines } =
    usePos()
  const { connectivity, lastSyncAt, runSync } = useSync()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const now = useNow(30_000)

  const stats = useHomeDashboardStats({
    tables,
    tableOrders,
    tickets,
    kitchen,
    tableDiscounts,
    getTableChargeLines,
  })

  const today = useMemo(() => {
    const day = dayKeyFromToday(0)
    const summary = daySales(ledger, day, true)
    return { summary, trend: trendVsPrevious(ledger, day, summary.total) }
  }, [ledger])

  const recent = useMemo(
    () => recentOrders({ ledger, tickets, tables, kitchen }),
    // `now` keeps relative ordering fresh for clock-string timestamps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ledger, tickets, tables, kitchen, now],
  )

  if (!user) return null

  const perms = getPermissions(user.role)
  const allowed = new Set(perms.nav)
  const isAdmin = user.role === 'admin'
  const can = (key: NavKey) => isAdmin || allowed.has(key)
  const loading = connectivity === 'syncing' && lastSyncAt === 0 && ledger.length === 0

  function canSee(tile: TileDef) {
    if (tile.id === 'acc') {
      return isAdmin || perms.canBackOffice || perms.canMasters || allowed.has('expenses')
    }
    if (isAdmin && tile.adminAlways) return true
    if (tile.nav) return allowed.has(tile.nav)
    return isAdmin
  }

  function tileBadge(tile: TileDef): number | undefined {
    switch (tile.id) {
      case 'dine':
        return badgeCount(stats.dineOpenCount)
      case 'quick':
        return badgeCount(stats.quickServeCount)
      case 'drive':
        return badgeCount(stats.driveThruCount)
      case 'delivery':
        return badgeCount(stats.deliveryCount)
      case 'online':
        return badgeCount(stats.onlineCount)
      case 'takeaway':
        return badgeCount(stats.takeawayCount)
      case 'unset':
        return badgeCount(stats.unsettledCount)
      case 'kds':
        return badgeCount(stats.kitchenQueue)
      default:
        return tile.badge
    }
  }

  const q = query.trim().toLowerCase()
  const matches = (tile: TileDef) => !q || t[tile.labelKey].toLowerCase().includes(q)
  const ops = opsTiles.filter(canSee).filter(matches)
  const tools = toolTiles.filter(canSee).filter(matches)

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !q) return
    const tableHit = can('dine-in')
      ? tables.find((tb) => {
          const label = tb.label.toLowerCase()
          return label === q || `t${Number(tb.label)}` === q || String(Number(tb.label)) === q.replace(/^t/, '')
        })
      : undefined
    if (tableHit) {
      navigate(`/dine-in?table=${encodeURIComponent(tableHit.id)}`)
      return
    }
    const ticketHit = tickets.find(
      (tk) =>
        tk.lines.length > 0 &&
        (tk.id.toLowerCase().includes(q) ||
          tk.customer?.toLowerCase().includes(q) ||
          tk.phone?.toLowerCase().includes(q)),
    )
    if (ticketHit) {
      navigate(ticketHref(ticketHit))
      return
    }
    const tileHit = [...ops, ...tools].find((tile) => tile.to)
    if (tileHit?.to) navigate(tileHit.to)
  }

  function renderTile(tile: TileDef) {
    return (
      <ShortcutTile
        key={tile.id}
        label={t[tile.labelKey]}
        icon={tile.icon}
        tone={tile.tone}
        badge={tileBadge(tile)}
        to={tile.to}
        onClick={tile.to ? undefined : () => flash(`${t[tile.labelKey]} — ${t.comingLater}`)}
      />
    )
  }

  const trend = today.trend
  const salesSub =
    trend !== null ? (
      <span className={`hd-trend ${trend >= 0 ? 'is-up' : 'is-down'}`}>
        {trend >= 0 ? <IconArrowUp /> : <IconArrowDown />}
        {t.dashVsYesterday.replace('{pct}', `${trend >= 0 ? '+' : ''}${trend}%`)}
      </span>
    ) : stats.openValue > 0 ? (
      t.dashOpenAmount.replace('{amount}', money(stats.openValue))
    ) : undefined

  const live = [
    { id: 'kitchen', count: stats.kitchenQueue, label: t.homePulseKitchen, action: t.dashViewOrders, to: '/kitchen', tone: 'blue' as const, icon: <IconChef />, show: can('kitchen') },
    { id: 'billing', count: stats.billingCount, label: t.homePulseBilling, action: t.dashViewTables, to: '/dine-in', tone: 'orange' as const, icon: <IconTable />, show: can('dine-in') },
    { id: 'unsettled', count: stats.unsettledCount, label: t.homePulseUnsettled, action: t.dashViewTickets, to: '/payments', tone: 'purple' as const, icon: <IconReceipt />, show: can('payments') },
    { id: 'delivery', count: stats.deliveryCount + stats.onlineCount, label: t.homePulseDelivery, action: t.dashViewOrders, to: '/delivery', tone: 'teal' as const, icon: <IconBike />, show: can('delivery') || can('online') },
  ].filter((item) => item.show)

  const ordersLink = can('back-office') ? '/back-office?tab=sales' : can('payments') ? '/payments' : undefined
  const dayLabel = dayIsClosed ? t.dayClosed : t.dayOpen
  const dayHint = dayIsClosed ? t.dashDayClosedHint : t.dashDayOpenHint
  const dayBody = (
    <>
      <span className="hd-day-icon">{dayIsClosed ? <IconMoon /> : <IconSun />}</span>
      <span>{dayLabel}</span>
      {can('back-office') ? <IconChevron /> : null}
    </>
  )

  return (
    <div className="hd">
      <DashHeader search={query} onSearchChange={setQuery} onSearchKeyDown={onSearchKey} />

      <div className="hd-main">
        <div className="hd-welcome">
          <div>
            <h1>
              {t.homeWelcome}, {user.name}! <span aria-hidden>👋</span>
            </h1>
            <p>{t.homeSubtitle}</p>
          </div>
          {can('back-office') ? (
            <Link to="/back-office?tab=day" className={`hd-day${dayIsClosed ? ' is-closed' : ''}`} title={dayHint}>
              {dayBody}
            </Link>
          ) : (
            <div className={`hd-day${dayIsClosed ? ' is-closed' : ''}`} title={dayLabel}>
              {dayBody}
            </div>
          )}
        </div>

        {connectivity === 'offline' ? (
          <div className="hd-alert" role="status">
            <span>{t.dashOfflineNote}</span>
            <button type="button" onClick={() => void runSync({ force: true })}>
              {t.dashRetry}
            </button>
          </div>
        ) : null}

        <div className="hd-kpis">
          <KpiCard
            tone="green"
            icon={<IconTable />}
            label={t.homeStatsTables}
            value={stats.openTablesCount}
            sub={t.dashTablesOutOf.replace('{n}', String(tables.length))}
            to={can('dine-in') ? '/dine-in' : undefined}
          />
          <KpiCard
            tone="orange"
            icon={<IconReceipt />}
            label={t.homeStatsBilling}
            value={stats.billingCount}
            sub={t.dashOrdersInBilling}
            to={can('payments') ? '/payments' : can('dine-in') ? '/dine-in' : undefined}
          />
          <KpiCard
            tone="blue"
            icon={<IconChef />}
            label={t.homeStatsKitchen}
            value={stats.kitchenQueue}
            sub={t.dashOrdersInKitchen}
            to={can('kitchen') ? '/kitchen' : undefined}
          />
          <KpiCard
            tone="teal"
            icon={<IconCash />}
            label={t.dashTodaysSales}
            value={loading ? <span className="hd-skel hd-skel-kpi" /> : money(today.summary.total)}
            sub={loading ? undefined : salesSub}
            to={can('back-office') ? '/back-office?tab=day' : can('reports') ? '/reports' : undefined}
          />
        </div>

        <div className="hd-grid">
          <div className="hd-content">
            {ops.length > 0 ? (
              <section className="hd-section" aria-labelledby="hd-service-title">
                <header className="hd-section-head">
                  <h2 id="hd-service-title">{t.serviceHub}</h2>
                  <p>{t.serviceHubHint}</p>
                </header>
                <div className="hd-tiles">{ops.map(renderTile)}</div>
              </section>
            ) : null}

            {tools.length > 0 ? (
              <section className="hd-section" aria-labelledby="hd-office-title">
                <header className="hd-section-head">
                  <h2 id="hd-office-title">{t.backOfficeHub}</h2>
                  <p>{t.backOfficeHubHint}</p>
                </header>
                <div className="hd-tiles">{tools.map(renderTile)}</div>
              </section>
            ) : null}

            {q && ops.length === 0 && tools.length === 0 ? (
              <p className="hd-empty">
                {t.noMatches} “{query.trim()}”
              </p>
            ) : null}

            {!q && live.length > 0 ? (
              <section className="hd-section" aria-labelledby="hd-live-title">
                <header className="hd-section-head">
                  <h2 id="hd-live-title">{t.homePulseTitle}</h2>
                  <p>{t.homePulseHint}</p>
                </header>
                <div className="hd-lives">
                  {live.map((item) => (
                    <LiveStatusCard
                      key={item.id}
                      count={item.count}
                      label={item.label}
                      action={item.action}
                      icon={item.icon}
                      tone={item.tone}
                      to={item.to}
                    />
                  ))}
                </div>
                {live.every((item) => item.count === 0) ? <p className="hd-clear">{t.homePulseAllClear}</p> : null}
              </section>
            ) : null}

            {!q && can('dine-in') ? <TableStatusStrip tables={tables} now={now} /> : null}
          </div>

          <aside className="hd-aside">
            <SalesPanel ledger={ledger} loading={loading} />
            <RecentOrdersCard orders={recent} loading={loading} viewAllTo={ordersLink} />
          </aside>
        </div>
      </div>
    </div>
  )
}
