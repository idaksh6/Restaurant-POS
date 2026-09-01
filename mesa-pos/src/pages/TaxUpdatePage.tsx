import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import MesaSelect from '../components/MesaSelect'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { activeTaxes, taxPercentTotal, type TaxRate } from '../data/tax'
import type { MasterDish } from '../data/masters'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import SuccessModal from '../components/SuccessModal'

type ApplyMode = 'replace' | 'add' | 'remove' | 'clear'
type TaxFilter = 'all' | 'assigned' | 'none' | string

function taxLabel(ids: string[] | undefined, taxes: TaxRate[]) {
  if (!ids?.length) return '—'
  const parts = ids
    .map((id) => taxes.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => `${t!.name} ${t!.percent.toFixed(0)}%`)
  return parts.length ? parts.join(' · ') : '—'
}

function nextTaxIds(current: string[] | undefined, mode: ApplyMode, selected: string[]): string[] {
  const cur = current ?? []
  if (mode === 'clear') return []
  if (mode === 'replace') return [...selected]
  if (mode === 'add') {
    const set = new Set(cur)
    for (const id of selected) set.add(id)
    return [...set]
  }
  // remove
  const drop = new Set(selected)
  return cur.filter((id) => !drop.has(id))
}

function sameIds(a: string[] | undefined, b: string[]) {
  const left = [...(a ?? [])].sort()
  const right = [...b].sort()
  return left.length === right.length && left.every((id, i) => id === right[i])
}

