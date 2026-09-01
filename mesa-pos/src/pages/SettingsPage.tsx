import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getPermissions, pathAllowed, settingsSectionAllowed } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import { parseSettingsTab, type SettingsSectionId } from '../lib/settingsHub'
import { useI18n, type I18nKey } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'

type SectionId = SettingsSectionId
type Tone = 'teal' | 'ocean' | 'amber' | 'violet' | 'rose' | 'slate' | 'lime'

type SettingsTile = {
  id: string
  labelKey: I18nKey
  to?: string
  icon: ReactNode
  tone: Tone
  group: string
  hint?: string
}

const sections: { id: SectionId; labelKey: I18nKey; icon: ReactNode }[] = [
  {
    id: 'settings',
    labelKey: 'settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      </svg>
    ),
  },
  {
    id: 'printer',
    labelKey: 'printer',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 9V4h12v5M6 14H4a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="6" rx="1" />
      </svg>
    ),
  },
  {
    id: 'products',
    labelKey: 'products',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 8h16l-1.5 11H5.5L4 8Z" />
        <path d="M8 8V6a4 4 0 0 1 8 0v2" />
      </svg>
    ),
  },
  {
    id: 'user',
    labelKey: 'user',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19c1.5-4 12.5-4 14 0" />
      </svg>
    ),
  },
  {
    id: 'accounts',
    labelKey: 'accounts',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'ingredients',
    labelKey: 'ingredients',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 20V10M12 20V4M17 20v-8" />
      </svg>
    ),
  },
  {
    id: 'inventory',
    labelKey: 'inventory',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 8.5 12 3l9 5.5v7L12 21l-9-5.5v-7Z" />
        <path d="M12 12v9M3 8.5 12 14l9-5.5" />
      </svg>
    ),
  },
  {
    id: 'database',
    labelKey: 'database',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    ),
  },
]

