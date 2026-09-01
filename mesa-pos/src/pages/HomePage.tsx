import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { money, lineTotal } from '../data/mock'
import { getPermissions, type NavKey } from '../auth/roles'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { localeTag, useI18n, type I18nKey } from '../locale/i18n'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import DashHeader from '../components/DashHeader'

type TileDef = {
  id: string
  labelKey: I18nKey
  to?: string
  nav?: NavKey
  /** Always show for admin; otherwise require nav */
  adminAlways?: boolean
  icon: ReactNode
  color: string
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
function IconPlate() {
  return (
    <Glyph>
      <circle cx="12" cy="13" r="7" />
      <circle cx="12" cy="13" r="2.2" />
      <path d="M8 4.5h8" />
    </Glyph>
  )
}
function IconBolt() {
  return (
    <Glyph>
      <path d="M13 2 6 13h6l-1 9 7-11h-6l1-9Z" />
    </Glyph>
  )
}
function IconCar() {
  return (
    <Glyph>
      <path d="M4 14h16l-1.5-5H6L4 14Z" />
      <path d="M7 9 8.2 6h7.6L17 9" />
      <circle cx="7.5" cy="16.5" r="1.6" />
      <circle cx="16.5" cy="16.5" r="1.6" />
    </Glyph>
  )
}
function IconBike() {
  return (
    <Glyph>
      <circle cx="6.5" cy="16" r="3" />
      <circle cx="17.5" cy="16" r="3" />
      <path d="M6.5 16 11 8h3l3.5 8M11 8 8 16M14 8l-2 4h5" />
    </Glyph>
  )
}
function IconGlobe() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.6 2.8 2.6 12.2 0 16M12 4c-2.6 2.8-2.6 12.2 0 16" />
    </Glyph>
  )
}
function IconBag() {
  return (
    <Glyph>
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </Glyph>
  )
}
function IconUser() {
  return (
    <Glyph>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
    </Glyph>
  )
}
function IconCup() {
  return (
    <Glyph>
      <path d="M7 6h9v8a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V6Z" />
      <path d="M16 9h2.2a2.2 2.2 0 1 1 0 4.4H16" />
      <path d="M8 20h8" />
    </Glyph>
  )
}
function IconCalendar() {
  return (
    <Glyph>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </Glyph>
  )
}
function IconReturn() {
  return (
    <Glyph>
      <path d="M8 11h9a4 4 0 1 1 0 8H10" />
      <path d="M8 11 5 8l3-3" />
    </Glyph>
  )
}
function IconBarcode() {
  return (
    <Glyph>
      <path d="M5 5v14M8 5v14M10.5 5v9M13 5v14M16 5v10M19 5v14" />
    </Glyph>
  )
}
function IconUnsettled() {
  return (
    <Glyph>
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M15 3v4h4M9 12h8M9 16h5" />
    </Glyph>
  )
}
function IconDay() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </Glyph>
  )
}
function IconAccounts() {
  return (
    <Glyph>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8 14h5" />
    </Glyph>
  )
}
function IconGear() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12H20.5M6.2 6.2l1.6 1.6M16.2 16.2l1.6 1.6M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6" />
    </Glyph>
  )
}
function IconKitchen() {
  return (
    <Glyph>
      <path d="M5 13h14v7H5v-7Z" />
      <path d="M8 13V9a4 4 0 0 1 8 0v4" />
    </Glyph>
  )
}
function IconServer() {
  return (
    <Glyph>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c1.2-4 5-6 7-6s5.8 2 7 6" />
    </Glyph>
  )
}
function IconTicket() {
  return (
    <Glyph>
      <path d="M4 7h16v3a2.5 2.5 0 1 0 0 4v3H4v-3a2.5 2.5 0 1 0 0-4V7Z" />
    </Glyph>
  )
}
function IconStore() {
  return (
    <Glyph>
      <path d="M4 10 6.5 5h11L20 10v10H4V10Z" />
      <path d="M10 20v-7h4v7" />
    </Glyph>
  )
}

