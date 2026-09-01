import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { CompanyProfile } from '../data/company'
import { branchDisplayName, companyDisplayName } from '../lib/branding'
import { trySystemKeyboard } from '../lib/onScreenKeyboard'
import { localeTag, useI18n } from '../locale/i18n'
import { useBranch } from '../state/BranchContext'
import BrandMark from './BrandMark'
import HubNotifications from './HubNotifications'
import MesaSelect from './MesaSelect'
import VirtualKeyboard from './VirtualKeyboard'
import { useSync } from '../sync/SyncContext'

export function HubHeader({
  closeTo = '/settings',
  company: companyOverride,
}: {
  closeTo?: string | null
  company?: CompanyProfile
}) {
  const { company: ctxCompany, branches, activeBranch, switchBranch } = useBranch()
  const company = companyOverride ?? ctxCompany
  const { lang, t } = useI18n()
  const { connectivity, queued, outbox, runSync } = useSync()
  const brandName = companyDisplayName(company, lang)
  const poison = outbox.some((op) => op.status === 'poison')
  const lastErr = outbox.find(
    (op) => op.lastError && op.lastError !== 'retry',
  )?.lastError
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
  const nowLabel = new Date().toLocaleDateString(localeTag(lang), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const branchOptions = branches
    .filter((b) => b.active)
    .map((b) => ({
      value: b.id,
      label: `${b.code} · ${branchDisplayName(b, lang)}`,
    }))

  return (
    <header className="zk-hub-top">
      <div className="zk-hub-brand">
        <BrandMark name={brandName} logoUrl={company.logoDataUrl} className="zk-hub-mark" />
        <strong>{brandName} POS</strong>
      </div>

      <div className="zk-hub-center">
        <MesaSelect
          variant="chrome"
          aria-label={t.branch}
          title={`${t.activeBranch}: ${branchDisplayName(activeBranch, lang)}`}
          value={activeBranch.id}
          onChange={(id) => {
            if (id === activeBranch.id) return
            switchBranch(id)
            window.location.reload()
          }}
          options={branchOptions}
        />
      </div>

      <div className="zk-hub-top-right">
        <span className="zk-hub-date">{nowLabel}</span>
        <HubNotifications onSync={() => void runSync({ force: true })} />
        <button
          type="button"
          className={`mesa-sync-chip ${poison ? 'poison' : connectivity}`}
          onClick={() => void runSync({ force: true })}
          title={lastErr ? `${syncLabel} — ${lastErr}` : syncLabel}
        >
          <span className="mesa-sync-dot" aria-hidden />
          {syncLabel}
        </button>
        {closeTo ? (
          <Link to={closeTo} className="zk-hub-close" aria-label={t.cancel}>
            ✕
          </Link>
        ) : null}
      </div>
    </header>
  )
}

export function HubFooter({
  backTo = '/settings',
  backLabel,
  primaryTo = '/',
  primaryLabel,
  leading,
  actions,
  trailing,
  showKeyboard = true,
}: {
  backTo?: string
  backLabel?: string
  primaryTo?: string
  primaryLabel?: string
  leading?: ReactNode
  actions?: ReactNode
  trailing?: ReactNode
  showKeyboard?: boolean
}) {
  const { t } = useI18n()
  const [kbdOpen, setKbdOpen] = useState(false)

  async function onKeyboardClick() {
    const systemOk = await trySystemKeyboard()
    if (systemOk) {
      setKbdOpen(false)
      return
    }
    setKbdOpen((open) => !open)
  }

  const keyboardBtn = showKeyboard ? (
    <button
      type="button"
      className={`zk-hub-kbd${kbdOpen ? ' active' : ''}`}
      onClick={() => void onKeyboardClick()}
      aria-pressed={kbdOpen}
      aria-label={t.keyboard}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
      </svg>
      <span>{t.keyboard}</span>
    </button>
  ) : null

  return (
    <>
      <footer className="zk-hub-foot">
        <div className="zk-hub-foot-leading">
          {leading ?? (
            <Link to={backTo} className="zk-hub-back">
              <span className="zk-hub-back-arrow" aria-hidden>
                ←
              </span>
              {backLabel ?? t.settings}
            </Link>
          )}
          {keyboardBtn}
        </div>
        {actions}
        {trailing !== undefined ? (
          trailing
        ) : (
          <Link to={primaryTo} className="zk-hub-home">
            {primaryLabel ?? t.mainMenu}
          </Link>
        )}
      </footer>
      <VirtualKeyboard open={kbdOpen} onClose={() => setKbdOpen(false)} />
    </>
  )
}

/** Circular green “+” used in Settings hub title bars (Products, Departments, …). */
export function HubAddButton({
  title,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button
      type="button"
      className={`mesa-hub-add${className ? ` ${className}` : ''}`}
      title={title}
      aria-label={title}
      {...rest}
    />
  )
}
