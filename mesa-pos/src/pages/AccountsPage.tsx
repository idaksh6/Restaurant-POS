import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { pathAllowed, type RoleKey } from '../auth/roles'
import AccessDenied from '../components/AccessDenied'
import AccountsShell from '../components/AccountsShell'
import { useI18n, type I18nKey } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'

type HubCard = {
  to: string
  titleKey: I18nKey
  hintKey: I18nKey
  tone: 'teal' | 'amber' | 'rose' | 'ocean' | 'violet' | 'lime'
  icon: ReactNode
  primary?: boolean
}

function IconCard({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      {children}
    </svg>
  )
}

const MODULES: HubCard[] = [
  {
    to: '/accounts/gl-export',
    titleKey: 'glTitle',
    hintKey: 'glHint',
    tone: 'ocean',
    primary: true,
    icon: (
      <IconCard>
        <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
      </IconCard>
    ),
  },
  {
    to: '/accounts/coa',
    titleKey: 'coaTitle',
    hintKey: 'coaHint',
    tone: 'violet',
    primary: true,
    icon: (
      <IconCard>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </IconCard>
    ),
  },
  {
    to: '/accounts/ap',
    titleKey: 'apTitle',
    hintKey: 'apHint',
    tone: 'amber',
    primary: true,
    icon: (
      <IconCard>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8M8 13h5" />
      </IconCard>
    ),
  },
  {
    to: '/back-office?tab=sales',
    titleKey: 'setSalesLedger',
    hintKey: 'accountsLedgerHint',
    tone: 'lime',
    primary: true,
    icon: (
      <IconCard>
        <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" />
      </IconCard>
    ),
  },
  {
    to: '/back-office?tab=day',
    titleKey: 'tileDayClose',
    hintKey: 'accountsDayCloseHint',
    tone: 'violet',
    primary: true,
    icon: (
      <IconCard>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 11h18" />
      </IconCard>
    ),
  },
  {
    to: '/reports',
    titleKey: 'accountsReports',
    hintKey: 'accountsReportsHint',
    tone: 'ocean',
    primary: true,
    icon: (
      <IconCard>
        <path d="M4 19V9M10 19V5M16 19v-7M20 19H3" />
      </IconCard>
    ),
  },
]

const RELATED: HubCard[] = [
  {
    to: '/purchase-orders',
    titleKey: 'setPurchaseOrder',
    hintKey: 'accountsPoHint',
    tone: 'amber',
    icon: (
      <IconCard>
        <path d="M7 4h10l2 4v12H5V8l2-4Z" />
        <path d="M5 8h14M9 12h6M9 16h4" />
      </IconCard>
    ),
  },
  {
    to: '/settings/gift-cards',
    titleKey: 'giftCards',
    hintKey: 'accountsGiftHint',
    tone: 'rose',
    icon: (
      <IconCard>
        <rect x="3" y="7" width="18" height="12" rx="2" />
        <path d="M3 12h18M12 7v12" />
      </IconCard>
    ),
  },
  {
    to: '/settings/food-vouchers',
    titleKey: 'foodVouchers',
    hintKey: 'accountsVoucherHint',
    tone: 'teal',
    icon: (
      <IconCard>
        <path d="M4 8h16v10H4z" />
        <path d="M8 8V6a4 4 0 0 1 8 0v2" />
      </IconCard>
    ),
  },
]

function canOpenPath(role: RoleKey, pathname: string) {
  return pathAllowed(role, pathname.split('?')[0])
}

export default function AccountsPage() {
  const { user } = useAuth()
  const { t } = useI18n()

  if (!user) return null
  if (!pathAllowed(user.role, '/accounts')) {
    return <AccessDenied pathname="/accounts" />
  }

  const role = user.role
  const modules = MODULES.filter((card) => canOpenPath(role, card.to))
  const related = RELATED.filter((card) => canOpenPath(role, card.to))

  return (
    <AccountsShell active="hub" title={t.accountsHubTitle} subtitle={t.accountsHubHint}>
      <div className="acct-hub">
        <section className="acct-hub-section" aria-labelledby="acct-hub-core">
          <header className="acct-hub-section-head">
            <h2 id="acct-hub-core">{t.accountsCoreModules}</h2>
            <p>{t.accountsCoreModulesHint}</p>
          </header>
          <div className="acct-hub-grid">
            {modules.map((card) => (
              <Link
                key={card.to}
                to={card.to}
                className={`acct-hub-card tone-${card.tone}${card.primary ? ' is-primary' : ''}`}
              >
                <span className="acct-hub-card-icon" aria-hidden>
                  {card.icon}
                </span>
                <span className="acct-hub-card-copy">
                  <strong>{t[card.titleKey]}</strong>
                  <small>{t[card.hintKey]}</small>
                </span>
                <span className="acct-hub-card-go" aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {related.length > 0 ? (
          <section className="acct-hub-section" aria-labelledby="acct-hub-related">
            <header className="acct-hub-section-head">
              <h2 id="acct-hub-related">{t.accountsRelated}</h2>
              <p>{t.accountsRelatedHint}</p>
            </header>
            <div className="acct-hub-grid related">
              {related.map((card) => (
                <Link key={card.to} to={card.to} className={`acct-hub-card tone-${card.tone} is-related`}>
                  <span className="acct-hub-card-icon" aria-hidden>
                    {card.icon}
                  </span>
                  <span className="acct-hub-card-copy">
                    <strong>{t[card.titleKey]}</strong>
                    <small>{t[card.hintKey]}</small>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AccountsShell>
  )
}