const opsTiles: TileDef[] = [
  { id: 'dine', labelKey: 'tileDineIn', to: '/dine-in', nav: 'dine-in', icon: <IconPlate />, color: '#2f9e44' },
  { id: 'quick', labelKey: 'tileQuickServe', to: '/quick-serve', nav: 'takeaway', icon: <IconBolt />, color: '#f08c00' },
  { id: 'drive', labelKey: 'tileDriveThru', to: '/drive-thru', nav: 'takeaway', adminAlways: true, icon: <IconCar />, color: '#845ef7' },
  { id: 'delivery', labelKey: 'tileDelivery', to: '/delivery', nav: 'delivery', icon: <IconBike />, color: '#1971c2' },
  { id: 'online', labelKey: 'tileOnline', to: '/online', nav: 'online', icon: <IconGlobe />, color: '#0c8599' },
  { id: 'takeaway', labelKey: 'tileTakeAway', to: '/takeaway', nav: 'takeaway', icon: <IconBag />, color: '#5c7cfa' },
  { id: 'customer', labelKey: 'tileCustomer', to: '/crm', nav: 'crm', icon: <IconUser />, color: '#ae3ec9' },
  { id: 'bev', labelKey: 'tileBeverages', to: '/dine-in', nav: 'dine-in', adminAlways: true, icon: <IconCup />, color: '#7048e8' },
  { id: 'res', labelKey: 'tileReservation', adminAlways: true, icon: <IconCalendar />, color: '#c2255c' },
  { id: 'ret', labelKey: 'tileReturn', adminAlways: true, icon: <IconReturn />, color: '#e03131' },
  { id: 'bar', labelKey: 'tileBarcode', to: '/inventory', nav: 'inventory', adminAlways: true, icon: <IconBarcode />, color: '#495057' },
  { id: 'unset', labelKey: 'tileUnsettled', to: '/payments', nav: 'payments', icon: <IconUnsettled />, color: '#862e9c' },
]

const toolTiles: TileDef[] = [
  { id: 'day', labelKey: 'tileDayClose', to: '/back-office', nav: 'back-office', icon: <IconDay />, color: '#2b8a3e' },
  { id: 'acc', labelKey: 'tileAccounts', to: '/purchase-orders', nav: 'purchase-orders', icon: <IconAccounts />, color: '#087f5b' },
  { id: 'set', labelKey: 'tileSettings', to: '/settings', nav: 'settings', icon: <IconGear />, color: '#364fc7' },
  { id: 'kds', labelKey: 'tileKitchenDisplay', to: '/kitchen', nav: 'kitchen', icon: <IconKitchen />, color: '#e67700' },
  { id: 'fs', labelKey: 'tileFoodServer', to: '/dine-in', nav: 'dine-in', icon: <IconServer />, color: '#0b7285' },
  { id: 'tkt', labelKey: 'tileTicket', to: '/payments', nav: 'payments', icon: <IconTicket />, color: '#5f3dc4' },
  { id: 'store', labelKey: 'tileZkStore', adminAlways: true, icon: <IconStore />, color: '#212529' },
]