function tileIcon(kind: string) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 } as const
  switch (kind) {
    case 'building':
      return (
        <svg {...common}>
          <path d="M4 20V6l8-3 8 3v14H4Z" />
          <path d="M9 20v-6h6v6" />
        </svg>
      )
    case 'wrench':
      return (
        <svg {...common}>
          <path d="M14 7a4 4 0 0 0-5.5 5.5L4 17l3 3 4.5-4.5A4 4 0 0 0 14 7Z" />
        </svg>
      )
    case 'info':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 10v6M12 7h.01" />
        </svg>
      )
    case 'mail':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="m3 8 9 6 9-6" />
        </svg>
      )
    case 'people':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3" />
          <circle cx="16" cy="10" r="2.5" />
          <path d="M3 19c1-4 11-4 12 0M14 19c.5-2.5 4-3 6-2.2" />
        </svg>
      )
    case 'gift':
      return (
        <svg {...common}>
          <rect x="4" y="10" width="16" height="10" rx="1" />
          <path d="M12 10v10M4 14h16M12 10c-2-3-6-2-6 0h6c0-2 4-3 6 0H12Z" />
        </svg>
      )
    case 'pct':
      return (
        <svg {...common}>
          <path d="m6 18 12-12M8.5 8.5h.01M15.5 15.5h.01" />
        </svg>
      )
    case 'phone':
      return (
        <svg {...common}>
          <path d="M7 4h4l2 5-2 1a10 10 0 0 0 5 5l1-2 5 2v4a2 2 0 0 1-2 2A14 14 0 0 1 5 6a2 2 0 0 1 2-2Z" />
        </svg>
      )
    case 'truck':
      return (
        <svg {...common}>
          <path d="M3 7h11v10H3V7Z" />
          <path d="M14 10h4l3 3v4h-7v-7Z" />
          <circle cx="7" cy="18" r="1.5" />
          <circle cx="17" cy="18" r="1.5" />
        </svg>
      )
    case 'scooter':
      return (
        <svg {...common}>
          <circle cx="7" cy="17" r="2.5" />
          <circle cx="17" cy="17" r="2.5" />
          <path d="M7 17 12 8h4l2 9" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...common}>
          <path d="M6 16h12l-1-6a5 5 0 0 0-10 0l-1 6Z" />
          <path d="M10 16a2 2 0 0 0 4 0" />
        </svg>
      )
    case 'table':
      return (
        <svg {...common}>
          <path d="M4 10h16v3H4v-3Z" />
          <path d="M7 13v6M17 13v6M10 13v4M14 13v4" />
        </svg>
      )
    case 'area':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M4 10h16M10 10v9" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="14" rx="2" />
          <path d="M8 3v4M16 3v4M4 11h16" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      )
    case 'mobile':
      return (
        <svg {...common}>
          <rect x="8" y="3" width="8" height="18" rx="2" />
          <path d="M11 18h2" />
        </svg>
      )
    case 'monitor':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )
    case 'money':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="10" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )
    case 'exchange':
      return (
        <svg {...common}>
          <path d="M7 8h11l-3-3M17 16H6l3 3" />
        </svg>
      )
    case 'box':
      return (
        <svg {...common}>
          <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
        </svg>
      )
    case 'dish':
      return (
        <svg {...common}>
          <path d="M6 14c0-4 12-4 12 0v2H6v-2Z" />
          <path d="M8 10c1-3 7-3 8 0" />
        </svg>
      )
    case 'combo':
      return (
        <svg {...common}>
          <path d="M8 7h8v4H8V7Z" />
          <path d="M10 11v7M14 11v7M7 18h10" />
        </svg>
      )
    case 'pig':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <path d="M10 12h.01M14 12h.01M9 15c1.5 1 4.5 1 6 0" />
        </svg>
      )
    case 'scale':
      return (
        <svg {...common}>
          <path d="M12 4v3M7 9h10l-2 8H9L7 9Z" />
          <path d="M9 20h6" />
        </svg>
      )
    case 'charge':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v8M9.5 10.5 12 8l2.5 2.5" />
        </svg>
      )
    case 'waiter':
      return (
        <svg {...common}>
          <circle cx="12" cy="7" r="3" />
          <path d="M6 20c1-5 11-5 12 0" />
        </svg>
      )
    case 'list':
      return (
        <svg {...common}>
          <path d="M8 7h11M8 12h11M8 17h11M5 7h.01M5 12h.01M5 17h.01" />
        </svg>
      )
    case 'db':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="7" rx="6" ry="2.5" />
          <path d="M6 7v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7" />
        </svg>
      )
    case 'backup':
      return (
        <svg {...common}>
          <path d="M12 5v8M9 10l3 3 3-3" />
          <path d="M5 16h14v3H5v-3Z" />
        </svg>
      )
    case 'print':
      return (
        <svg {...common}>
          <path d="M7 9V4h10v5M7 14H5a2 2 0 0 1-2-2v-1h18v1a2 2 0 0 1-2 2h-2" />
          <rect x="7" y="14" width="10" height="6" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 3.5 3.5" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      )
  }
}

function tile(
  id: string,
  labelKey: I18nKey,
  icon: string,
  tone: Tone,
  group: string,
  to?: string,
  hint?: string,
): SettingsTile {
  return { id, labelKey, icon: tileIcon(icon), tone, group, to, hint }
}

