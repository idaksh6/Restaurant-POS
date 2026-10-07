import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubAddButton, HubFooter, HubHeader } from '../components/HubChrome'
import SuccessModal from '../components/SuccessModal'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { settingsHubPath } from '../lib/settingsHub'
import { money } from '../data/mock'
import {
  attachMasterGroup,
  starterAddonMasters,
  type AddonMasterGroup,
} from '../data/addonMasters'
import { getAddonGroups, type AddonOption, type ItemCustomizer, type MasterDish } from '../data/masters'
import { withSyncedBasePrice } from '../data/masters'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'

function blankAddon(): AddonOption {
  return { id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: '', price: 0 }
}

function blankGroup(sort: number): AddonMasterGroup {
  return {
    id: `am-${Date.now()}`,
    name: '',
    appendVariationName: false,
    min: 0,
    max: 4,
    addons: [blankAddon()],
    active: true,
    sort,
  }
}

function blankCustomizer(): ItemCustomizer {
  return {
    title: 'Choose options',
    variationLabel: 'Variation',
    variations: [{ id: `v-${Date.now()}`, name: 'Regular', price: 0 }],
    addonGroups: [],
  }
}

export default function AddonsMasterPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { addonMasters: rows, saveAddonMaster, deleteAddonMaster } = useCatalog()
  const { dishes, categories, saveDish } = useMasters()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const [editing, setEditing] = useState<AddonMasterGroup | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [attachFor, setAttachFor] = useState<AddonMasterGroup | null>(null)
  const [attachIds, setAttachIds] = useState<string[]>([])
  const [attachCategoryId, setAttachCategoryId] = useState('')
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const activeDishes = useMemo(
    () => dishes.filter((d) => d.active).sort((a, b) => a.name.localeCompare(b.name)),
    [dishes],
  )

  const attachCandidates = useMemo(() => {
    if (!attachCategoryId) return activeDishes
    return activeDishes.filter((d) => d.categoryId === attachCategoryId)
  }, [activeDishes, attachCategoryId])

  function openAttach(row: AddonMasterGroup) {
    setAttachFor(row)
    setAttachCategoryId('')
    setAttachIds([])
  }

  function toggleAttachDish(id: string) {
    setAttachIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function selectAllVisible() {
    setAttachIds(attachCandidates.map((d) => d.id))
  }

  async function runAttach() {
    if (!attachFor || !attachIds.length) {
      flash('Select at least one dish')
      return
    }
    let n = 0
    for (const id of attachIds) {
      const dish = dishes.find((d) => d.id === id)
      if (!dish) continue
      const base = dish.customizer ?? blankCustomizer()
      const groups = attachMasterGroup(getAddonGroups(base), attachFor)
      const next: MasterDish = withSyncedBasePrice({
        ...dish,
        customizer: {
          ...base,
          variations: base.variations?.length
            ? base.variations.map((v, i) =>
                i === 0 && !(v.price > 0) ? { ...v, price: dish.price } : v,
              )
            : [{ id: `v-${Date.now()}`, name: 'Regular', price: dish.price }],
          addonGroups: groups,
        },
      })
      await saveDish(next)
      n++
    }
    flash(`Attached “${attachFor.name}” to ${n} dish(es)`)
    setAttachFor(null)
    setAttachIds([])
  }

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name),
      ),
    [rows],
  )

  function closeEditor() {
    setEditing(null)
    setIsNew(false)
  }

  function startAdd() {
    setIsNew(true)
    setEditing(blankGroup(Math.max(0, ...rows.map((r) => r.sort ?? 0)) + 1))
  }

  function openEdit(row: AddonMasterGroup) {
    setIsNew(false)
    setEditing({
      ...row,
      addons: row.addons.map((a) => ({ ...a })),
    })
  }

  function loadStarters() {
    let added = 0
    for (const row of starterAddonMasters()) {
      if (rows.some((r) => r.id === row.id || r.name.toLowerCase() === row.name.toLowerCase())) {
        continue
      }
      saveAddonMaster(row)
      added += 1
    }
    if (added) {
      flash(`Added ${added} starter group(s)`)
      setSuccessOpen(true)
    } else {
      flash('Starter groups already loaded')
    }
  }

  function save() {
    if (!editing?.name.trim()) {
      flash('Group name is required')
      return
    }
    const addons = editing.addons
      .map((a) => ({
        ...a,
        name: a.name.trim(),
        price: Math.round((Number(a.price) || 0) * 100) / 100,
      }))
      .filter((a) => a.name)
    if (!addons.length) {
      flash('Add at least one addon option')
      return
    }
    const min = Math.max(0, Math.floor(Number(editing.min) || 0))
    const max = Math.max(min || 1, Math.floor(Number(editing.max) || 1))
    saveAddonMaster({
      ...editing,
      name: editing.name.trim(),
      min,
      max,
      addons,
    })
    closeEditor()
    flash(isNew ? 'Addon group added' : 'Addon group updated')
    setSuccessOpen(true)
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deleteAddonMaster(editing.id)
        closeEditor()
        flash('Addon group deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Addons locked</strong>
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
    <div className="zk-tax zk-bev zk-addons">
      <HubHeader closeTo={settingsHubPath('settings')} />
      {deleteConfirmDialog}

      <div className="zk-tax-bar">
        <h1>Addons</h1>
        <HubAddButton title="Add group" className="zk-tax-add" onClick={startAdd} />
      </div>

      <div className="zk-tax-body">
        <section className="zk-tax-hero">
          <div className="zk-tax-hero-copy">
            <p className="zk-tax-kicker">Shared toppings</p>
            <h2>Reusable addon groups</h2>
            <p>
              Build topping / sauce / extra groups once, then attach them to dishes in{' '}
              <Link to="/masters?tab=dishes">Menu Items</Link> or{' '}
              <Link to="/settings/menu-details">Products</Link> customizer.
            </p>
          </div>
          <div className="zk-tax-hero-meta">
            <span className="zk-tax-pill">Menu &amp; channels</span>
            <div className="zk-tax-stats">
              <div>
                <span>Groups</span>
                <strong>{rows.length}</strong>
              </div>
              <div>
                <span>Active</span>
                <strong>{rows.filter((r) => r.active).length}</strong>
              </div>
              <div>
                <span>Options</span>
                <strong>{rows.reduce((s, r) => s + r.addons.length, 0)}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="zk-tax-list-card">
          <div className="zk-tax-list-head">
            <div>
              <h3>Addon groups</h3>
              <p>Attached to dishes as a copy — re-attach to refresh from this master.</p>
            </div>
            <div className="zk-tax-list-tools zk-bev-tools">
              <button type="button" className="zk-tax-tool" onClick={loadStarters}>
                Load starters
              </button>
            </div>
          </div>

          {!sorted.length ? (
            <div className="zk-tax-empty">
              <strong>No addon groups yet</strong>
              <span>Add a group or load pizza / sauce starters.</span>
            </div>
          ) : (
            <ul className="zk-addons-grid">
              {sorted.map((g) => (
                <li key={g.id}>
                  <article className={`zk-addon-card${g.active ? ' on' : ''}`}>
                    <button
                      type="button"
                      className="zk-addon-card-main"
                      onClick={() => openEdit(g)}
                    >
                      <span className="zk-addon-card-count" aria-hidden>
                        {g.addons.length}
                      </span>
                      <span className="zk-addon-card-body">
                        <strong>{g.name}</strong>
                        <span className="zk-addon-card-badges">
                          {g.active ? (
                            <span className="zk-tax-badge on">Active</span>
                          ) : (
                            <span className="zk-tax-badge off">Off</span>
                          )}
                          <span className="zk-tax-badge">
                            min {g.min} · max {g.max}
                          </span>
                        </span>
                        <p className="zk-addon-card-opts">
                          {g.addons.map((a) => a.name).join(', ')}
                        </p>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="zk-addon-card-edit"
                      onClick={() => openAttach(g)}
                    >
                      Attach
                    </button>
                    <button
                      type="button"
                      className="zk-addon-card-edit"
                      onClick={() => openEdit(g)}
                    >
                      Edit
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
            <div className="section-head">
              <div>
                <p className="zk-tax-kicker">{isNew ? 'New group' : 'Edit group'}</p>
                <h2>{isNew ? 'Add addon group' : editing.name || 'Addon group'}</h2>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closeEditor}>
                Close
              </button>
            </div>

            <div className="zk-tax-form">
              <div className="zk-tax-form-grid">
                <label>
                  <span>
                    Group name
                    <Req />
                  </span>
                  <input
                    className="search"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="e.g. Pizza toppings"
                  />
                </label>
                <label>
                  <span>Sort</span>
                  <input
                    className="search"
                    type="number"
                    value={editing.sort ?? 0}
                    onChange={(e) =>
                      setEditing({ ...editing, sort: Number(e.target.value) || 0 })
                    }
                  />
                </label>
                <label>
                  <span>Min select</span>
                  <input
                    className="search"
                    type="number"
                    min={0}
                    value={editing.min}
                    onChange={(e) =>
                      setEditing({ ...editing, min: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </label>
                <label>
                  <span>Max select</span>
                  <input
                    className="search"
                    type="number"
                    min={1}
                    value={editing.max}
                    onChange={(e) =>
                      setEditing({ ...editing, max: Math.max(1, Number(e.target.value) || 1) })
                    }
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
                    Active
                    <small>Hidden groups cannot be attached from the picker</small>
                  </span>
                </label>
                <label className="zk-tax-check">
                  <input
                    type="checkbox"
                    checked={!!editing.appendVariationName}
                    onChange={(e) =>
                      setEditing({ ...editing, appendVariationName: e.target.checked })
                    }
                  />
                  <span>
                    Append size name
                    <small>e.g. “Pizza toppings Medium” in the POS customizer</small>
                  </span>
                </label>
              </div>

              <div className="mst-cz-section zk-addon-options">
                <div className="mst-cz-head">
                  <strong>Options</strong>
                  <button
                    type="button"
                    className="mst-btn ghost"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        addons: [...editing.addons, blankAddon()],
                      })
                    }
                  >
                    + Add option
                  </button>
                </div>
                {editing.addons.map((a, ai) => (
                  <div key={a.id} className="zk-addon-option-row">
                    <input
                      className="search"
                      value={a.name}
                      placeholder="Option name"
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          addons: editing.addons.map((row, i) =>
                            i === ai ? { ...row, name: e.target.value } : row,
                          ),
                        })
                      }
                    />
                    <input
                      className="search"
                      type="number"
                      min={0}
                      step={0.01}
                      value={a.price}
                      aria-label="Price"
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          addons: editing.addons.map((row, i) =>
                            i === ai
                              ? { ...row, price: Number(e.target.value) || 0 }
                              : row,
                          ),
                        })
                      }
                    />
                    <span className="mesa-ltr-nums muted">{money(a.price)}</span>
                    <button
                      type="button"
                      className="mst-btn ghost"
                      disabled={editing.addons.length <= 1}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          addons: editing.addons.filter((_, i) => i !== ai),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="zk-vendors-actions">
                {!isNew ? (
                  <button type="button" className="zk-vendors-action danger" onClick={remove}>
                    Delete
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" className="zk-vendors-action" onClick={closeEditor}>
                  Cancel
                </button>
                <button type="button" className="zk-vendors-action primary" onClick={save}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {attachFor ? (
        <div className="zk-vendors-modal" role="dialog" aria-modal="true">
          <div className="zk-tax-sheet zk-bev-sheet">
            <div className="section-head">
              <div>
                <p className="zk-tax-kicker">Attach to dishes</p>
                <h2>{attachFor.name}</h2>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setAttachFor(null)}>
                Close
              </button>
            </div>
            <div className="zk-tax-form">
              <label>
                <span>Filter by category</span>
                <select
                  className="search"
                  value={attachCategoryId}
                  onChange={(e) => {
                    setAttachCategoryId(e.target.value)
                    setAttachIds([])
                  }}
                >
                  <option value="">All categories</option>
                  {categories
                    .filter((c) => c.active)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="zk-tax-list-tools zk-bev-tools" style={{ margin: '0.5rem 0' }}>
                <button type="button" className="zk-tax-tool" onClick={selectAllVisible}>
                  Select all shown ({attachCandidates.length})
                </button>
                <button type="button" className="zk-tax-tool" onClick={() => setAttachIds([])}>
                  Clear
                </button>
              </div>
              <div style={{ maxHeight: 280, overflow: 'auto', display: 'grid', gap: 6 }}>
                {attachCandidates.map((d) => (
                  <label
                    key={d.id}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      padding: '0.45rem 0.55rem',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={attachIds.includes(d.id)}
                      onChange={() => toggleAttachDish(d.id)}
                    />
                    <span>
                      <strong>{d.name}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>
                        {d.code} · {d.category}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <div className="zk-vendors-sheet-actions">
                <button type="button" className="zk-vendors-action" onClick={() => setAttachFor(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="zk-vendors-action primary"
                  onClick={() => void runAttach()}
                >
                  Attach to {attachIds.length || 0}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {successOpen ? (
        <SuccessModal
          title="Saved"
          message="Addon master updated."
          onClose={() => setSuccessOpen(false)}
        />
      ) : null}
      <HubFooter backTo={settingsHubPath('settings')} backLabel="Settings" />
    </div>
  )
}
