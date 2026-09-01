import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import MesaSelect from '../components/MesaSelect'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import {
  nextUnitCode,
  type MeasureUnit,
} from '../data/units'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'

function UnitGlyph({ kind }: { kind: MeasureUnit['kind'] }) {
  if (kind === 'weight') {
    return (
      <svg viewBox="0 0 48 48" fill="none">
        <path d="M24 8v6M14 18h20l-3 18H17L14 18Z" stroke="currentColor" strokeWidth="2.4" />
        <path d="M18 40h12" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="24" cy="14" r="2.5" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'volume') {
    return (
      <svg viewBox="0 0 48 48" fill="none">
        <path d="M20 8h8l2 10c3 4 3 12-2 16H20c-5-4-5-12-2-16l2-10Z" stroke="currentColor" strokeWidth="2.4" />
        <path d="M18 22h12" stroke="currentColor" strokeWidth="2.4" />
      </svg>
    )
  }
  if (kind === 'count') {
    return (
      <svg viewBox="0 0 48 48" fill="none">
        <rect x="10" y="12" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
        <rect x="26" y="12" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
        <rect x="18" y="28" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="2.4" />
      <path d="M24 16v16M16 24h16" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  )
}

const emptyForm = (code: string): MeasureUnit => ({
  id: `u-${Date.now()}`,
  code,
  name: '',
  quantity: 1,
  kind: 'generic',
})

export default function UnitsPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const { units, saveUnit, deleteUnit } = useCatalog()
  const [editing, setEditing] = useState<MeasureUnit | null>(null)
  const [isNew, setIsNew] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  function startAdd() {
    setIsNew(true)
    setEditing(emptyForm(nextUnitCode(units)))
  }

  function startEdit(unit: MeasureUnit) {
    setIsNew(false)
    setEditing({ ...unit })
  }

  function save() {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) {
      flash('Enter unit name')
      return
    }
    const row = { ...editing, name, quantity: Number(editing.quantity) || 1 }
    saveUnit(row)
    setEditing(null)
    flash(isNew ? `Unit “${name}” added` : `Unit “${name}” saved`)
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      message: 'All products with this unit will be deleted, click OK to continue',
      onConfirm: () => {
        deleteUnit(editing.id)
        setEditing(null)
        flash('Unit deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Units locked</strong>
          Only Admin can manage units.
          <div style={{ marginTop: '1rem' }}>
            <Link to="/settings" className="btn btn-ghost">
              Back to Settings
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-units">
      <HubHeader closeTo={settingsHubPath('products')} />

      <div className="zk-units-bar">
        <h1>Units</h1>
        <button type="button" className="zk-units-add" onClick={startAdd} title="Add unit">
          +
        </button>
      </div>

      <div className="zk-units-body">
        <div className="zk-units-grid">
          {units.map((unit) => (
            <button
              key={unit.id}
              type="button"
              className={`zk-unit-card kind-${unit.kind}${editing?.id === unit.id ? ' active' : ''}`}
              onClick={() => startEdit(unit)}
            >
              <span className="zk-unit-icon">
                <UnitGlyph kind={unit.kind} />
              </span>
              <strong>{unit.name}</strong>
              <small>
                ID {unit.code} · qty {unit.quantity}
              </small>
            </button>
          ))}
        </div>

        {units.length === 0 ? (
          <div className="zk-units-empty">
            <strong>No units yet</strong>
            <span>Tap + to create your first measurement unit.</span>
          </div>
        ) : null}
      </div>

      <HubFooter backTo={settingsHubPath('products')} backLabel={t.products} />

      {editing ? (
        <div className="zk-units-modal" role="dialog" aria-modal="true">
          <div className="zk-units-sheet">
            <div className="zk-units-sheet-head">
              <h2>{isNew ? 'Add unit' : 'Edit unit'}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>

            <div className="zk-units-sheet-body">
            <div className="zk-units-form">
              <label>
                <span>Unit ID</span>
                <input className="search" value={editing.code} readOnly />
              </label>
              <label>
                <span>
                  Unit name <Req />
                </span>
                <input
                  className="search"
                  autoFocus
                  value={editing.name}
                  placeholder="e.g. KG, PCS, Liter"
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label>
                <span>Quantity</span>
                <input
                  className="search"
                  type="number"
                  step="0.001"
                  value={editing.quantity}
                  onChange={(e) =>
                    setEditing({ ...editing, quantity: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label>
                <span>Type</span>
                <MesaSelect
                  value={editing.kind}
                  onChange={(v) =>
                    setEditing({
                      ...editing,
                      kind: v as MeasureUnit['kind'],
                    })
                  }
                  options={[
                    { value: 'generic', label: 'Generic' },
                    { value: 'count', label: 'Count (PCS)' },
                    { value: 'weight', label: 'Weight' },
                    { value: 'volume', label: 'Volume' },
                  ]}
                />
              </label>
            </div>
            </div>

            <div className="zk-units-actions">
              <button type="button" className="zk-units-action" onClick={() => setEditing(null)}>
                Cancel
              </button>
              {!isNew ? (
                <button type="button" className="zk-units-action danger" onClick={remove}>
                  Delete
                </button>
              ) : null}
              <button type="button" className="zk-units-action primary" onClick={save}>
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
