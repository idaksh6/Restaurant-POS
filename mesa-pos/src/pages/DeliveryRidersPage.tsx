import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubAddButton, HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import MesaSelect from '../components/MesaSelect'
import Req from '../components/Req'
import { getActiveBranchId } from '../data/company'
import { starterRidersForBranch, type DeliveryRider } from '../data/deliveryRiders'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'

const blank = (sort: number): DeliveryRider => ({
  id: `rider-${Date.now()}`,
  branchId: getActiveBranchId(),
  name: '',
  phone: '',
  active: true,
  sort,
})

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export default function DeliveryRidersPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const { deliveryRiders: rows, saveDeliveryRider, deleteDeliveryRider } = useCatalog()
  const [editing, setEditing] = useState<DeliveryRider | null>(null)
  const [isNew, setIsNew] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  function startNew() {
    setIsNew(true)
    setEditing(blank(Math.max(0, ...rows.map((r) => r.sort ?? 0)) + 1))
  }

  function loadStarter() {
    const starters = starterRidersForBranch()
    let added = 0
    for (const row of starters) {
      if (rows.some((r) => r.id === row.id)) continue
      saveDeliveryRider(row)
      added += 1
    }
    flash(added ? `Added ${added} starter rider(s)` : 'Starter riders already loaded')
  }

  function save() {
    if (!editing?.name.trim()) {
      flash('Rider name is required')
      return
    }
    const row: DeliveryRider = {
      ...editing,
      branchId: editing.branchId ?? getActiveBranchId(),
      name: editing.name.trim(),
      phone: editing.phone.trim(),
    }
    saveDeliveryRider(row)
    setEditing(null)
    setIsNew(false)
    flash(isNew ? 'Rider created' : 'Rider updated')
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deleteDeliveryRider(editing.id)
        setEditing(null)
        flash('Rider deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Locked</strong>
          <Link to="/settings" className="btn btn-ghost" style={{ marginTop: '1rem' }}>
            Back
          </Link>
        </div>
      </div>
    )
  }

  const sorted = [...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))

  return (
    <div className="zk-riders">
      <HubHeader closeTo="/settings" />

      <div className="zk-riders-bar">
        <h1>Delivery riders</h1>
        <div className="zk-riders-bar-actions">
          {rows.length === 0 ? (
            <button type="button" className="zk-riders-starter" onClick={loadStarter}>
              Load starters
            </button>
          ) : null}
          <HubAddButton onClick={startNew} title="Add rider" />
        </div>
      </div>

      <div className="zk-riders-body">
        <div className="zk-riders-list">
          {sorted.length === 0 ? (
            <div className="zk-riders-empty">
              <strong>No riders for this branch</strong>
              <span>Tap + or load starter names for this outlet</span>
            </div>
          ) : (
            sorted.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`zk-rider-card${editing?.id === r.id ? ' selected' : ''}${r.active ? '' : ' off'}`}
                onClick={() => {
                  setIsNew(false)
                  setEditing({ ...r })
                }}
              >
                <span className="zk-rider-avatar" aria-hidden>
                  {initials(r.name)}
                </span>
                <span className="zk-rider-copy">
                  <strong>{r.name}</strong>
                  <small>{r.phone || 'No phone'}</small>
                </span>
                <span className={`zk-rider-badge${r.active ? '' : ' off'}`}>
                  {r.active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))
          )}
        </div>

        <section className={`zk-riders-panel${editing ? ' open' : ''}`}>
          {editing ? (
            <>
              <div className="zk-riders-panel-head">
                <span className="zk-rider-avatar lg" aria-hidden>
                  {initials(editing.name || 'New')}
                </span>
                <div>
                  <p className="zk-riders-kicker">{isNew ? 'New rider' : 'Edit rider'}</p>
                  <h2>{editing.name.trim() || 'Untitled rider'}</h2>
                </div>
              </div>
              <label>
                Name <Req />
                <input
                  className="search"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Arun"
                  autoFocus
                />
              </label>
              <label>
                Phone
                <input
                  className="search"
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder="+966 5X XXX XXXX"
                />
              </label>
              <label className="zk-riders-status">
                Status
                <MesaSelect
                  value={editing.active ? 'active' : 'inactive'}
                  onChange={(v) => setEditing({ ...editing, active: v === 'active' })}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </label>
              <div className="zk-riders-actions">
                <button type="button" className="zk-riders-action primary" onClick={save}>
                  Save
                </button>
                {!isNew ? (
                  <button type="button" className="zk-riders-action danger" onClick={remove}>
                    Delete
                  </button>
                ) : null}
                <button
                  type="button"
                  className="zk-riders-action"
                  onClick={() => {
                    setEditing(null)
                    setIsNew(false)
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="zk-riders-empty panel">
              <strong>Select a rider</strong>
              <span>Or tap + to add one for this branch</span>
            </div>
          )}
        </section>
      </div>

      <HubFooter backTo="/delivery" backLabel="Delivery" />
      {deleteConfirmDialog}
    </div>
  )
}