const grids: Record<SectionId, SettingsTile[]> = {
  settings: [
    tile('company', 'companyDetails', 'building', 'teal', 'Business', '/settings/company', 'Brand, VAT & branches'),
    tile('zatca', 'zatcaEInvoice', 'pig', 'rose', 'Business', '/settings/company?focus=zatca', 'Phase 1 QR on receipts'),
    tile('utility', 'setUtility', 'wrench', 'slate', 'Business', undefined, 'Tools & diagnostics'),
    tile('about', 'setAbout', 'info', 'ocean', 'Business', undefined, 'App version & info'),
    tile('email', 'setEmail', 'mail', 'violet', 'Business', undefined, 'Outgoing mail'),
    tile('customers', 'setCustomers', 'people', 'teal', 'Guests & loyalty', '/crm', 'CRM & points'),
    tile('gift', 'giftCards', 'gift', 'rose', 'Guests & loyalty', '/settings/gift-cards'),
    tile('voucher', 'foodVouchers', 'pct', 'amber', 'Guests & loyalty', '/settings/food-vouchers'),
    tile('reservation', 'tileReservation', 'phone', 'ocean', 'Guests & loyalty'),
    tile('vendor', 'setVendor', 'truck', 'slate', 'Operations', '/settings/vendors'),
    tile('delivery-boy', 'setDeliveryBoy', 'scooter', 'lime', 'Operations', '/settings/delivery-riders'),
    tile('notify', 'setNotify', 'bell', 'amber', 'Operations', '/settings/notifications'),
    tile('delivery-api', 'setDeliveryApi', 'mobile', 'ocean', 'Operations', '/settings/delivery-integrations'),
    tile('counter', 'counter', 'bell', 'teal', 'Floor & service', '/quick-serve'),
    tile('table-area', 'setTableArea', 'area', 'violet', 'Floor & service', '/settings/floor'),
    tile('table-mgmt', 'setTableMgmt', 'table', 'teal', 'Floor & service', '/settings/floor?tab=tables'),
    tile('menu-time', 'menuTimetable', 'calendar', 'amber', 'Floor & service', '/settings/menu-timetable'),
    tile('addons', 'setAddons', 'plus', 'lime', 'Menu & channels', '/masters'),
    tile('online-type', 'setOnlineType', 'mobile', 'ocean', 'Menu & channels', '/online'),
    tile('pos-web', 'setPosWeb', 'monitor', 'slate', 'Menu & channels'),
    tile('fx', 'setFx', 'exchange', 'amber', 'Money'),
    tile('denom', 'setDenom', 'money', 'teal', 'Money'),
  ],
  printer: [
    tile('receipt-printer', 'setReceiptPrinter', 'print', 'teal', 'Printers', '/settings/printers?focus=receipt'),
    tile('kot-printer', 'setKotPrinter', 'print', 'amber', 'Printers', '/settings/printers?focus=kot'),
    tile('printer-map', 'setPrinterMap', 'list', 'ocean', 'Printers', '/settings/printers?focus=map'),
    tile('print-template', 'setPrintTemplate', 'list', 'violet', 'Printers', '/settings/printers?focus=template'),
  ],
  products: [
    tile('dept', 'setDeptList', 'list', 'teal', 'Catalog', '/settings/departments'),
    tile('menu-items', 'setMenuItems', 'dish', 'lime', 'Catalog', '/masters?tab=dishes'),
    tile('menu-details', 'setMenuDetails', 'box', 'ocean', 'Catalog', '/settings/menu-details'),
    tile('combo', 'setCombo', 'combo', 'amber', 'Catalog'),
    tile('tax', 'tax', 'pig', 'rose', 'Pricing & tax', '/settings/tax'),
    tile('tax-update', 'setTaxUpdate', 'exchange', 'violet', 'Pricing & tax', '/settings/tax-update'),
    tile('discount', 'discount', 'gift', 'amber', 'Pricing & tax', '/settings/discount'),
    tile('units', 'units', 'scale', 'slate', 'Pricing & tax', '/settings/units'),
    tile('extra', 'setExtraCharges', 'charge', 'ocean', 'Pricing & tax', '/settings/extra-charges'),
    tile('point', 'setPointMaster', 'waiter', 'teal', 'Loyalty & drinks', '/crm'),
    tile('bev-qty', 'setBevQty', 'waiter', 'lime', 'Loyalty & drinks', '/masters'),
    tile('bev-price', 'setBevPrice', 'waiter', 'amber', 'Loyalty & drinks', '/masters'),
    tile('online-price', 'setOnlinePrice', 'list', 'ocean', 'Loyalty & drinks', '/online'),
  ],
  user: [
    tile('user-list', 'userList', 'people', 'teal', 'Access', '/settings/users'),
    tile('roles', 'setRoles', 'waiter', 'ocean', 'Access', '/settings/roles'),
    tile('role-priv', 'setRolePriv', 'wrench', 'amber', 'Access', '/settings/roles?focus=privileges'),
    tile('pin', 'setPinLogin', 'mobile', 'violet', 'Access', '/settings/users?focus=pin'),
  ],
  accounts: [
    tile('payment-type', 'paymentTypes', 'money', 'teal', 'Accounts', '/expenses/payment-types'),
    tile('expense-types', 'expenseTypes', 'list', 'amber', 'Accounts', '/expenses/types'),
    tile('expense-details', 'expenseDetails', 'pig', 'rose', 'Accounts', '/expenses'),
    tile('day-close', 'tileDayClose', 'calendar', 'violet', 'Close & ledger', '/back-office?tab=day'),
    tile('ledger', 'setSalesLedger', 'money', 'lime', 'Close & ledger', '/back-office?tab=sales'),
  ],
  ingredients: [
    tile(
      'ingredient-list',
      'setIngredientList',
      'box',
      'ocean',
      'Catalog',
      '/settings/ingredients/list',
      'Raw materials — name, SKU, unit',
    ),
    tile(
      'menu-recipes',
      'setMenuItemRecipes',
      'dish',
      'teal',
      'Recipes',
      '/masters?tab=dishes',
      'Assign ingredients to menu items',
    ),
    tile(
      'usage',
      'setRecipeUsage',
      'list',
      'amber',
      'Recipes',
      '/settings/ingredients/usage',
      'What each menu item consumes',
    ),
  ],
  inventory: [
    tile(
      'storage-locations',
      'setStorageLocations',
      'box',
      'violet',
      'Stock setup',
      '/settings/inventory/locations',
      'Walk-in, bar, kitchen, pastry areas',
    ),
    tile(
      'yield-conversions',
      'setYieldConversions',
      'dish',
      'teal',
      'Stock setup',
      '/settings/inventory/yield',
      'Raw → prepped prep links',
    ),
    tile('receiving', 'stockReceiving', 'truck', 'teal', 'Stock flow', '/settings/inventory/receiving'),
    tile('transfer', 'stockTransfer', 'scale', 'ocean', 'Stock flow', '/settings/inventory/transfer'),
    tile('po', 'setPurchaseOrder', 'list', 'amber', 'Stock flow', '/purchase-orders'),
    tile('stock', 'setStockList', 'box', 'lime', 'Stock flow', '/inventory?focus=stock&from=inventory'),
  ],
  database: [
    tile('export', 'setExport', 'backup', 'ocean', 'Data', '/settings/database/export'),
    tile('import', 'setImport', 'db', 'amber', 'Data', '/settings/database/import'),
    tile('backup', 'setBackup', 'backup', 'violet', 'Data', '/settings/database/backup'),
    tile('clear-demo', 'setDataClean', 'wrench', 'rose', 'Data', '/settings/database/clean'),
  ],
}

