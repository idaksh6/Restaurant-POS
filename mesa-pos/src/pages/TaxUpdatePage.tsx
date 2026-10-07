import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import MesaSelect from '../components/MesaSelect'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { activeTaxes, companyDefaultTaxPercent, normalizeTaxIds, type TaxRate } from '../data/tax'
import type { MasterDish } from '../data/masters'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import SuccessModal from '../components/SuccessModal'

type ApplyMode = 'replace' | 'clear'
type TaxFilter = 'all' | 'assigned' | 'none' | string

function taxLabel(ids: string[] | undefined, taxes: TaxRate[]) {
  const id = normalizeTaxIds(ids)[0]
  if (!id) return 'Company default'
  const t = taxes.find((x) => x.id === id)
  if (!t) return '—'
  const name = t.name.trim()
  const pct = `${Number.isInteger(t.percent) ? t.percent.toFixed(0) : t.percent.toFixed(2)}%`
  // Names like "10%" or "Service tax 2%" already include the rate — don't append again.
  if (!name) return pct
  if (/%/.test(name)) return name
  return `${name} ${pct}`
}

function nextTaxIds(mode: ApplyMode, selectedId: string | undefined): string[] {
  if (mode === 'clear') return []
  return selectedId ? [selectedId] : []
}

function sameIds(a: string[] | undefined, b: string[]) {
  const left = normalizeTaxIds(a)
  const right = normalizeTaxIds(b)
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
  const [pickedTaxId, setPickedTaxId] = useState<string>('')
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
        const ids = normalizeTaxIds(d.taxIds)
        if (taxFilter === 'all') return true
        if (taxFilter === 'none') return ids.length === 0
        if (taxFilter === 'assigned') return ids.length > 0
        return ids[0] === taxFilter
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

  const selectedTaxId = pickedTaxId || undefined
  const selectedPct = selectedTaxId
    ? selectableTaxes.find((t) => t.id === selectedTaxId)?.percent ?? 0
    : 0

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selected[d.id])

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

  function validate(): string | null {
    if (!selectedIds.length) return 'Select at least one product'
    if (mode === 'replace' && !selectedTaxId) {
      return 'Select one tax rate'
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
      const taxIds = nextTaxIds(mode, selectedTaxId)
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
        return 'Set each product to one tax rate (single select).'
      case 'clear':
        return `Clear item tax so POS uses company default (${companyDefaultTaxPercent(taxes).toFixed(0)}%).`
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
                ['replace', 'Set rate'],
                ['clear', 'Company default'],
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
                <strong>Tax rate</strong>
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
                <ul className="zk-tu-tax-list" role="radiogroup" aria-label="Bulk tax rate">
                  {selectableTaxes.map((tx) => {
                    const on = pickedTaxId === tx.id
                    return (
                      <li key={tx.id}>
                        <label className={`zk-tu-tax-row${on ? ' on' : ''}`}>
                          <input
                            type="radio"
                            name="bulk-tax"
                            checked={on}
                            onChange={() => setPickedTaxId(tx.id)}
                          />
                          <span className="zk-tu-tax-name">{tx.name}</span>
                          <span className="zk-tu-tax-pct">{tx.percent.toFixed(2)}%</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
              {selectedTaxId ? (
                <p className="zk-tu-sum">
                  Selected rate · <strong>{selectedPct.toFixed(2)}%</strong>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="zk-tu-clear-note">
              Products will use the company default tax (
              {companyDefaultTaxPercent(taxes).toFixed(2)}%) at settle.
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
                setPickedTaxId('')
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
                ? `Reset ${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'} to company default tax?`
                : `Set tax to ${
                    taxes.find((x) => x.id === selectedTaxId)?.name ?? selectedTaxId
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
