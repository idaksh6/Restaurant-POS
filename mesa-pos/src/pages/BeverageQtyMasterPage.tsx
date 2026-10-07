import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubAddButton, HubFooter, HubHeader } from '../components/HubChrome'
import SuccessModal from '../components/SuccessModal'
import MesaSelect from '../components/MesaSelect'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { settingsHubPath } from '../lib/settingsHub'
import {
  applyBeverageSizesToDish,
  isBeverageDish,
  listBeverageTargets,
  qtyLabel,
  starterBeverageQtys,
  type BeverageQty,
} from '../data/beverages'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'

const blank = (sort: number): BeverageQty => ({
  id: `bev-qty-${Date.now()}`,
  code: '',
  name: '',
  ml: 0,
  sort,
  active: true,
  isDefault: false,
})

export default function BeverageQtyMasterPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { dishes, categories, saveDishes } = useMasters()
  const {
    beverageQtys: rows,
    beveragePrices,
    saveBeverageQty,
    deleteBeverageQty,
  } = useCatalog()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const [editing, setEditing] = useState<BeverageQty | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [scope, setScope] = useState<'drinks' | 'all'>('drinks')
  const [departmentId, setDepartmentId] = useState('')
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name),
      ),
    [rows],
  )

  const drinkCount = useMemo(
    () => dishes.filter((d) => d.active && isBeverageDish(d, categories)).length,
    [dishes, categories],
  )

  const targets = useMemo(
    () => listBeverageTargets(dishes, categories, { scope, departmentId }),
    [dishes, categories, scope, departmentId],
  )

  const mainDepartments = useMemo(
    () =>
      categories
        .filter((c) => c.active && !c.parentId)
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name)),
    [categories],
  )

  function startAdd() {
    setIsNew(true)
    setEditing(blank(Math.max(0, ...rows.map((r) => r.sort ?? 0)) + 1))
  }

  function startEdit(row: BeverageQty) {
    setIsNew(false)
    setEditing({ ...row })
  }

  function loadStarters() {
    let added = 0
    for (const row of starterBeverageQtys()) {
      if (rows.some((r) => r.id === row.id || r.name.toLowerCase() === row.name.toLowerCase())) {
        continue
      }
      saveBeverageQty(row)
      added += 1
    }
    flash(added ? `Added ${added} serving size(s)` : 'Starter sizes already loaded')
  }

  function saveForm() {
    if (!editing) return
    if (!editing.name.trim()) {
      flash('Size name is required')
      return
    }
    const { branchId: _drop, ...rest } = editing
    saveBeverageQty({
      ...rest,
      name: editing.name.trim(),
      code: editing.code.trim().toUpperCase(),
      ml: Math.max(0, Number(editing.ml) || 0),
    })
    setEditing(null)
    setIsNew(false)
    setSuccessOpen(true)
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deleteBeverageQty(editing.id)
        setEditing(null)
        flash('Serving size deleted')
      },
    })
  }

  async function applyToTargets() {
    const activeQtys = sorted.filter((q) => q.active)
    if (!activeQtys.length) {
      flash('Add at least one active size first')
      return
    }
    if (!targets.length) {
      flash(
        scope === 'drinks'
          ? 'No drinks found — switch to All products, or tag a department as Bar / name it Beverages'
          : 'No products match this filter',
      )
      return
    }
    const next = targets.map((d) => applyBeverageSizesToDish(d, activeQtys, beveragePrices))
    const n = await saveDishes(next)
    flash(`Applied sizes to ${n} item(s)`)
    setSuccessOpen(true)
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Beverages Quantity locked</strong>
          <div style={{ marginTop: '1rem' }}>
            <Link to="/settings?tab=products" className="btn btn-ghost">
              Back to Catalog
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-tax zk-bev">
      <HubHeader closeTo={settingsHubPath('products')} />
      {deleteConfirmDialog}

      <div className="zk-tax-bar">
        <h1>Beverages Quantity</h1>
        <HubAddButton title="Add size" className="zk-tax-add" onClick={startAdd} />
      </div>

      <div className="zk-tax-body">
        <section className="zk-tax-hero">
          <div className="zk-tax-hero-copy">
            <p className="zk-tax-kicker">Serving sizes</p>
            <h2>Define drink quantities</h2>
            <p>
              Small / Regular / Large (with ml). Set prices in{' '}
              <Link to="/settings/beverages/prices">Beverages Price Master</Link>, then apply sizes to
              menu items so POS shows size options.
            </p>
          </div>
          <div className="zk-tax-hero-meta">
            <span className="zk-tax-pill">Loyalty &amp; drinks</span>
            <div className="zk-tax-stats">
              <div>
                <span>Sizes</span>
                <strong>{rows.length}</strong>
              </div>
              <div>
                <span>Active</span>
                <strong>{rows.filter((r) => r.active).length}</strong>
              </div>
              <div>
                <span>Drinks</span>
                <strong>{drinkCount}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="zk-tax-list-card">
          <div className="zk-tax-list-head">
            <div>
              <h3>Quantity list</h3>
              <p>
                Apply target: <strong>{targets.length}</strong> product
                {targets.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="zk-tax-list-tools zk-bev-tools">
              <div className="zk-bev-scope" role="group" aria-label="Apply scope">
                <button
                  type="button"
                  className={`zk-tax-tool${scope === 'drinks' ? ' on' : ''}`}
                  onClick={() => setScope('drinks')}
                >
                  Drinks
                </button>
                <button
                  type="button"
                  className={`zk-tax-tool${scope === 'all' ? ' on' : ''}`}
                  onClick={() => setScope('all')}
                >
                  All products
                </button>
              </div>
              <MesaSelect
                aria-label="Department filter"
                value={departmentId}
                onChange={setDepartmentId}
                options={[
                  { value: '', label: 'All departments' },
                  ...mainDepartments.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <button type="button" className="zk-tax-tool" onClick={loadStarters}>
                Load starters
              </button>
              <button type="button" className="zk-tax-tool" onClick={() => void applyToTargets()}>
                Apply to {targets.length} products
              </button>
            </div>
          </div>

          {drinkCount === 0 && scope === 'drinks' ? (
            <div className="zk-bev-hint">
              No products matched as drinks yet. Use <strong>All products</strong>, filter a
              department, or mark a department as <strong>Bar</strong> / name it Beverages in
              Departments.
            </div>
          ) : null}

          {sorted.length === 0 ? (
            <div className="zk-tax-empty">
              <strong>No serving sizes yet</strong>
              <p>Add Small / Regular / Large, or load starter sizes.</p>
              <button type="button" className="zk-vendors-action primary" onClick={loadStarters}>
                Load starter sizes
              </button>
            </div>
          ) : (
            <ul className="zk-tax-grid">
              {sorted.map((q) => (
                <li key={q.id}>
                  <article className={`zk-tax-rate${q.active ? ' on' : ''}${q.isDefault ? ' def' : ''}`}>
                    <button type="button" className="zk-tax-rate-main" onClick={() => startEdit(q)}>
                      <span className="zk-tax-rate-pct" aria-hidden>
                        {q.ml > 0 ? (
                          <>
                            {q.ml}
                            <small>ml</small>
                          </>
                        ) : (
                          q.code || '—'
                        )}
                      </span>
                      <span className="zk-tax-rate-copy">
                        <strong>{qtyLabel(q)}</strong>
                        <span className="zk-tax-rate-badges">
                          {q.isDefault ? <span className="zk-tax-badge def">Default</span> : null}
                          {q.active ? (
                            <span className="zk-tax-badge on">Active</span>
                          ) : (
                            <span className="zk-tax-badge">Off</span>
                          )}
                        </span>
                      </span>
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing ? (
        <div className="zk-vendors-modal" role="dialog" aria-modal="true">
          <div className="zk-tax-sheet zk-bev-sheet">
            <div className="zk-vendors-sheet-head">
              <div>
                <p className="zk-tax-kicker">{isNew ? 'New size' : 'Edit size'}</p>
                <h2>{isNew ? 'Add serving size' : editing.name.trim() || 'Serving size'}</h2>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="zk-tax-form">
              <div className="zk-tax-form-grid">
                <label>
                  <span>
                    Name <Req />
                  </span>
                  <input
                    className="search"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Regular"
                    autoFocus
                  />
                </label>
                <label>
                  <span>Code</span>
                  <input
                    className="search"
                    value={editing.code}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                    placeholder="R"
                  />
                </label>
                <label>
                  <span>Volume (ml)</span>
                  <input
                    className="search"
                    type="number"
                    min={0}
                    value={editing.ml || ''}
                    onChange={(e) => setEditing({ ...editing, ml: Number(e.target.value) || 0 })}
                    placeholder="350"
                  />
                </label>
                <label>
                  <span>Sort</span>
                  <input
                    className="search"
                    type="number"
                    value={editing.sort}
                    onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
              <div className="zk-tax-form-flags">
                <label className="zk-tax-check">
                  <input
                    type="checkbox"
                    checked={editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  />
                  <span>
                    <strong>Active</strong>
                    <small>Shown in Price Master and on POS size options</small>
                  </span>
                </label>
                <label className="zk-tax-check">
                  <input
                    type="checkbox"
                    checked={!!editing.isDefault}
                    onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
                  />
                  <span>
                    <strong>Default size</strong>
                    <small>Used as the base menu price for drinks</small>
                  </span>
                </label>
              </div>
            </div>
            <div className="zk-vendors-actions">
              <button type="button" className="zk-vendors-action" onClick={() => setEditing(null)}>
                Cancel
              </button>
              {!isNew ? (
                <button type="button" className="zk-vendors-action danger" onClick={remove}>
                  Delete
                </button>
              ) : null}
              <button type="button" className="zk-vendors-action primary" onClick={saveForm}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {successOpen ? (
        <SuccessModal
          title="Saved"
          message="Beverage quantity master updated."
          onClose={() => setSuccessOpen(false)}
        />
      ) : null}
      <HubFooter />
    </div>
  )
}
