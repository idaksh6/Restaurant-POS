import { useEffect, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { branchDisplayName, companyDisplayName } from '../lib/branding'
import { localeTag, useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'
import LangSwitch from './LangSwitch'
import MesaSelect from './MesaSelect'

export default function DashHeader({
  search,
  onSearchChange,
  onSearchKeyDown,
  brandTo,
}: {
  search: string
  onSearchChange: (value: string) => void
  onSearchKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  brandTo?: string
}) {
  const { user, logout } = useAuth()
  const { kitchen, tables } = usePos()
  const { branches, activeBranch, switchBranch, company } = useBranch()
  const { t, lang } = useI18n()
  const { connectivity, outbox, runSync } = useSync()
  const navigate = useNavigate()
  const [notesOpen, setNotesOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!profileOpen && !notesOpen) return
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (!el.closest('.zk-dash-profile')) setProfileOpen(false)
      if (!el.closest('.zk-dash-icon-btn') && !el.closest('.zk-dash-note-pop')) setNotesOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [profileOpen, notesOpen])

  if (!user) return null

  const poison = outbox.filter((op) => op.status === 'poison').length
  const lastErr = outbox.find((op) => op.lastError)?.lastError
  const syncLabel =
    connectivity === 'offline'
      ? t.offline
      : connectivity === 'syncing'
        ? t.syncing
        : poison
          ? t.syncPoison
          : t.online

  const brandName = companyDisplayName(company, lang)
  const branchLabel = `${activeBranch.code} - ${branchDisplayName(activeBranch, lang)}`
  const billing = tables.filter((table) => table.status === 'billing')
  const kitchenQueue = kitchen.filter((ticket) => ticket.status !== 'ready').length
  const alertCount = kitchenQueue + billing.length
  const clockDate = new Date(now)
    .toLocaleDateString(localeTag(lang), {
      day: '2-digit',
      month: 'short',
    })
    .toUpperCase()
  const clockTime = new Date(now).toLocaleTimeString(localeTag(lang), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const brand = (
    <div>
      <strong title={brandName}>{brandName}</strong>
      <small>{branchLabel}</small>
    </div>
  )

  return (
    <header className="zk-dash-header zk-dash-header-bar">
      {brandTo ? (
        <Link to={brandTo} className="zk-dash-brand">
          {brand}
        </Link>
      ) : (
        <div className="zk-dash-brand">{brand}</div>
      )}
      <label className="zk-dash-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20 16.5 16.5" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={t.search}
          aria-label={t.search}
        />
      </label>
      <div className="zk-dash-header-actions">
        <div className="zk-dash-branch">
          <MesaSelect
            variant="chrome"
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
                label: `${b.code} - ${branchDisplayName(b, lang)}`,
              }))}
          />
        </div>
        <div className="zk-dash-clock">
          <span>{clockDate}</span>
          <strong className="mesa-ltr-nums">{clockTime}</strong>
        </div>
        <div className="zk-dash-end-tools">
          <button
            type="button"
            className={`mesa-sync-chip ${poison ? 'poison' : connectivity}`}
            onClick={() => void runSync({ force: true })}
            title={lastErr ? `${syncLabel} — ${lastErr}` : syncLabel}
            aria-label={lastErr ? `${syncLabel} — ${lastErr}` : syncLabel}
          >
            <span className="mesa-sync-dot" aria-hidden />
            <span className="zk-dash-sync-text">{syncLabel}</span>
          </button>
          <button
            type="button"
            className="zk-dash-icon-btn"
            title={t.notifications}
            onClick={() => {
              setNotesOpen((v) => !v)
              setProfileOpen(false)
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9Z" />
              <path d="M10 20a2 2 0 0 0 4 0" />
            </svg>
            {alertCount > 0 ? <em className="zk-dash-note-badge">{alertCount}</em> : null}
          </button>
          {notesOpen ? (
            <div className="zk-dash-note-pop">
              <Link to="/kitchen" onClick={() => setNotesOpen(false)}>
                {t.kotWaiting} · {kitchenQueue}
              </Link>
              <Link to="/dine-in" onClick={() => setNotesOpen(false)}>
                {t.billingTables} · {billing.length}
              </Link>
              {alertCount === 0 ? <p>{t.noAlerts}</p> : null}
            </div>
          ) : null}
          <LangSwitch />
          <div className="zk-dash-profile">
            <button
              type="button"
              className="zk-dash-profile-btn"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((v) => !v)
                setNotesOpen(false)
              }}
            >
              <em>{user.initials}</em>
              <span>
                <strong>{user.name}</strong>
                <small>{user.roleLabel}</small>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {profileOpen ? (
              <div className="zk-dash-profile-menu" role="menu">
                <p className="zk-dash-profile-meta">
                  <strong>{user.name}</strong>
                  <span>{user.roleLabel}</span>
                </p>
                <button
                  type="button"
                  role="menuitem"
                  className="zk-dash-profile-logout"
                  onClick={() => {
                    logout()
                    navigate('/', { replace: true })
                  }}
                >
                  {t.logout}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
