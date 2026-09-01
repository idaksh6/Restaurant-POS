import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { apiDownloadServerBackup, apiServerBackupReady } from '../lib/apiBackup'
import {
  buildFullBackup,
  downloadText,
  restoreFullBackup,
} from '../lib/dataTransfer'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'

export default function DatabaseBackupPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  function downloadLocalBackup() {
    const data = buildFullBackup()
    downloadText(
      `mesa-local-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    )
    flash('Local backup downloaded')
    setNote('Local JSON backup saved (this browser only).')
  }

  async function downloadServerBackup() {
    if (!apiServerBackupReady()) {
      flash('Connect to the API and stay online to download a server backup')
      return
    }
    setBusy(true)
    try {
      const data = await apiDownloadServerBackup()
      const branches = Array.isArray(data.branchData) ? data.branchData.length : 0
      flash('Server backup downloaded')
      setNote(
        `Server backup saved (${branches} branch${branches === 1 ? '' : 'es'}). Includes masters, catalog, stock, ledger, and open tickets from Postgres.`,
      )
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Server backup failed')
    } finally {
      setBusy(false)
    }
  }

  function onRestoreFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Record<string, unknown>
        if (parsed.source === 'mesa-api') {
          flash('Server backup restore is not supported here — use local backup files only')
          setNote(
            'This file is a server export. Restoring it into the browser is not supported yet; keep it as an archive or ask for a server restore tool.',
          )
          return
        }
        const n = restoreFullBackup(parsed)
        flash(`Restored ${n} stores — reload the app`)
        setNote(`Local restore complete (${n} keys). Reload the page to apply.`)
      } catch {
        flash('Invalid backup file')
      }
    }
    reader.readAsText(file)
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Locked</strong>
          <Link to={settingsHubPath('database')} className="btn btn-ghost" style={{ marginTop: '1rem' }}>
            Back
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-db zk-db-io">
      <HubHeader closeTo={settingsHubPath('database')} />

      <div className="zk-db-io-stage">
        <div className="zk-db-io-card">
          <header className="zk-db-io-head">
            <div>
              <p className="zk-db-io-kicker">Database</p>
              <h1>Backup</h1>
            </div>
            <p>
              Download a JSON archive from the server database, or from this browser. Local restore
              only applies to local backups.
            </p>
          </header>

          <div className="zk-db-io-actions zk-db-io-actions-stack">
            <button
              type="button"
              className="zk-db-primary-btn"
              disabled={busy}
              onClick={() => void downloadServerBackup()}
            >
              {busy ? 'Downloading…' : 'Download server backup'}
            </button>
            <button type="button" className="zk-db-secondary-btn" onClick={downloadLocalBackup}>
              Download local backup
            </button>
          </div>

          <div className="zk-db-restore" style={{ marginTop: '1rem' }}>
            <label>
              Restore local backup JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => onRestoreFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {note ? <p className="zk-db-note">{note}</p> : null}
        </div>
      </div>

      <HubFooter backTo={settingsHubPath('database')} backLabel={t.database} />
    </div>
  )
}
