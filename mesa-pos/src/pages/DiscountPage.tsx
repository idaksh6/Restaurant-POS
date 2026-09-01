import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubAddButton, HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { starterDiscounts, type DiscountRate } from '../data/discount'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'
import SuccessModal from '../components/SuccessModal'

const empty = (): DiscountRate => ({
  id: `disc-${Date.now()}`,
  name: '',
  percent: 10,
  active: true,
  isDefault: false,
  sort: 10,
})

export default function DiscountPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const { discounts: rows, saveDiscount, deleteDiscount } = useCatalog()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<DiscountRate | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  useEffect(() => {
    setSelected(Object.fromEntries(rows.filter((d) => d.active).map((d) => [d.id, true])))
  }, [rows])

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.percent - b.percent || a.name.localeCompare(b.name),
      ),
    [rows],
  )

  const activeCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  )
  const defaultRow = useMemo(() => rows.find((d) => d.isDefault), [rows])

  function startAdd() {
    setIsNew(true)
    setEditing({
      ...empty(),
      sort: Math.max(0, ...rows.map((r) => r.sort ?? 0)) + 1,
    })
  }

  function loadStarters() {
    let added = 0
    for (const row of starterDiscounts()) {
      if (rows.some((r) => r.id === row.id || r.percent === row.percent)) continue
      saveDiscount(row)
      added += 1
    }
    flash(added ? `Added ${added} discount rate(s)` : 'Starter discounts already loaded')
  }

  function startEdit(row: DiscountRate) {
    setIsNew(false)
    setEditing({ ...row })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function selectAll() {
    setSelected(Object.fromEntries(rows.map((d) => [d.id, true])))
  }

  function saveForm() {
    if (!editing) return
    if (!editing.name.trim()) {
      flash('Discount name is required')
      return
    }
    if (editing.percent < 0 || editing.percent > 100) {
      flash('Percent must be 0–100')
      return
    }
    const row: DiscountRate = {
      ...editing,
      name: editing.name.trim(),
      percent: Math.round(editing.percent * 100) / 100,
    }
    saveDiscount(row)
    setSelected((prev) => ({ ...prev, [row.id]: row.active }))
    setEditing(null)
    setSuccessOpen(true)
  }

  function applySelection() {
    for (const d of rows) {
      const active = !!selected[d.id]
      if (d.active !== active) saveDiscount({ ...d, active })
    }
    setSuccessOpen(true)
    flash('Discount selection updated')
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deleteDiscount(editing.id)
        setEditing(null)
        flash('Discount deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Discount locked</strong>
          <div style={{ marginTop: '1rem' }}>
            <Link to={settingsHubPath('products')} className="btn btn-ghost">
              Back to Settings
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-disc">
      <HubHeader closeTo={settingsHubPath('products')} />

      <div className="zk-disc-bar">
        <h1>Discount</h1>
        <HubAddButton title="Add discount" className="zk-disc-add" onClick={startAdd} />
      </div>

      <div className="zk-disc-body">
        <section className="zk-disc-hero">
          <div className="zk-disc-hero-copy">
            <p className="zk-disc-kicker">Discount master</p>
            <h2>Floor quick-pick rates</h2>
            <p>
              Define named % discounts used on the POS floor. Active rates appear as discount
              buttons when settling. Assign allowed rates per product under Product → Discount.
            </p>
          </div>
          <div className="zk-disc-hero-meta">
            <span className="zk-disc-pill">Ticket · percent off</span>
            <div className="zk-disc-stats">
              <div>
                <span>Rates</span>
                <strong>{rows.length}</strong>
              </div>
              <div>
                <span>Active</span>
                <strong>{activeCount}</strong>
              </div>
              <div>
                <span>Default</span>
                <strong>{defaultRow ? `${defaultRow.percent}%` : '—'}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="zk-disc-list-card">
          <div className="zk-disc-list-head">
            <div>
              <h3>Discount rates</h3>
              <p>Checked rates stay active on the floor</p>
            </div>
            <div className="zk-disc-list-tools">
              {rows.length === 0 ? (
                <button type="button" className="zk-disc-tool" onClick={loadStarters}>
                  Load 5 / 10 / 15%
                </button>
              ) : null}
              <button type="button" className="zk-disc-tool" onClick={selectAll} disabled={!rows.length}>
                Select all
              </button>
              <button
                type="button"
                className="zk-disc-tool"
                onClick={() => setSelected({})}
                disabled={!activeCount}
              >
                Clear
              </button>
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="zk-disc-empty">
              <strong>No discount rates yet</strong>
              <p>Load the common 5% / 10% / 15% set, or create your own.</p>
              <div className="zk-disc-empty-actions">
                <button type="button" className="zk-vendors-action" onClick={loadStarters}>
                  Load starters
                </button>
                <button type="button" className="zk-vendors-action primary" onClick={startAdd}>
                  Add discount
                </button>
              </div>
            </div>
          ) : (
            <ul className="zk-disc-grid">
              {sorted.map((d) => {
                const on = !!selected[d.id]
                return (
                  <li key={d.id}>
                    <article className={`zk-disc-rate${on ? ' on' : ''}${d.isDefault ? ' def' : ''}`}>
                      <label className="zk-disc-rate-check">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleSelect(d.id)}
                          aria-label={`Activate ${d.name}`}
                        />
                      </label>
                      <button
                        type="button"
                        className="zk-disc-rate-main"
                        onClick={() => startEdit(d)}
                      >
                        <span className="zk-disc-rate-pct">
                          {d.percent.toFixed(d.percent % 1 === 0 ? 0 : 1)}
                          <small>%</small>
                        </span>
                        <span className="zk-disc-rate-copy">
                          <strong>{d.name}</strong>
                          <span className="zk-disc-rate-badges">
                            {d.isDefault ? <span className="zk-disc-badge def">Default</span> : null}
                            {on ? (
                              <span className="zk-disc-badge on">Active</span>
                            ) : (
                              <span className="zk-disc-badge off">Off</span>
                            )}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="zk-disc-rate-edit"
                        onClick={() => startEdit(d)}
                      >
                        Edit
                      </button>
                    </article>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <HubFooter
        backTo={settingsHubPath('products')}
        backLabel={t.products}
        actions={
          <div className="zk-disc-foot-actions">
            <button type="button" className="zk-vendors-action" onClick={() => setSelected({})}>
              {t.clear}
            </button>
            <button type="button" className="zk-vendors-action primary" onClick={applySelection}>
              {t.update}
            </button>
          </div>
        }
      />

      {editing ? (
        <div className="zk-vendors-modal" role="dialog" aria-modal="true">
          <div className="zk-disc-sheet">
            <div className="zk-vendors-sheet-head">
              <div>
                <p className="zk-disc-kicker">{isNew ? 'New rate' : 'Edit rate'}</p>
                <h2>{isNew ? 'Add discount' : editing.name || 'Discount'}</h2>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>
            <div className="zk-disc-form">
              <div className="zk-disc-form-grid">
                <label>
                  <span>
                    Discount name <i>*</i>
                  </span>
                  <input
                    className="search"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="10% off"
                    autoFocus
                  />
                </label>
                <label>
                  <span>Percentage</span>
                  <div className="zk-disc-pct-field">
                    <input
                      className="search"
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={editing.percent}
                      onChange={(e) =>
                        setEditing({ ...editing, percent: Number(e.target.value) || 0 })
                      }
                    />
                    <span>%</span>
                  </div>
                </label>
              </div>
              <div className="zk-disc-form-flags">
                <label className="zk-disc-check">
                  <input
                    type="checkbox"
                    checked={editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  />
                  <span>
                    <strong>Active on floor</strong>
                    <small>Shows as a quick-pick button when settling tickets</small>
                  </span>
                </label>
                <label className="zk-disc-check">
                  <input
                    type="checkbox"
                    checked={!!editing.isDefault}
                    onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
                  />
                  <span>
                    <strong>Highlight as default</strong>
                    <small>Preferred rate for staff reference</small>
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
          title={t.successTitle}
          message={t.updatedSuccessfully}
          okLabel={t.ok}
          onClose={() => setSuccessOpen(false)}
        />
      ) : null}
      {deleteConfirmDialog}
    </div>
  )
}
