import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { useI18n, type I18nKey } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import DashHeader from './DashHeader'
import { HubFooter } from './HubChrome'

export type AccountsSection = 'payment-types' | 'expense-types' | 'expense-details'

type NavItem = {
  id: AccountsSection
  to: string
  labelKey: I18nKey
  icon: string
  hintKey: I18nKey
}

const NAV: NavItem[] = [
  {
    id: 'payment-types',
    to: '/expenses/payment-types',
    labelKey: 'paymentTypes',
    icon: '💳',
    hintKey: 'paymentTypesHint',
  },
  {
    id: 'expense-types',
    to: '/expenses/types',
    labelKey: 'expenseTypes',
    icon: '🏷',
    hintKey: 'expenseTypesHint',
  },
  {
    id: 'expense-details',
    to: '/expenses',
    labelKey: 'expenseDetails',
    icon: '📋',
    hintKey: 'expenseDetailsHint',
  },
]

const HERO_ICON: Record<AccountsSection, string> = {
  'payment-types': '💳',
  'expense-types': '🏷',
  'expense-details': '📋',
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
        <header className="acct-hero">
          <div className="acct-hero-brand">
            <span className="acct-hero-mark" aria-hidden>
              {HERO_ICON[active]}
            </span>
            <div>
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="acct-hero-actions">{actions}</div> : null}
        </header>

        <div className="zk-acct-body">
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
                  end={item.id === 'expense-details'}
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

          <section className="zk-acct-main">{children}</section>
        </div>
      </div>

      <HubFooter backTo="/" backLabel={t.home} primaryTo="/" primaryLabel={t.mainMenu} />
    </div>
  )
}
