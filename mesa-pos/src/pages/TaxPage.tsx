import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubAddButton, HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { type TaxRate } from '../data/tax'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'
import SuccessModal from '../components/SuccessModal'

const empty = (): TaxRate => ({
  id: `tax-${Date.now()}`,
  name: '',
  percent: 15,
  active: true,
  isDefault: false,
})

export default function TaxPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const { taxes: rows, saveTax, deleteTax } = useCatalog()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<TaxRate | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  useEffect(() => {
    setSelected(Object.fromEntries(rows.filter((tx) => tx.active).map((tx) => [tx.id, true])))
  }, [rows])

  const activeCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  )
  const defaultRow = useMemo(() => rows.find((tx) => tx.isDefault), [rows])

  function startAdd() {
    setIsNew(true)
    setEditing(empty())
  }

  function startEdit(row: TaxRate) {
    setIsNew(false)
    setEditing({ ...row })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function selectAll() {
    setSelected(Object.fromEntries(rows.map((tx) => [tx.id, true])))
  }

  function saveForm() {
    if (!editing) return
    if (!editing.name.trim()) {
      flash('Tax name is required')
      return
    }
    if (editing.percent < 0 || editing.percent > 100) {
      flash('Percent must be 0–100')
      return
    }
    const row = {
      ...editing,
      name: editing.name.trim(),
      percent: Math.round(editing.percent * 100) / 100,
    }
    saveTax(row)
    setSelected((prev) => ({ ...prev, [row.id]: row.active }))
    setEditing(null)
    setSuccessOpen(true)
  }

  function applySelection() {
    for (const tx of rows) {
      const active = !!selected[tx.id]
      if (tx.active !== active) saveTax({ ...tx, active })
    }
    setSuccessOpen(true)
    flash('Tax selection updated')
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deleteTax(editing.id)
        setEditing(null)
        flash('Tax deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Tax locked</strong>
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
    <div className="zk-tax">
      <HubHeader closeTo={settingsHubPath('products')} />

      <div className="zk-tax-bar">
        <h1>Tax</h1>
        <HubAddButton title="Add tax" className="zk-tax-add" onClick={startAdd} />
      </div>

      <div className="zk-tax-body">
        <section className="zk-tax-hero">
          <div className="zk-tax-hero-copy">
            <p className="zk-tax-kicker">Tax master</p>
            <h2>Select active rates</h2>
            <p>
              Define VAT and other rates here. Check the rates that should stay active, then tap
              Update. Assign rates to products from{' '}
              <Link to="/settings/tax-update">Tax Update</Link>.
            </p>
          </div>
          <div className="zk-tax-hero-meta">
            <span className="zk-tax-pill">KSA · default VAT 15%</span>
            <div className="zk-tax-stats">
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
                <strong>{defaultRow ? `${defaultRow.percent.toFixed(0)}%` : '—'}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="zk-tax-list-card">
          <div className="zk-tax-list-head">
            <div>
              <h3>Tax rates</h3>
              <p>Checked rates are active on the POS</p>
            </div>
            <div className="zk-tax-list-tools">
              <button type="button" className="zk-tax-tool" onClick={selectAll} disabled={!rows.length}>
                Select all
              </button>
              <button
                type="button"
                className="zk-tax-tool"
                onClick={() => setSelected({})}
                disabled={!activeCount}
              >
                Clear
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="zk-tax-empty">
              <strong>No tax rates yet</strong>
              <p>Create your first rate (e.g. VAT 15%) to use on products.</p>
              <button type="button" className="zk-vendors-action primary" onClick={startAdd}>
                Add tax rate
              </button>
            </div>
          ) : (
            <ul className="zk-tax-grid">
              {rows.map((tx) => {
                const on = !!selected[tx.id]
                return (
                  <li key={tx.id}>
                    <article className={`zk-tax-rate${on ? ' on' : ''}${tx.isDefault ? ' def' : ''}`}>
                      <label className="zk-tax-rate-check">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleSelect(tx.id)}
                          aria-label={`Activate ${tx.name}`}
                        />
                      </label>

                      <button
                        type="button"
                        className="zk-tax-rate-main"
                        onClick={() => startEdit(tx)}
                      >
                        <span className="zk-tax-rate-pct" aria-hidden>
                          {tx.percent.toFixed(tx.percent % 1 === 0 ? 0 : 2)}
                          <small>%</small>
                        </span>
                        <span className="zk-tax-rate-copy">
                          <strong>{tx.name}</strong>
                          <span className="zk-tax-rate-badges">
                            {tx.isDefault ? (
                              <span className="zk-tax-badge def">Default</span>
                            ) : null}
                            {on ? (
                              <span className="zk-tax-badge on">Active</span>
                            ) : (
                              <span className="zk-tax-badge off">Off</span>
                            )}
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        className="zk-tax-rate-edit"
                        onClick={() => startEdit(tx)}
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
          <div className="zk-tax-foot-actions">
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
          <div className="zk-tax-sheet">
            <div className="zk-vendors-sheet-head">
              <div>
                <p className="zk-tax-kicker">{isNew ? 'New rate' : 'Edit rate'}</p>
                <h2>{isNew ? 'Add tax' : editing.name || 'Tax'}</h2>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>
            <div className="zk-tax-form">
              <div className="zk-tax-form-grid">
                <label>
                  <span>
                    Tax name <i>*</i>
                  </span>
                  <input
                    className="search"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="VAT 15%"
                    autoFocus
                  />
                </label>
                <label>
                  <span>Percentage</span>
                  <div className="zk-tax-pct-field">
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
              <div className="zk-tax-form-flags">
                <label className="zk-tax-check">
                  <input
                    type="checkbox"
                    checked={editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  />
                  <span>
                    <strong>Active</strong>
                    <small>Available for products and Tax Update</small>
                  </span>
                </label>
                <label className="zk-tax-check">
                  <input
                    type="checkbox"
                    checked={!!editing.isDefault}
                    onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
                  />
                  <span>
                    <strong>Default for new products</strong>
                    <small>Applied automatically when creating products</small>
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