export default function TaxUpdatePage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const { taxes } = useCatalog()
  const { categories, dishes, saveDishes } = useMasters()
  const selectableTaxes = useMemo(() => activeTaxes(taxes), [taxes])

  const [query, setQuery] = useState('')
  const [deptId, setDeptId] = useState('all')
  const [taxFilter, setTaxFilter] = useState<TaxFilter>('all')
  const [mode, setMode] = useState<ApplyMode>('replace')
  const [pickedTaxes, setPickedTaxes] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [successCount, setSuccessCount] = useState<number | null>(null)

  const deptOptions = useMemo(() => {
    const subs = categories.filter((c) => c.active && c.parentId).sort((a, b) => a.sort - b.sort)
    const mains = categories.filter((c) => c.active && !c.parentId).sort((a, b) => a.sort - b.sort)
    const list = subs.length ? subs : mains
    return [
      { value: 'all', label: 'All departments' },
      ...list.map((c) => ({ value: c.id, label: c.name })),
    ]
  }, [categories])

  const taxFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'Any tax status' },
      { value: 'assigned', label: 'Has tax' },
      { value: 'none', label: 'No tax' },
      ...selectableTaxes.map((tx) => ({
        value: tx.id,
        label: `${tx.name} (${tx.percent.toFixed(2)}%)`,
      })),
    ],
    [selectableTaxes],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dishes
      .filter((d) => d.active)
      .filter((d) => {
        if (deptId === 'all') return true
        const cat = categories.find((c) => c.id === d.categoryId)
        return d.categoryId === deptId || cat?.parentId === deptId
      })
      .filter((d) => {
        const ids = d.taxIds ?? []
        if (taxFilter === 'all') return true
        if (taxFilter === 'none') return ids.length === 0
        if (taxFilter === 'assigned') return ids.length > 0
        return ids.includes(taxFilter)
      })
      .filter((d) => {
        if (!q) return true
        return (
          d.name.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          (d.alias ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dishes, categories, deptId, taxFilter, query])

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([id]) => id),
    [selected],
  )

  const selectedTaxIds = useMemo(
    () => selectableTaxes.filter((tx) => pickedTaxes[tx.id]).map((tx) => tx.id),
    [selectableTaxes, pickedTaxes],
  )

  const selectedPct = taxPercentTotal(selectedTaxIds, taxes)

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selected[d.id])

  function toggleTax(id: string) {
    setPickedTaxes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleProduct(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = { ...prev }
        for (const d of filtered) delete next[d.id]
        return next
      })
      return
    }
    setSelected((prev) => {
      const next = { ...prev }
      for (const d of filtered) next[d.id] = true
      return next
    })
  }

  function modeNeedsTaxes(m: ApplyMode) {
    return m === 'replace' || m === 'add' || m === 'remove'
  }

  function validate(): string | null {
    if (!selectedIds.length) return 'Select at least one product'
    if (modeNeedsTaxes(mode) && !selectedTaxIds.length) {
      return mode === 'remove' ? 'Select tax rates to remove' : 'Select at least one tax rate'
    }
    if (selectableTaxes.length === 0 && mode !== 'clear') {
      return 'No active taxes — create rates in Tax first'
    }
    return null
  }

  function buildUpdates(): MasterDish[] {
    const idSet = new Set(selectedIds)
    const out: MasterDish[] = []
    for (const d of dishes) {
      if (!idSet.has(d.id)) continue
      const taxIds = nextTaxIds(d.taxIds, mode, selectedTaxIds)
      if (sameIds(d.taxIds, taxIds)) continue
      out.push({ ...d, taxIds })
    }
    return out
  }

  async function applyUpdate() {
    const err = validate()
    if (err) {
      flash(err)
      setConfirmOpen(false)
      return
    }
    const updates = buildUpdates()
    if (!updates.length) {
      flash('Selected products already match this tax setting')
      setConfirmOpen(false)
      return
    }
    setBusy(true)
    try {
      const count = await saveDishes(updates)
      setSuccessCount(count)
      setConfirmOpen(false)
      setSelected({})
      flash(`Updated tax on ${count} product${count === 1 ? '' : 's'}`)
    } finally {
      setBusy(false)
    }
  }

  function modeHelp(m: ApplyMode) {
    switch (m) {
      case 'replace':
        return 'Overwrite each product’s tax with the rates you select below.'
      case 'add':
        return 'Keep existing taxes and add the selected rates.'
      case 'remove':
        return 'Remove only the selected rates from each product.'
      case 'clear':
        return 'Strip all tax rates from the selected products.'
    }
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Tax Update locked</strong>
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
    <div className="zk-tu">
      <HubHeader closeTo={settingsHubPath('products')} />

      <div className="zk-tu-bar">
        <h1>Tax Update</h1>
      </div>

      <div className="zk-tu-body">
        <aside className="zk-tu-panel zk-tu-apply">
          <div className="zk-tu-panel-head">
            <p className="zk-tu-kicker">Bulk apply</p>
            <h2>Update taxes</h2>
            <p className="zk-tu-lead">
              Apply tax rates to many products at once. Use Tax to create rates; use this page to
              assign them.
            </p>
          </div>

          <div className="zk-tu-modes" role="radiogroup" aria-label="Update mode">
            {(
              [
                ['replace', 'Replace'],
                ['add', 'Add'],
                ['remove', 'Remove'],
                ['clear', 'Clear'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                className={`zk-tu-mode${mode === id ? ' on' : ''}`}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="zk-tu-hint">{modeHelp(mode)}</p>

          {mode !== 'clear' ? (
            <div className="zk-tu-tax-block">
              <div className="zk-tu-block-head">
                <strong>Tax rates</strong>
                <Link to="/settings/tax" className="zk-tu-link">
                  Manage master →
                </Link>
              </div>
              {selectableTaxes.length === 0 ? (
                <div className="zk-tu-empty-inline">
                  No active taxes yet.{' '}
                  <Link to="/settings/tax">Create a tax rate</Link>
                </div>
              ) : (
                <ul className="zk-tu-tax-list">
                  {selectableTaxes.map((tx) => {
                    const on = !!pickedTaxes[tx.id]
                    return (
                      <li key={tx.id}>
                        <label className={`zk-tu-tax-row${on ? ' on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleTax(tx.id)}
                          />
                          <span className="zk-tu-tax-name">{tx.name}</span>
                          <span className="zk-tu-tax-pct">{tx.percent.toFixed(2)}%</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
              {selectedTaxIds.length > 0 ? (
                <p className="zk-tu-sum">
                  Combined rate · <strong>{selectedPct.toFixed(2)}%</strong>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="zk-tu-clear-note">
              Clear mode does not need a tax selection — all rates will be removed from selected
              products.
            </div>
          )}

          <div className="zk-tu-stats">
            <div>
              <span>Selected</span>
              <strong>{selectedIds.length}</strong>
            </div>
            <div>
              <span>Visible</span>
              <strong>{filtered.length}</strong>
            </div>
            <div>
              <span>Catalog</span>
              <strong>{dishes.filter((d) => d.active).length}</strong>
            </div>
          </div>

          <button
            type="button"
            className="zk-tu-apply-btn"
            disabled={busy}
            onClick={() => {
              const err = validate()
              if (err) {
                flash(err)
                return
              }
              setConfirmOpen(true)
            }}
          >
            Apply to {selectedIds.length || 0} product{selectedIds.length === 1 ? '' : 's'}
          </button>
        </aside>

        <section className="zk-tu-panel zk-tu-products">
          <div className="zk-tu-panel-head row">
            <div>
              <p className="zk-tu-kicker">Products</p>
              <h2>Choose products</h2>
            </div>
            <button type="button" className="zk-tu-ghost" onClick={toggleAllFiltered}>
              {allFilteredSelected ? 'Clear visible' : 'Select visible'}
            </button>
          </div>

          <div className="zk-tu-filters">
            <input
              className="search zk-tu-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, code, alias…"
              aria-label="Search products"
            />
            <MesaSelect
              aria-label="Department"
              value={deptId}
              onChange={setDeptId}
              options={deptOptions}
            />
            <MesaSelect
              aria-label="Tax filter"
              value={taxFilter}
              onChange={(v) => setTaxFilter(v as TaxFilter)}
              options={taxFilterOptions}
            />
          </div>

          <div className="zk-tu-table-wrap">
            <table className="zk-tu-table">
              <thead>
                <tr>
                  <th className="check">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                      aria-label="Select all visible"
                    />
                  </th>
                  <th>Code</th>
                  <th>Product</th>
                  <th>Department</th>
                  <th>Current tax</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No products match these filters
                    </td>
                  </tr>
                ) : (
                  filtered.map((d) => {
                    const on = !!selected[d.id]
                    const cat = categories.find((c) => c.id === d.categoryId)
                    return (
                      <tr key={d.id} className={on ? 'on' : ''}>
                        <td className="check">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleProduct(d.id)}
                            aria-label={`Select ${d.name}`}
                          />
                        </td>
                        <td className="code">{d.code}</td>
                        <td>
                          <button
                            type="button"
                            className="zk-tu-prod-name"
                            onClick={() => toggleProduct(d.id)}
                          >
                            {d.name}
                          </button>
                        </td>
                        <td className="muted">{cat?.name ?? d.category}</td>
                        <td className="tax">{taxLabel(d.taxIds, taxes)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <HubFooter
        backTo={settingsHubPath('products')}
        backLabel={t.products}
        actions={
          <div className="zk-tu-foot-actions">
            <button
              type="button"
              className="zk-vendors-action"
              onClick={() => {
                setSelected({})
                setPickedTaxes({})
              }}
            >
              {t.clear}
            </button>
            <button
              type="button"
              className="zk-vendors-action primary"
              disabled={busy}
              onClick={() => {
                const err = validate()
                if (err) {
                  flash(err)
                  return
                }
                setConfirmOpen(true)
              }}
            >
              {t.update}
            </button>
          </div>
        }
      />

      {confirmOpen ? (
        <div className="zk-vendors-modal" role="dialog" aria-modal="true">
          <div className="zk-confirm-card zk-tu-confirm">
            <div className="zk-confirm-head">Confirm tax update</div>
            <p className="zk-confirm-msg">
              {mode === 'clear'
                ? `Clear all taxes on ${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'}?`
                : `${mode === 'replace' ? 'Replace' : mode === 'add' ? 'Add' : 'Remove'} ${
                    selectedTaxIds
                      .map((id) => taxes.find((x) => x.id === id)?.name ?? id)
                      .join(', ')
                  } on ${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'}?`}
            </p>
            <div className="zk-confirm-actions">
              <button
                type="button"
                className="zk-confirm-btn"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="zk-confirm-btn primary"
                disabled={busy}
                onClick={() => void applyUpdate()}
              >
                {busy ? 'Updating…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {successCount != null ? (
        <SuccessModal
          title={t.successTitle}
          message={`Updated tax on ${successCount} product${successCount === 1 ? '' : 's'}.`}
          okLabel={t.ok}
          onClose={() => setSuccessCount(null)}
        />
      ) : null}
    </div>
  )
}
