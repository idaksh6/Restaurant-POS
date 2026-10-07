import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { pathAllowed, type RoleKey } from '../auth/roles'
import AccessDenied from '../components/AccessDenied'
import ExpensesShell from '../components/ExpensesShell'
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
    to: '/expenses',
    titleKey: 'expenseDetails',
    hintKey: 'expenseDetailsHint',
    tone: 'rose',
    primary: true,
    icon: (
      <IconCard>
        <path d="M8 4h7l4 4v12H8V4Z" />
        <path d="M15 4v4h4M10 12h6M10 16h4" />
      </IconCard>
    ),
  },
  {
    to: '/expenses/types',
    titleKey: 'expenseTypes',
    hintKey: 'expenseTypesHint',
    tone: 'amber',
    primary: true,
    icon: (
      <IconCard>
        <path d="M4 7h16M4 12h16M4 17h10" />
      </IconCard>
    ),
  },
  {
    to: '/expenses/payment-types',
    titleKey: 'paymentTypes',
    hintKey: 'paymentTypesHint',
    tone: 'teal',
    primary: true,
    icon: (
      <IconCard>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </IconCard>
    ),
  },
]

const RELATED: HubCard[] = [
  {
    to: '/reports',
    titleKey: 'accountsReports',
    hintKey: 'accountsReportsHint',
    tone: 'ocean',
    icon: (
      <IconCard>
        <path d="M4 19V9M10 19V5M16 19v-7M20 19H3" />
      </IconCard>
    ),
  },
]

function canOpenPath(role: RoleKey, pathname: string) {
  return pathAllowed(role, pathname.split('?')[0])
}

export default function ExpensesPage() {
  const { user } = useAuth()
  const { t } = useI18n()

  if (!user) return null
  if (!pathAllowed(user.role, '/expenses')) {
    return <AccessDenied pathname="/expenses" />
  }

  const role = user.role
  const modules = MODULES.filter((card) => canOpenPath(role, card.to))
  const related = RELATED.filter((card) => canOpenPath(role, card.to))

  return (
    <ExpensesShell active="hub" title={t.expensesHubTitle} subtitle={t.expensesHubHint}>
      <div className="acct-hub">
        <section className="acct-hub-section" aria-labelledby="exp-hub-core">
          <header className="acct-hub-section-head">
            <h2 id="exp-hub-core">{t.expensesCoreModules}</h2>
            <p>{t.expensesCoreModulesHint}</p>
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
          <section className="acct-hub-section" aria-labelledby="exp-hub-related">
            <header className="acct-hub-section-head">
              <h2 id="exp-hub-related">{t.accountsRelated}</h2>
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
                  <span className="acct-hub-card-go" aria-hidden>
                    →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </ExpensesShell>
  )
}