export default function SettingsPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const { flash } = usePos()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const section = parseSettingsTab(searchParams.get('tab'))

  const perms = user ? getPermissions(user.role) : null
  const role = user?.role ?? 'custom'
  const canAccess = Boolean(
    perms &&
      (perms.canMasters || perms.canManageUsers || perms.canBackOffice || user?.role === 'admin'),
  )

  const visibleSections = useMemo(
    () => sections.filter((s) => settingsSectionAllowed(s.id, role)),
    [role],
  )

  useEffect(() => {
    if (!canAccess || !visibleSections.length) return
    if (!visibleSections.some((s) => s.id === section)) {
      const first = visibleSections[0].id
      setSearchParams(first === 'settings' ? {} : { tab: first }, { replace: true })
    }
  }, [canAccess, section, visibleSections, setSearchParams])

  const tiles = useMemo(() => {
    const base = grids[section]
    return base.filter((tileItem) => {
      if (!tileItem.to) return perms?.canMasters || user?.role === 'admin'
      return pathAllowed(role, tileItem.to.split('?')[0])
    })
  }, [section, role, perms?.canMasters, user?.role])
  const sectionMeta = sections.find((s) => s.id === section)
  const title = t[sectionMeta?.labelKey ?? 'settings']

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tiles
    return tiles.filter((tileItem) => {
      const label = t[tileItem.labelKey].toLowerCase()
      return (
        label.includes(q) ||
        tileItem.group.toLowerCase().includes(q) ||
        (tileItem.hint ?? '').toLowerCase().includes(q)
      )
    })
  }, [tiles, query, t])

  const groups = useMemo(() => {
    const map = new Map<string, SettingsTile[]>()
    for (const tileItem of filtered) {
      const list = map.get(tileItem.group) ?? []
      list.push(tileItem)
      map.set(tileItem.group, list)
    }
    return [...map.entries()]
  }, [filtered])

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>{t.settingsLocked}</strong>
          {t.settingsLockedHint}
          <div style={{ marginTop: '1rem' }}>
            <Link to="/" className="btn btn-ghost">
              {t.mainMenu}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  function openSection(id: SectionId) {
    setQuery('')
    setSearchParams(id === 'settings' ? {} : { tab: id }, { replace: true })
  }

  function openTile(tileItem: SettingsTile) {
    if (tileItem.to) {
      const path = tileItem.to.split('?')[0]
      if (!pathAllowed(role, path)) {
        return
      }
      navigate(tileItem.to)
      return
    }
    flash(`${t[tileItem.labelKey]} — ${t.comingLater}`)
  }

  return (
    <div className="zk-settings zk-settings-desk">
      <DashHeader search={query} onSearchChange={setQuery} brandTo="/" />

      <div className="zk-settings-body">
        <aside className="zk-settings-side">
          <div className="zk-settings-admin">
            <em aria-hidden>{user?.initials ?? 'AD'}</em>
            <div className="zk-settings-admin-copy">
              <strong>{user?.roleLabel ?? 'Admin'}</strong>
              <small>{user?.name}</small>
            </div>
          </div>
          <nav className="zk-settings-nav" aria-label={t.settings}>
            {visibleSections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={section === s.id ? 'active' : ''}
                onClick={() => openSection(s.id)}
              >
                <span aria-hidden>{s.icon}</span>
                {t[s.labelKey]}
              </button>
            ))}
          </nav>
        </aside>

        <section className="zk-settings-main">
          <header className="zk-settings-head">
            <div>
              <p className="zk-settings-kicker">{t.settings}</p>
              <h1>{title}</h1>
              <p className="zk-settings-sub">
                {filtered.length} item{filtered.length === 1 ? '' : 's'}
                {query.trim() ? ' matching search' : ' in this section'}
              </p>
            </div>
            <label className="zk-settings-search">
              {tileIcon('search')}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings…"
                aria-label="Search settings"
              />
            </label>
          </header>

          {groups.length === 0 ? (
            <div className="zk-settings-empty">
              <strong>No matches</strong>
              <p>Try another search or clear the filter.</p>
              <button type="button" className="zk-settings-clear" onClick={() => setQuery('')}>
                Clear search
              </button>
            </div>
          ) : (
            <div className="zk-settings-groups">
              {groups.map(([group, items]) => (
                <section key={group} className="zk-settings-group">
                  <div className="zk-settings-group-head">
                    <h2>{group}</h2>
                    <span className="mesa-ltr-nums">{items.length}</span>
                  </div>
                  <div className="zk-settings-grid">
                    {items.map((tileItem) => (
                      <button
                        key={tileItem.id}
                        type="button"
                        className={`zk-settings-tile tone-${tileItem.tone}`}
                        onClick={() => openTile(tileItem)}
                      >
                        <span className="zk-settings-tile-icon" aria-hidden>
                          {tileItem.icon}
                        </span>
                        <strong>{t[tileItem.labelKey]}</strong>
                        {tileItem.hint ? <em>{tileItem.hint}</em> : null}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>

      <HubFooter backTo="/" backLabel={t.home} />
    </div>
  )
}
