import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import MesaSelect from '../components/MesaSelect'
import {
  LOCATION_TYPE_LABELS,
  loadStockLocations,
  locationHasStock,
  nextLocationSortOrder,
  saveStockLocations,
  slugLocationId,
  type StockLocation,
  type StockLocationType,
} from '../data/stockLocations'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'

const TYPE_OPTIONS: { value: StockLocationType; label: string }[] = (
  Object.entries(LOCATION_TYPE_LABELS) as [StockLocationType, string][]
).map(([value, label]) => ({ value, label }))

function emptyRow(rows: StockLocation[]): StockLocation {
  return {
    id: slugLocationId('new location', rows),
    label: '',
    hint: '',
    type: 'station',
    active: true,
    sortOrder: nextLocationSortOrder(rows),
  }
}

export default function StorageLocationsMasterPage() {
  const { user } = useAuth()
  const { flash, stock } = usePos()
  const { t } = useI18n()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const [rows, setRows] = useState<StockLocation[]>(() => loadStockLocations())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<StockLocation | null>(null)
  const [isNew, setIsNew] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (!q) return true
      return (
        r.label.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.hint ?? '').toLowerCase().includes(q) ||
        LOCATION_TYPE_LABELS[r.type].toLowerCase().includes(q)
      )
    })
  }, [rows, query])

  function persist(next: StockLocation[]) {
    saveStockLocations(next)
    setRows(loadStockLocations())
  }

  function startAdd() {
    setIsNew(true)
    setEditing(emptyRow(rows))
  }

  function startEdit(row: StockLocation) {
    setIsNew(false)
    setEditing({ ...row })
  }

  function save() {
    if (!editing) return
    const label = editing.label.trim()
    if (!label) {
      flash('Location name is required', 'err')
      return
    }
    const id = isNew ? slugLocationId(label, rows) : editing.id.trim()
    if (rows.some((r) => r.label.toLowerCase() === label.toLowerCase() && r.id !== id)) {
      flash('Location name already exists', 'err')
      return
    }
    const doc: StockLocation = {
      ...editing,
      id,
      label,
      hint: editing.hint?.trim() || undefined,
      sortOrder: Number(editing.sortOrder) || nextLocationSortOrder(rows),
    }
    persist([doc, ...rows.filter((r) => r.id !== id)])
    setEditing(null)
    flash(isNew ? `Location “${label}” added` : `Location “${label}” saved`)
  }

  function remove() {
    if (!editing || isNew) return
    if (locationHasStock(stock, editing.id)) {
      flash('Move or adjust stock out of this location before deleting', 'err')
      return
    }
    askDelete({
      name: editing.label,
      onConfirm: () => {
        persist(rows.filter((r) => r.id !== editing.id))
        setEditing(null)
        flash('Location deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Storage locations locked</strong>
          <div style={{ marginTop: '1rem' }}>
            <Link to={settingsHubPath('inventory')} className="btn btn-ghost">
              Back
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-ing">
      <HubHeader closeTo={settingsHubPath('inventory')} />

      <div className="zk-ing-bar">
        <div className="zk-ing-bar-text">
          <h1>{t.setStorageLocations}</h1>
          <p>{t.setStorageLocationsHint}</p>
        </div>
        <div className="zk-ing-bar-actions">
          <label className="zk-ing-search">
            <span className="sr-only">Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, type…"
              aria-label="Search storage locations"
            />
          </label>
          <button type="button" className="zk-ing-add" onClick={startAdd} title="Add location">
            +
          </button>
        </div>
      </div>

      <div className="zk-ing-body">
        {filtered.length === 0 ? (
          <div className="zk-ing-empty">
            <strong>{rows.length ? 'No matches' : 'No locations yet'}</strong>
            <span>
              {rows.length
                ? 'Try another search.'
                : 'Define walk-in, dry store, bar, kitchen, and pastry areas.'}
            </span>
            {!rows.length ? (
              <button type="button" className="btn btn-teal" onClick={startAdd}>
                Add location
              </button>
            ) : null}
          </div>
        ) : (
          <div className="zk-mst-panel">
            <div className="zk-mst-panel-head">
              <strong>{filtered.length} storage location{filtered.length === 1 ? '' : 's'}</strong>
              <em>Tap a row to edit · used in sub-location transfers</em>
            </div>
            <div className="zk-mst-table-wrap">
              <table className="zk-mst-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Location</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {[...filtered]
                    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                    .map((row) => (
                      <tr
                        key={row.id}
                        className={row.active ? '' : 'off'}
                        onClick={() => startEdit(row)}
                      >
                        <td className="mesa-ltr-nums">
                          <span className="zk-mst-order">{row.sortOrder}</span>
                        </td>
                        <td className="name-cell">
                          <strong>{row.label}</strong>
                          {row.hint ? <small>{row.hint}</small> : null}
                        </td>
                        <td>
                          <span className={`zk-mst-type ${row.type}`}>
                            {LOCATION_TYPE_LABELS[row.type]}
                          </span>
                        </td>
                        <td>
                          <span className={`zk-mst-status ${row.active ? 'on' : 'off'}`}>
                            {row.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="zk-mst-edit"
                            onClick={(e) => {
                              e.stopPropagation()
                              startEdit(row)
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <HubFooter backTo={settingsHubPath('inventory')} backLabel={t.inventory} />

      {editing ? (
        <div className="zk-ing-modal" role="dialog" aria-modal="true">
          <div className="zk-ing-sheet">
            <div className="zk-ing-sheet-head">
              <h2>{isNew ? 'New storage location' : 'Edit storage location'}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>

            <div className="zk-ing-form">
              <label>
                <span>
                  Name <Req />
                </span>
                <input
                  className="search"
                  autoFocus
                  value={editing.label}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  placeholder="Walk-in refrigerator"
                />
              </label>
              <label>
                <span>Hint (optional)</span>
                <input
                  className="search"
                  value={editing.hint ?? ''}
                  onChange={(e) => setEditing({ ...editing, hint: e.target.value })}
                  placeholder="Main cold room"
                />
              </label>
              <label>
                <span>Type</span>
                <MesaSelect
                  value={editing.type}
                  onChange={(v) => setEditing({ ...editing, type: v as StockLocationType })}
                  options={TYPE_OPTIONS}
                />
              </label>
              <label>
                <span>Sort order</span>
                <input
                  className="search mesa-ltr-nums"
                  type="number"
                  min={0}
                  step={10}
                  value={editing.sortOrder}
                  onChange={(e) =>
                    setEditing({ ...editing, sortOrder: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label>
                <span>Status</span>
                <MesaSelect
                  value={editing.active ? 'active' : 'inactive'}
                  onChange={(v) => setEditing({ ...editing, active: v === 'active' })}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </label>
              {!isNew ? (
                <p className="zk-ing-form-note">
                  Internal ID: <code>{editing.id}</code> — used for stock balances and sync.
                </p>
              ) : null}
            </div>

            <div className="zk-ing-actions">
              <button type="button" className="zk-ing-action" onClick={() => setEditing(null)}>
                Cancel
              </button>
              {!isNew ? (
                <button type="button" className="zk-ing-action danger" onClick={remove}>
                  Delete
                </button>
              ) : null}
              <button type="button" className="zk-ing-action primary" onClick={save}>
                {isNew ? 'Save' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteConfirmDialog}
    </div>
  )
}
