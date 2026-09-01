import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { clearDemoStorage } from '../lib/dataTransfer'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'

export default function DatabaseCleanPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const [note, setNote] = useState('')

  function runClean() {
    askDelete({
      message: 'Clear local masters and caches from this browser? You can restore from a backup JSON.',
      confirmLabel: 'Clear',
      onConfirm: () => {
        const cleared = clearDemoStorage()
        flash(`Cleared ${cleared.length} stores — reload the app`)
        setNote(`Cleared: ${cleared.join(', ') || 'nothing'}. Reload the page to reseed defaults.`)
      },
    })
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
              <h1>Data Cleaning</h1>
            </div>
            <p>
              Remove local POS data stored in this browser only. This does not delete the server
              database. Download a backup first if you need to keep anything.
            </p>
          </header>

          <div className="zk-db-io-actions">
            <button type="button" className="zk-db-primary-btn" onClick={runClean}>
              Clear local data
            </button>
          </div>

          {note ? <p className="zk-db-note">{note}</p> : null}
        </div>
      </div>

      <HubFooter backTo={settingsHubPath('database')} backLabel={t.database} />
      {deleteConfirmDialog}
    </div>
  )
}
