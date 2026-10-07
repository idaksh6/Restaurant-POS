import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import SuccessModal from '../components/SuccessModal'
import MesaSelect from '../components/MesaSelect'
import { settingsHubPath } from '../lib/settingsHub'
import { getActiveBranchId } from '../data/company'
import {
  activeBeverageQtys,
  applyBeverageSizesToDish,
  beveragePriceId,
  isBeverageDish,
  listBeverageTargets,
  priceMapForProduct,
  qtyLabel,
  type BeveragePrice,
} from '../data/beverages'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'

export default function BeveragePriceMasterPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { activeBranchId } = useBranch()
  const { dishes, categories, saveDishes } = useMasters()
  const { beverageQtys, beveragePrices, saveBeveragePricesBulk } = useCatalog()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'drinks' | 'all'>('drinks')
  const [departmentId, setDepartmentId] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [successOpen, setSuccessOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const qtys = useMemo(() => activeBeverageQtys(beverageQtys), [beverageQtys])

  const drinkCount = useMemo(
    () => dishes.filter((d) => d.active && isBeverageDish(d, categories)).length,
    [dishes, categories],
  )

  const beverages = useMemo(
    () => listBeverageTargets(dishes, categories, { scope, departmentId, query }),
    [dishes, categories, scope, departmentId, query],
  )

  const mainDepartments = useMemo(
    () =>
      categories
        .filter((c) => c.active && !c.parentId)
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name)),
    [categories],
  )

  function cellKey(productId: string, qtyId: string) {
    return `${productId}::${qtyId}`
  }

  function displayPrice(productId: string, qtyId: string, fallback: number) {
    const key = cellKey(productId, qtyId)
    if (Object.prototype.hasOwnProperty.call(draft, key)) return draft[key]
    const map = priceMapForProduct(beveragePrices, productId)
    if (map[qtyId] != null) return String(map[qtyId])
    return String(fallback)
  }

  function setCell(productId: string, qtyId: string, value: string) {
    setDraft((prev) => ({ ...prev, [cellKey(productId, qtyId)]: value }))
  }

  function collectRows(): BeveragePrice[] {
    const out: BeveragePrice[] = []
    for (const dish of beverages) {
      for (const qty of qtys) {
        const key = cellKey(dish.id, qty.id)
        const raw = Object.prototype.hasOwnProperty.call(draft, key)
          ? draft[key]
          : displayPrice(dish.id, qty.id, dish.price)
        const price = Math.round((Number(raw) || 0) * 100) / 100
        out.push({
          id: beveragePriceId(dish.id, qty.id),
          branchId: activeBranchId || getActiveBranchId(),
          productId: dish.id,
          qtyId: qty.id,
          price,
        })
      }
    }
    return out
  }

  function requestSave() {
    if (!qtys.length) {
      flash('Define serving sizes in Beverages Quantity Master first')
      return
    }
    if (!beverages.length) {
      flash(
        scope === 'drinks'
          ? 'No drinks found — switch to All products or pick a department'
          : 'No products match this filter',
      )
      return
    }
    setConfirmOpen(true)
  }

  async function saveAndApply() {
    setSaving(true)
    try {
      const rows = collectRows()
      saveBeveragePricesBulk(rows)
      const byProduct = new Map<string, BeveragePrice[]>()
      for (const r of rows) {
        const list = byProduct.get(r.productId) ?? []
        list.push(r)
        byProduct.set(r.productId, list)
      }
      const next = beverages.map((d) =>
        applyBeverageSizesToDish(d, qtys, byProduct.get(d.id) ?? []),
      )
      const n = await saveDishes(next)
      setDraft({})
      setConfirmOpen(false)
      flash(`Saved prices · applied sizes to ${n} item(s)`)
      setSuccessOpen(true)
    } finally {
      setSaving(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Beverages Price locked</strong>
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
    <div className="zk-tax zk-bev zk-bev-price-page">
      <HubHeader closeTo={settingsHubPath('products')} />

      <div className="zk-tax-bar">
        <h1>Beverages Price</h1>
      </div>

      <div className="zk-tax-body">
        <section className="zk-tax-hero">
          <div className="zk-tax-hero-copy">
            <p className="zk-tax-kicker">Size pricing</p>
            <h2>Prices by serving size</h2>
            <p>
              Columns come from{' '}
              <Link to="/settings/beverages/quantities">Beverages Quantity Master</Link>. Saving
              updates the price grid and pushes sizes onto each selected product.
            </p>
          </div>
          <div className="zk-tax-hero-meta">
            <span className="zk-tax-pill">Loyalty &amp; drinks</span>
            <div className="zk-tax-stats">
              <div>
                <span>Shown</span>
                <strong>{beverages.length}</strong>
              </div>
              <div>
                <span>Drinks</span>
                <strong>{drinkCount}</strong>
              </div>
              <div>
                <span>Sizes</span>
                <strong>{qtys.length}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="zk-tax-list-card zk-bev-price-card">
          <div className="zk-bev-price-toolbar">
            <div className="zk-bev-price-toolbar-copy">
              <h3>Price grid</h3>
              <p>Filter drinks or any department</p>
            </div>
            <div className="zk-bev-tools">
              <div className="zk-bev-scope" role="group" aria-label="Product scope">
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
              <input
                className="zk-bev-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, code…"
                aria-label="Search beverages"
              />
              <button
                type="button"
                className="zk-vendors-action primary zk-bev-save-btn"
                onClick={requestSave}
                disabled={!qtys.length || !beverages.length}
              >
                Save &amp; apply
              </button>
            </div>
          </div>

          {drinkCount === 0 && scope === 'drinks' ? (
            <div className="zk-bev-hint">
              No auto-detected drinks. Switch to <strong>All products</strong> or pick a department
              that holds your soft drinks.
            </div>
          ) : null}

          {!qtys.length ? (
            <div className="zk-bev-empty">
              <strong>No active serving sizes</strong>
              <p>Create Small / Regular / Large in Quantity Master, then return here to set prices.</p>
              <Link to="/settings/beverages/quantities" className="zk-vendors-action primary">
                Open Quantity Master
              </Link>
            </div>
          ) : !beverages.length ? (
            <div className="zk-bev-empty">
              <strong>No products in this filter</strong>
              <p>
                Try <strong>All products</strong>, clear the department filter, or add items in{' '}
                <Link to="/masters?tab=dishes">Menu Items</Link>.
              </p>
            </div>
          ) : (
            <div className="zk-bev-table-wrap">
              <table className="zk-bev-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Product</th>
                    <th>Dept</th>
                    {qtys.map((q) => (
                      <th key={q.id}>
                        {qtyLabel(q)}
                        {q.isDefault ? <span className="zk-bev-def"> · def</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {beverages.map((d) => (
                    <tr key={d.id}>
                      <td className="mono">{d.code}</td>
                      <td>{d.name}</td>
                      <td className="muted">{d.category}</td>
                      {qtys.map((q) => (
                        <td key={q.id}>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="zk-bev-price-input"
                            value={displayPrice(d.id, q.id, d.price)}
                            onChange={(e) => setCell(d.id, q.id, e.target.value)}
                            aria-label={`${d.name} ${qtyLabel(q)} price`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {confirmOpen ? (
        <div className="zk-vendors-modal" role="dialog" aria-modal="true">
          <div className="zk-tax-sheet zk-bev-sheet">
            <div className="zk-vendors-sheet-head">
              <div>
                <p className="zk-tax-kicker">Confirm</p>
                <h2>Save &amp; apply sizes?</h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="zk-bev-confirm-body">
              <p>
                Apply <strong>{qtys.length}</strong> size
                {qtys.length === 1 ? '' : 's'} to <strong>{beverages.length}</strong> product
                {beverages.length === 1 ? '' : 's'} and update POS size options.
              </p>
            </div>
            <div className="zk-vendors-actions">
              <button
                type="button"
                className="zk-vendors-action"
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="zk-vendors-action primary"
                onClick={() => void saveAndApply()}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save & apply'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {successOpen ? (
        <SuccessModal
          title="Prices saved"
          message="Beverage prices applied to menu sizes."
          onClose={() => setSuccessOpen(false)}
        />
      ) : null}
      <HubFooter />
    </div>
  )
}