export default function HomePage() {
  const { user } = useAuth()
  const { kitchen, tables, tickets, dayIsClosed, flash } = usePos()
  const { activeShift } = useShift()
  const { activeBranch } = useBranch()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  if (!user) return null

  const perms = getPermissions(user.role)
  const allowed = new Set(perms.nav)
  const isAdmin = user.role === 'admin'

  const openTables = tables.filter((t) => t.status === 'occupied' || t.status === 'billing')
  const billing = tables.filter((t) => t.status === 'billing')
  const kitchenQueue = kitchen.filter((k) => k.status !== 'ready').length
  const openValue =
    openTables.reduce((s, t) => s + (t.amount ?? 0), 0) +
    tickets.reduce((s, t) => s + lineTotal(t.lines), 0)

  function canSee(tile: TileDef) {
    if (isAdmin && tile.adminAlways) return true
    if (tile.nav) return allowed.has(tile.nav)
    return isAdmin
  }

  const q = query.trim().toLowerCase()
  const ops = opsTiles
    .filter(canSee)
    .filter((tile) => !q || t[tile.labelKey].toLowerCase().includes(q))
  const tools = toolTiles
    .filter(canSee)
    .filter((tile) => !q || t[tile.labelKey].toLowerCase().includes(q))

  function soon(label: string) {
    flash(`${label} — ${t.comingLater}`)
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const hit = [...ops, ...tools].find((tile) => tile.to)
    if (hit?.to) navigate(hit.to)
  }

  return (
    <div className="zk-dash">
      <DashHeader search={query} onSearchChange={setQuery} onSearchKeyDown={onSearchKey} />

      <div className="zk-dash-body">
      {ops.length > 0 ? (
        <section className="zk-dash-section">
          <header className="zk-dash-section-head">
            <h2>{t.serviceHub}</h2>
          </header>
          <div className="zk-dash-ops">
            {ops.map((tile, i) => {
              const body = (
                <>
                  <span className="zk-dash-glow" aria-hidden />
                  <span className="zk-dash-icon">{tile.icon}</span>
                  <strong>{t[tile.labelKey]}</strong>
                </>
              )
              const style = { animationDelay: `${i * 0.03}s`, ['--tile' as string]: tile.color }
              if (tile.to) {
                return (
                  <Link key={tile.id} to={tile.to} className="zk-dash-tile" style={style}>
                    {body}
                  </Link>
                )
              }
              return (
                <button
                  key={tile.id}
                  type="button"
                  className="zk-dash-tile"
                  style={style}
                  onClick={() => soon(t[tile.labelKey])}
                >
                  {body}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="zk-dash-section">
        {tools.length > 0 ? (
          <header className="zk-dash-section-head">
            <h2>{t.backOfficeHub}</h2>
          </header>
        ) : null}
        <div className="zk-dash-tools">
          {tools.map((tile) => {
            const body = (
              <>
                <span className="zk-dash-tool-icon">{tile.icon}</span>
                <strong>{t[tile.labelKey]}</strong>
              </>
            )
            const style = { ['--tile' as string]: tile.color }
            if (tile.to) {
              return (
                <Link key={tile.id} to={tile.to} className="zk-dash-tool" style={style}>
                  {body}
                </Link>
              )
            }
            return (
              <button
                key={tile.id}
                type="button"
                className="zk-dash-tool"
                style={style}
                onClick={() => soon(t[tile.labelKey])}
              >
                {body}
              </button>
            )
          })}
        </div>
      </section>
      {q && ops.length === 0 && tools.length === 0 ? (
        <p className="zk-dash-empty">
          {t.noMatches} “{query.trim()}”
        </p>
      ) : null}
      </div>

      <div className="zk-dash-announce">
        <span className="zk-dash-announce-dot" aria-hidden />
        <p>
          <strong>{perms.label}</strong>
          <span>
            {openTables.length} {t.openLabel} · {billing.length} {t.billingLabel} · {kitchenQueue}{' '}
            {t.kotLabel} · {dayIsClosed ? t.dayClosed : t.dayOpen}
            {activeShift ? ` · ${t.shiftLabel} ${activeShift.userName}` : ''}
          </span>
        </p>
      </div>

      <footer className="zk-dash-foot">
        <span className="zk-dash-user">
          <em>{user.initials}</em>
          {user.name}
        </span>
        <span>
          {t.counter} · 1 · {activeBranch.code}
        </span>
        <span>
          {new Date().toLocaleDateString(localeTag(lang), {
            day: '2-digit',
            month: 'short',
            year: '2-digit',
          })}{' '}
          · {t.dayOpen}
        </span>
        <span className="zk-dash-open-amt">
          {t.openAmount} {money(openValue)}
        </span>
      </footer>
    </div>
  )
}
