import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { settingsHubPath } from '../lib/settingsHub'
import {
  listLocalZatcaInvoices,
  queueZatcaPhase2,
  type ZatcaInvoice,
  type ZatcaPhase2Status,
} from '../hardware/zatca'
import { apiListZatcaInvoices, apiZatcaReady } from '../lib/apiZatca'
import { money } from '../data/mock'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'

type Filter = 'attention' | 'all'

function statusLabel(status?: ZatcaPhase2Status) {
  switch (status) {
    case 'failed':
      return 'Failed'
    case 'pending':
      return 'Pending'
    case 'queued':
      return 'Queued'
    case 'sandbox':
      return 'Sandbox'
    case 'reported':
      return 'Reported'
    default:
      return 'Local'
  }
}

function needsAttention(status?: ZatcaPhase2Status) {
  return status === 'failed' || status === 'pending' || status === 'queued'
}

/** Short, client-facing summary; keep raw text for expand. */
function friendlyError(raw?: string): { title: string; detail?: string } {
  if (!raw?.trim()) return { title: '' }
  const msg = raw.trim()
  const lower = msg.toLowerCase()

  if (lower.includes('complete fatoora onboarding') || lower.includes('generate csid')) {
    return {
      title: 'Fatoora onboarding incomplete',
      detail: 'Open ZATCA settings → enter OTP → Generate CSID, then retry.',
    }
  }
  if (lower.includes('certificate-permissions') || lower.includes('vat number')) {
    return {
      title: 'VAT number does not match the Fatoora certificate',
      detail: 'Company VAT in Isarva must match the VAT on the Fatoora CSID certificate.',
    }
  }
  if (lower.includes('signed-properties') || lower.includes('hashing')) {
    return {
      title: 'Invoice signature hashing failed',
      detail: 'Usually fixed after regenerating CSID or updating credentials, then retry.',
    }
  }
  if (lower.includes('queued offline') || lower.includes('queued for sync')) {
    return { title: 'Waiting to sync', detail: msg }
  }
  if (msg.length > 140) {
    return { title: msg.slice(0, 120).trimEnd() + '…', detail: msg }
  }
  return { title: msg }
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function ZatcaInvoicesPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { runSync } = useSync()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const [local, setLocal] = useState(() => listLocalZatcaInvoices())
  const [remoteNote, setRemoteNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('attention')
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo(() => {
    const order = ['failed', 'pending', 'queued', 'sandbox', 'reported', 'local']
    return [...local].sort((a, b) => {
      const sa = order.indexOf(a.phase2Status ?? 'local')
      const sb = order.indexOf(b.phase2Status ?? 'local')
      if (sa !== sb) return sa - sb
      return String(b.timestamp).localeCompare(String(a.timestamp))
    })
  }, [local])

  const attention = rows.filter((r) => needsAttention(r.phase2Status))
  const visible = filter === 'attention' ? attention : rows

  function refresh() {
    setLocal(listLocalZatcaInvoices())
  }

  async function pullRemote() {
    if (!apiZatcaReady()) {
      flash('Sign in online to load server invoices', 'err')
      return
    }
    try {
      const remote = await apiListZatcaInvoices(50)
      setRemoteNote(`Server: ${remote.length} invoice(s)`)
      flash(`Loaded ${remote.length} from server`)
    } catch {
      flash('Could not load ZATCA invoices from server', 'err')
    }
  }

  async function retry(row: ZatcaInvoice) {
    setBusy(row.invoiceUuid)
    try {
      queueZatcaPhase2(row)
      await runSync({ force: true, quiet: true })
      refresh()
      flash(`Queued retry · ${row.invoiceUuid.slice(0, 8)}…`)
    } finally {
      setBusy(null)
    }
  }

  if (!canAccess) {
    return (
      <div className="zk-db zk-db-io">
        <HubHeader closeTo={settingsHubPath('settings')} />
        <div className="ticket-empty">
          <strong>Locked</strong>
          <Link to={settingsHubPath('settings')} className="btn btn-ghost" style={{ marginTop: '1rem' }}>
            Back
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-db zk-db-io zk-zatca-q">
      <HubHeader closeTo={settingsHubPath('settings')} />
      <div className="zk-db-io-stage zk-zatca-q-stage">
        <div className="zk-zatca-q-card">
          <header className="zk-zatca-q-head">
            <div className="zk-zatca-q-head-copy">
              <p className="zk-zatca-q-kicker">ZATCA · Phase 2</p>
              <h1>E-invoice queue</h1>
              <p>
                Invoices report to Fatoora after settle — not at day close. Failed or pending rows
                can be retried here. Settle is never blocked.
              </p>
            </div>
            <div className="zk-zatca-q-stats" aria-label="Queue summary">
              <div className={`zk-zatca-q-stat${attention.length ? ' warn' : ' ok'}`}>
                <strong>{attention.length}</strong>
                <span>Need attention</span>
              </div>
              <div className="zk-zatca-q-stat">
                <strong>{rows.length}</strong>
                <span>Local total</span>
              </div>
            </div>
          </header>

          <div className="zk-zatca-q-toolbar">
            <div className="zk-zatca-q-filters" role="tablist" aria-label="Filter invoices">
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'attention'}
                className={filter === 'attention' ? 'active' : undefined}
                onClick={() => setFilter('attention')}
              >
                Need attention
                {attention.length ? <em>{attention.length}</em> : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
                className={filter === 'all' ? 'active' : undefined}
                onClick={() => setFilter('all')}
              >
                All
                <em>{rows.length}</em>
              </button>
            </div>
            <div className="zk-zatca-q-actions">
              <button type="button" className="zk-zatca-q-btn" onClick={refresh}>
                Refresh
              </button>
              <button type="button" className="zk-zatca-q-btn" onClick={() => void pullRemote()}>
                Check server
              </button>
              <Link to="/settings/company?focus=zatca" className="zk-zatca-q-btn">
                ZATCA settings
              </Link>
            </div>
          </div>

          {remoteNote ? <p className="zk-zatca-q-note">{remoteNote}</p> : null}

          {!rows.length ? (
            <div className="zk-zatca-q-empty">
              <strong>No local ZATCA invoices yet</strong>
              <span>Settle a bill with tax enabled to create the first e-invoice.</span>
            </div>
          ) : !visible.length ? (
            <div className="zk-zatca-q-empty ok">
              <strong>Nothing needs attention</strong>
              <span>All local Phase 2 submissions look clear. Switch to All to browse history.</span>
            </div>
          ) : (
            <ul className="zk-zatca-q-list">
              {visible.map((row) => {
                const status = row.phase2Status ?? 'local'
                const err = friendlyError(row.phase2Message)
                const open = expanded === row.invoiceUuid
                const canRetry = needsAttention(status)
                return (
                  <li key={row.invoiceUuid} className={`zk-zatca-q-row status-${status}`}>
                    <div className="zk-zatca-q-row-main">
                      <div className="zk-zatca-q-row-top">
                        <span className={`zk-zatca-q-badge status-${status}`}>
                          {statusLabel(status)}
                        </span>
                        <strong className="zk-zatca-q-amount">{money(row.totalSar)}</strong>
                      </div>
                      <div className="zk-zatca-q-meta">
                        <span>{formatWhen(row.timestamp)}</span>
                        <span>VAT {money(row.vatSar)}</span>
                        <span title={row.invoiceUuid}>{row.invoiceUuid.slice(0, 18)}…</span>
                      </div>
                      {err.title ? (
                        <div className="zk-zatca-q-err">
                          <p>{err.title}</p>
                          {err.detail ? (
                            <>
                              <button
                                type="button"
                                className="zk-zatca-q-err-toggle"
                                onClick={() =>
                                  setExpanded(open ? null : row.invoiceUuid)
                                }
                              >
                                {open ? 'Hide details' : 'Show details'}
                              </button>
                              {open ? <pre>{err.detail}</pre> : null}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {canRetry ? (
                      <button
                        type="button"
                        className="zk-zatca-q-retry"
                        disabled={busy === row.invoiceUuid}
                        onClick={() => void retry(row)}
                      >
                        {busy === row.invoiceUuid ? '…' : 'Retry'}
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      <HubFooter backTo={settingsHubPath('settings')} backLabel="Settings" />
    </div>
  )
}
