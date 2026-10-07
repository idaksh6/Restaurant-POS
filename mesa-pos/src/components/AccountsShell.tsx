import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { useI18n, type I18nKey } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import DashHeader from './DashHeader'
import { HubFooter } from './HubChrome'

export type AccountsSection = 'hub' | 'coa' | 'gl-export' | 'ap'

type NavItem = {
  id: AccountsSection
  to: string
  labelKey: I18nKey
  icon: string
  hintKey: I18nKey
  end?: boolean
}

const NAV: NavItem[] = [
  {
    id: 'hub',
    to: '/accounts',
    labelKey: 'accountsOverview',
    icon: '⌂',
    hintKey: 'accountsOverviewHint',
    end: true,
  },
  {
    id: 'coa',
    to: '/accounts/coa',
    labelKey: 'coaTitle',
    icon: '📒',
    hintKey: 'coaHint',
  },
  {
    id: 'gl-export',
    to: '/accounts/gl-export',
    labelKey: 'glTitle',
    icon: '📤',
    hintKey: 'glHint',
  },
  {
    id: 'ap',
    to: '/accounts/ap',
    labelKey: 'apTitle',
    icon: '🧾',
    hintKey: 'apHint',
  },
]

const HERO_ICON: Record<AccountsSection, string> = {
  hub: '📒',
  coa: '📒',
  'gl-export': '📤',
  ap: '🧾',
}

type Props = {
  active: AccountsSection
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  search?: string
  onSearchChange?: (value: string) => void
}

export default function AccountsShell({
  active,
  title,
  subtitle,
  actions,
  children,
  search = '',
  onSearchChange,
}: Props) {
  const { user } = useAuth()
  const { t } = useI18n()
  const perms = user ? getPermissions(user.role) : null
  const canMasters = Boolean(perms?.canMasters || user?.role === 'admin')

  return (
    <div className="zk-acct">
      <DashHeader
        search={search}
        onSearchChange={onSearchChange ?? (() => undefined)}
        brandTo="/"
      />

      <div className="acct-page-inner">
        <div className={`zk-acct-body${active === 'hub' ? ' is-hub' : ''}`}>
          <aside className="zk-acct-side">
            <div className="zk-acct-side-head">
              <p className="zk-acct-kicker">{t.accounts}</p>
              <strong>{t.accountsHubTitle}</strong>
              <small>{t.accountsHubHint}</small>
            </div>
            <nav className="zk-acct-nav" aria-label={t.accounts}>
              {NAV.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.to}
                  className={({ isActive }) =>
                    `zk-acct-nav-link${isActive || item.id === active ? ' active' : ''}`
                  }
                  end={item.end}
                >
                  <span className="zk-acct-nav-icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="zk-acct-nav-copy">
                    <strong>{t[item.labelKey]}</strong>
                    <small>{t[item.hintKey]}</small>
                  </span>
                </NavLink>
              ))}
            </nav>
            {!canMasters ? (
              <p className="zk-acct-side-note">{t.accountsBackOfficeNote}</p>
            ) : null}
          </aside>

          <section className="zk-acct-main">
            <header className="acct-hero">
              <div className="acct-hero-brand">
                <span className="acct-hero-mark" aria-hidden>
                  {HERO_ICON[active]}
                </span>
                <div className="acct-hero-copy">
                  <h1>{title}</h1>
                  {subtitle ? <p>{subtitle}</p> : null}
                </div>
              </div>
              {actions ? <div className="acct-hero-actions">{actions}</div> : null}
            </header>
            <div className="zk-acct-main-body">{children}</div>
          </section>
        </div>
      </div>

      <HubFooter backTo="/" backLabel={t.home} primaryTo="/" primaryLabel={t.mainMenu} />
    </div>
  )
}
