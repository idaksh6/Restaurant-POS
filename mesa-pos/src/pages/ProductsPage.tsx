import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ArabicTextInput from '../components/ArabicTextInput'
import MesaSelect from '../components/MesaSelect'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { settingsHubPath } from '../lib/settingsHub'
import { localizedName } from '../lib/branding'
import { useI18n } from '../locale/i18n'
import type { MasterDish } from '../data/masters'
import { isDishCodeTaken, nextUniqueDishCode, recipeLineIngredientId } from '../data/masters'
import { money } from '../data/mock'
import { activeTaxes, defaultTaxIds } from '../data/tax'
import { nextUnitCode, type MeasureUnit } from '../data/units'
import { getActiveBranchId } from '../data/company'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'

type Tab = 'basic' | 'tax' | 'recipe' | 'discount'

function emptyDish(
  categoryId: string,
  category: string,
  code: string,
  unitId?: string,
  taxIds?: string[],
): MasterDish {
  return {
    id: `m-${Date.now()}`,
    name: '',
    alias: '',
    categoryId,
    category,
    price: 0,
    cost: 0,
    code,
    active: true,
    popular: false,
    unitId,
    productType: 'single',
    details: '',
    hsn: '',
    taxIds: taxIds ?? [],
    branchId: getActiveBranchId(),
  }
}

export default function ProductsPage() {
  const { user } = useAuth()
  const { flash, ingredients } = usePos()
  const { t, lang } = useI18n()
  const { runSync } = useSync()
  const { categories, dishes, saveDish, deleteDish } = useMasters()
  const { taxes, units, discounts, saveUnit } = useCatalog()
  const selectableTaxes = useMemo(() => activeTaxes(taxes), [taxes])
  const selectableDiscounts = useMemo(
    () => discounts.filter((d) => d.active).sort((a, b) => a.percent - b.percent),
    [discounts],
  )

  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const mains = useMemo(
    () => categories.filter((c) => !c.parentId && c.active).sort((a, b) => a.sort - b.sort),
    [categories],
  )
  const subs = useMemo(
    () => categories.filter((c) => c.parentId && c.active).sort((a, b) => a.sort - b.sort),
    [categories],
  )

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(mains.map((m) => [m.id, true])),
  )
  const [selectedCat, setSelectedCat] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<MasterDish | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [tab, setTab] = useState<Tab>('basic')
  const [quickUnit, setQuickUnit] = useState<{
    name: string
    kind: MeasureUnit['kind']
    quantity: number
  } | null>(null)
  const imageFileRef = useRef<HTMLInputElement>(null)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const leafCats = useMemo(() => {
    const hasChildren = new Set(subs.map((s) => s.parentId))
    return categories.filter((c) => c.active && !hasChildren.has(c.id))
  }, [categories, subs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dishes
      .filter((d) => {
        const matchQ =
          !q ||
          d.name.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          (d.alias ?? '').toLowerCase().includes(q)
        if (!matchQ) return false
        if (selectedCat === 'all') return true
        if (selectedCat === d.categoryId) return true
        const cat = categories.find((c) => c.id === d.categoryId)
        return cat?.parentId === selectedCat
      })
      .sort((a, b) => {
        const na = Number(a.code)
        const nb = Number(b.code)
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
        return String(a.code).localeCompare(String(b.code), undefined, { numeric: true }) || a.name.localeCompare(b.name)
      })
  }, [dishes, query, selectedCat, categories])

  function nextCode() {
    return nextUniqueDishCode(dishes, 1000)
  }

  function startAdd() {
    const cat =
      leafCats.find((c) => c.id === selectedCat) ??
      leafCats[0] ??
      categories.find((c) => c.active) ??
      categories[0]
    if (!cat) {
      flash('Create a category first')
      return
    }
    setIsNew(true)
    setTab('basic')
    setEditing(emptyDish(cat.id, cat.name, nextCode(), units[0]?.id, defaultTaxIds(taxes)))
  }

  function startEdit(dish: MasterDish) {
    setIsNew(false)
    setTab('basic')
    setEditing({ ...dish })
  }

  function openQuickUnit() {
    setQuickUnit({ name: '', kind: 'generic', quantity: 1 })
  }

  function saveQuickUnit() {
    if (!quickUnit || !editing) return
    const name = quickUnit.name.trim()
    if (!name) {
      flash('Enter unit name')
      return
    }
    const existing = units.find((u) => u.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      setEditing({ ...editing, unitId: existing.id })
      setQuickUnit(null)
      flash(`Using existing unit “${existing.name}”`)
      return
    }
    const row: MeasureUnit = {
      id: `u-${Date.now()}`,
      code: nextUnitCode(units),
      name,
      quantity: Number(quickUnit.quantity) || 1,
      kind: quickUnit.kind,
    }
    saveUnit(row)
    setEditing({ ...editing, unitId: row.id })
    setQuickUnit(null)
    flash(`Unit “${name}” added`)
  }

  function onProductImage(file: File | null) {
    if (!editing || !file) return
    if (!file.type.startsWith('image/')) {
      flash('Choose an image file')
      return
    }
    if (file.size > 1.5 * 1024 * 1024) {
      flash('Image must be under 1.5 MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setEditing({ ...editing, imageDataUrl: String(reader.result || '') || undefined })
    }
    reader.readAsDataURL(file)
  }

  async function save() {
    if (!editing) return
    if (!editing.name.trim()) {
      flash('Name is required')
      setTab('basic')
      return
    }
    if (!editing.code.trim()) {
      flash('UPC / code is required')
      return
    }
    if (isDishCodeTaken(dishes, editing.code, editing.id)) {
      flash('Menu item code already exists — enter a unique code')
      setTab('basic')
      return
    }
    if (!editing.categoryId) {
      flash('Department is required')
      return
    }
    const cost = Number(editing.cost) || 0
    const price = Number(editing.price) || 0
    await saveDish({ ...editing, name: editing.name.trim(), cost, price })
    setEditing(null)
    flash(isNew ? 'Menu item saved' : 'Menu item updated')
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      message: `Delete menu item “${editing.name}”? This cannot be undone.`,
      onConfirm: () => {
        void deleteDish(editing.id).then(() => {
          setEditing(null)
          flash('Menu item deleted')
          void runSync({ quiet: true }).catch(() => undefined)
        })
      },
    })
  }

  const profitPct =
    editing && editing.cost && editing.cost > 0
      ? Math.round((((editing.price || 0) - editing.cost) / editing.cost) * 1000) / 10
      : 0

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>{t.menuDetails} locked</strong>
          Only Admin can manage menu item details.
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
    <div className="zk-products">
      <HubHeader closeTo={settingsHubPath('products')} />

      <div className="zk-products-bar">
        <h1>{t.menuDetails}</h1>
        <button type="button" className="zk-products-add" onClick={startAdd} title={`Add ${t.menuItem.toLowerCase()}`}>
          +
        </button>
      </div>

      <p className="zk-products-lead">{t.menuDetailsHint}</p>

      <div className="zk-products-search">
        <label>
          Search
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, code, alias…"
          />
        </label>
        <span className="chip">{filtered.length} items</span>
      </div>

      <div className="zk-products-body">
        <aside className="zk-products-tree">
          <button
            type="button"
            className={`zk-tree-all${selectedCat === 'all' ? ' active' : ''}`}
            onClick={() => setSelectedCat('all')}
          >
            All {t.menuItems.toLowerCase()}
          </button>
          {mains.map((main) => {
            const children = subs.filter((s) => s.parentId === main.id)
            const open = expanded[main.id] ?? true
            return (
              <div key={main.id} className="zk-tree-block">
                <div className="zk-tree-main">
                  <button
                    type="button"
                    className="zk-tree-toggle"
                    aria-label={open ? 'Collapse' : 'Expand'}
                    onClick={() => setExpanded((prev) => ({ ...prev, [main.id]: !open }))}
                  >
                    {open ? '▾' : '▸'}
                  </button>
                  <button
                    type="button"
                    className={`zk-tree-label${selectedCat === main.id ? ' active' : ''}`}
                    onClick={() => setSelectedCat(main.id)}
                  >
                    {localizedName(main, lang)}
                  </button>
                </div>
                {open ? (
                  <div className="zk-tree-subs">
                    {children.length === 0 ? (
                      <button
                        type="button"
                        className={selectedCat === main.id ? 'active' : ''}
                        onClick={() => setSelectedCat(main.id)}
                      >
                        {localizedName(main, lang)}
                      </button>
                    ) : (
                      children.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          className={selectedCat === sub.id ? 'active' : ''}
                          onClick={() => setSelectedCat(sub.id)}
                        >
                          {localizedName(sub, lang)}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </aside>

        <section className="zk-products-list">
          {filtered.length === 0 ? (
            <div className="zk-products-empty">
              <strong>No {t.menuItems.toLowerCase()} here</strong>
              <span>Pick another category or tap + to add one.</span>
            </div>
          ) : (
            <div className="zk-products-grid">
              {filtered.map((dish) => (
                <button
                  key={dish.id}
                  type="button"
                  className={`zk-product-card${dish.imageDataUrl ? ' has-photo' : ''}`}
                  onClick={() => startEdit(dish)}
                  style={
                    dish.imageDataUrl
                      ? {
                          backgroundImage: `linear-gradient(180deg, rgba(12, 22, 20, 0.15) 0%, rgba(12, 22, 20, 0.45) 42%, rgba(8, 14, 12, 0.88) 100%), url(${dish.imageDataUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : undefined
                  }
                >
                  <span className={`zk-product-badge${dish.active ? '' : ' off'}`}>
                    {dish.active ? 'Active' : 'Inactive'}
                  </span>
                  <strong>{localizedName(dish, lang)}</strong>
                  <span className="zk-product-meta">
                    {dish.code} · {dish.category}
                    {lang === 'ar' && dish.name && dish.alias ? ` · ${dish.name}` : ''}
                    {lang === 'en' && dish.alias ? ` · ${dish.alias}` : ''}
                  </span>
                  <em>{money(dish.price, lang)}</em>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <HubFooter backTo={settingsHubPath('products')} backLabel={t.products} />

      {editing ? (
        <div className="zk-products-modal" role="dialog" aria-modal="true">
          <div className="zk-products-sheet">
            <div className="zk-products-sheet-head">
              <div>
                <p className="zk-products-sheet-kicker">{isNew ? t.menuItems : t.menuDetails}</p>
                <h2>{isNew ? `New ${t.menuItem.toLowerCase()}` : editing.name || t.menuDetails}</h2>
              </div>
              <button
                type="button"
                className="zk-products-sheet-close"
                onClick={() => setEditing(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="zk-products-tabs" role="tablist">
              {(
                [
                  ['basic', 'Basic'],
                  ['tax', 'Tax'],
                  ['recipe', 'Recipe'],
                  ['discount', 'Discount'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={tab === id ? 'active' : ''}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {id === 'recipe' && (editing.recipe?.length ?? 0) > 0
                    ? ` (${editing.recipe!.length})`
                    : ''}
                </button>
              ))}
            </div>

            <div className="zk-products-sheet-body">
              {tab === 'basic' ? (
                <div className="zk-products-form">
                  <section className="zk-products-section">
                    <h3>Identity</h3>
                    <div className="zk-products-grid-2">
                      <label className="zk-products-span-2">
                        <span>
                          Name <i>*</i>
                        </span>
                        <input
                          className="search"
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          placeholder="Menu item name"
                          autoFocus
                        />
                      </label>
                      <label className="zk-products-span-2">
                        <span>Alias name (Arabic)</span>
                        <ArabicTextInput
                          value={editing.alias ?? ''}
                          onChange={(alias) => setEditing({ ...editing, alias })}
                          suggestFrom={editing.name}
                          mode="ar"
                          placeholder="اكتب بالإنجليزية للتحويل…"
                        />
                      </label>
                      <label>
                        <span>
                          UPC code <i>*</i>
                        </span>
                        <input
                          className="search"
                          value={editing.code}
                          onChange={(e) => setEditing({ ...editing, code: e.target.value })}
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
                    </div>
                  </section>

                  <section className="zk-products-section">
                    <h3>Catalog</h3>
                    <div className="zk-products-grid-2">
                      <label>
                        <span>
                          Department <i>*</i>
                        </span>
                        <MesaSelect
                          value={editing.categoryId}
                          onChange={(v) => {
                            const cat = categories.find((c) => c.id === v)
                            setEditing({
                              ...editing,
                              categoryId: v,
                              category: cat?.name ?? editing.category,
                            })
                          }}
                          options={leafCats.map((c) => ({
                            value: c.id,
                            label: c.parentId
                              ? `${categories.find((p) => p.id === c.parentId)?.name ?? ''} › ${c.name}`
                              : c.name,
                          }))}
                        />
                      </label>
                      <label>
                        <span>Units</span>
                        <div className="zk-products-select-add">
                          <MesaSelect
                            value={editing.unitId ?? units[0]?.id ?? ''}
                            onChange={(v) => setEditing({ ...editing, unitId: v })}
                            options={
                              units.length
                                ? units.map((u) => ({ value: u.id, label: u.name }))
                                : [{ value: '', label: 'No units — tap +' }]
                            }
                          />
                          <button
                            type="button"
                            className="zk-products-quick-add"
                            title="Add unit"
                            aria-label="Add unit"
                            onClick={openQuickUnit}
                          >
                            +
                          </button>
                        </div>
                      </label>
                      <label>
                        <span>HSN code</span>
                        <input
                          className="search"
                          value={editing.hsn ?? ''}
                          onChange={(e) => setEditing({ ...editing, hsn: e.target.value })}
                          placeholder="Optional"
                        />
                      </label>
                      <label>
                        <span>Item type</span>
                        <MesaSelect
                          value={editing.productType ?? 'single'}
                          onChange={(v) =>
                            setEditing({
                              ...editing,
                              productType: v as 'single' | 'combo',
                            })
                          }
                          options={[
                            { value: 'single', label: 'Single item' },
                            { value: 'combo', label: 'Combo' },
                          ]}
                        />
                      </label>
                      <label className="zk-products-span-2">
                        <span>Item details</span>
                        <input
                          className="search"
                          value={editing.details ?? ''}
                          onChange={(e) => setEditing({ ...editing, details: e.target.value })}
                          placeholder="Short note"
                        />
                      </label>
                    </div>
                  </section>

                  <section className="zk-products-section">
                    <h3>Pricing</h3>
                    <div className="zk-products-grid-2">
                      <label>
                        <span>
                          Cost <i>*</i>
                        </span>
                        <input
                          className="search"
                          type="number"
                          step="0.01"
                          value={editing.cost ?? 0}
                          onChange={(e) =>
                            setEditing({ ...editing, cost: Number(e.target.value) || 0 })
                          }
                        />
                      </label>
                      <label>
                        <span>Total cost</span>
                        <input className="search" readOnly value={(editing.cost ?? 0).toFixed(2)} />
                      </label>
                      <label>
                        <span>
                          Sales price <i>*</i>
                        </span>
                        <input
                          className="search"
                          type="number"
                          step="0.01"
                          value={editing.price}
                          onChange={(e) =>
                            setEditing({ ...editing, price: Number(e.target.value) || 0 })
                          }
                        />
                      </label>
                      <label>
                        <span>Profit %</span>
                        <input
                          className="search"
                          readOnly
                          value={profitPct === 0 ? '—' : `${profitPct}%`}
                        />
                      </label>
                    </div>
                    <label className="zk-products-check">
                      <input
                        type="checkbox"
                        checked={!!editing.popular}
                        onChange={(e) => setEditing({ ...editing, popular: e.target.checked })}
                      />
                      Popular / favorite on POS
                    </label>
                  </section>

                  <section className="zk-products-section zk-products-media">
                    <h3>Menu item image</h3>
                    <div className="zk-product-image">
                      <div
                        className="zk-product-image-preview"
                        style={
                          editing.imageDataUrl
                            ? { backgroundImage: `url(${editing.imageDataUrl})` }
                            : undefined
                        }
                      >
                        {!editing.imageDataUrl ? <span>No photo</span> : null}
                      </div>
                      <div className="zk-product-image-actions">
                        <button
                          type="button"
                          className="zk-products-action"
                          onClick={() => imageFileRef.current?.click()}
                        >
                          Browse
                        </button>
                        <button
                          type="button"
                          className="zk-products-action"
                          disabled={!editing.imageDataUrl}
                          onClick={() => setEditing({ ...editing, imageDataUrl: undefined })}
                        >
                          Clear
                        </button>
                      </div>
                      <input
                        ref={imageFileRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          onProductImage(e.target.files?.[0] ?? null)
                          e.target.value = ''
                        }}
                      />
                      <span>Shown on the floor menu buttons. Keep under 1.5 MB.</span>
                    </div>
                  </section>
                </div>
              ) : null}

              {tab === 'tax' ? (
                <div className="zk-products-note">
                  <strong>Tax rates</strong>
                  <p>
                    Choose which rates apply to this menu item. Ticket settle still uses company VAT
                    rules; these tags travel with the menu master.
                  </p>
                  {selectableTaxes.length === 0 ? (
                    <div className="zk-products-tax-empty">
                      No active taxes yet.{' '}
                      <Link to="/settings/tax">Manage tax master →</Link>
                    </div>
                  ) : (
                    <ul className="zk-products-tax-list">
                      {selectableTaxes.map((tx) => {
                        const on = (editing.taxIds ?? []).includes(tx.id)
                        return (
                          <li key={tx.id}>
                            <label className={`zk-products-tax-row${on ? ' on' : ''}`}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => {
                                  const cur = editing.taxIds ?? []
                                  setEditing({
                                    ...editing,
                                    taxIds: on
                                      ? cur.filter((id) => id !== tx.id)
                                      : [...cur, tx.id],
                                  })
                                }}
                              />
                              <span className="zk-products-tax-name">{tx.name}</span>
                              <span className="zk-products-tax-pct">{tx.percent.toFixed(2)}%</span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <p className="zk-products-tax-link">
                    <Link to="/settings/tax">Manage tax master →</Link>
                    {' · '}
                    <Link to="/settings/tax-update">Bulk Tax Update →</Link>
                  </p>
                </div>
              ) : null}

              {tab === 'recipe' ? (
                <div className="zk-products-note">
                  <strong>Recipe (stock on settle)</strong>
                  <p>
                    Deduct these inventory items when the ticket is settled. Same recipe as Masters →{' '}
                    {t.menuItems}.
                  </p>

                  {(editing.recipe ?? []).length === 0 ? (
                    <div className="zk-products-tax-empty">
                      No ingredients yet. Add items in Ingredient Master first.
                    </div>
                  ) : (
                    <ul className="zk-products-recipe-list">
                      {(editing.recipe ?? []).map((r, idx) => {
                        const ingId = recipeLineIngredientId(r)
                        const ing = ingredients.find((i) => i.id === ingId)
                        const unit = ing?.unit ?? units.find((u) => u.id === editing.unitId)?.name ?? ''
                        return (
                          <li key={`${ingId}-${idx}`} className="zk-products-recipe-row">
                            <div className="zk-products-recipe-main">
                              <span className="zk-products-recipe-label">Ingredient</span>
                              <MesaSelect
                                aria-label={`Ingredient ${idx + 1}`}
                                value={ingId}
                                onChange={(v) => {
                                  const recipe = [...(editing.recipe ?? [])]
                                  recipe[idx] = { ...recipe[idx], ingredientId: v, stockId: undefined }
                                  setEditing({ ...editing, recipe })
                                }}
                                options={
                                  ingredients.length
                                    ? ingredients.filter((i) => i.active).map((i) => ({
                                        value: i.id,
                                        label: `${i.name} (${i.unit})`,
                                      }))
                                    : [{ value: ingId || '', label: 'No ingredients' }]
                                }
                              />
                            </div>
                            <div className="zk-products-recipe-side">
                              <label className="zk-products-recipe-qty">
                                <span className="zk-products-recipe-label">Quantity</span>
                                <span className="zk-products-recipe-qty-box">
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min={0}
                                    value={Number.isFinite(r.qty) ? r.qty : 0}
                                    onChange={(e) => {
                                      const recipe = [...(editing.recipe ?? [])]
                                      recipe[idx] = {
                                        ...recipe[idx],
                                        qty: Number(e.target.value) || 0,
                                      }
                                      setEditing({ ...editing, recipe })
                                    }}
                                  />
                                  {unit ? <em>{unit}</em> : null}
                                </span>
                              </label>
                              <button
                                type="button"
                                className="zk-products-recipe-remove"
                                title="Remove ingredient"
                                aria-label="Remove ingredient"
                                onClick={() => {
                                  const recipe = (editing.recipe ?? []).filter((_, i) => i !== idx)
                                  setEditing({
                                    ...editing,
                                    recipe: recipe.length ? recipe : undefined,
                                  })
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  <div className="zk-products-recipe-actions">
                    <button
                      type="button"
                      className="zk-products-recipe-add"
                      disabled={!ingredients.length}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          recipe: [
                            ...(editing.recipe ?? []),
                            { ingredientId: ingredients[0]?.id ?? '', qty: 0.1 },
                          ],
                        })
                      }
                    >
                      + Ingredient
                    </button>
                    {!ingredients.length ? (
                      <Link to="/settings/ingredients/list" className="zk-products-tax-link">
                        Add ingredients first →
                      </Link>
                    ) : (
                      <Link to="/settings/ingredients/list" className="zk-products-tax-link">
                        Manage ingredients →
                      </Link>
                    )}
                  </div>
                </div>
              ) : null}

              {tab === 'discount' ? (
                <div className="zk-products-note">
                  <strong>Allowed discounts</strong>
                  <p>
                    Choose which discount rates from the Discount master may apply to this menu item.
                    Leave none selected to allow all active floor rates. Ticket discounts are still
                    applied on the floor when settling.
                  </p>
                  {selectableDiscounts.length === 0 ? (
                    <div className="zk-products-tax-empty">
                      No active discounts yet.{' '}
                      <Link to="/settings/discount">Manage discount master →</Link>
                    </div>
                  ) : (
                    <ul className="zk-products-tax-list">
                      {selectableDiscounts.map((d) => {
                        const on = (editing.discountIds ?? []).includes(d.id)
                        return (
                          <li key={d.id}>
                            <label className={`zk-products-tax-row${on ? ' on' : ''}`}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => {
                                  const cur = editing.discountIds ?? []
                                  setEditing({
                                    ...editing,
                                    discountIds: on
                                      ? cur.filter((id) => id !== d.id)
                                      : [...cur, d.id],
                                  })
                                }}
                              />
                              <span className="zk-products-tax-name">{d.name}</span>
                              <span className="zk-products-tax-pct">{d.percent.toFixed(0)}%</span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <p className="zk-products-tax-link">
                    <Link to="/settings/discount">Manage discount master →</Link>
                  </p>
                </div>
              ) : null}
            </div>

            <div className="zk-products-actions">
              <button type="button" className="zk-products-action" onClick={() => setEditing(null)}>
                Cancel
              </button>
              {!isNew ? (
                <button type="button" className="zk-products-action danger" onClick={remove}>
                  Delete
                </button>
              ) : null}
              <button
                type="button"
                className="zk-products-action primary"
                onClick={() => void save()}
              >
                {isNew ? 'Save' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quickUnit ? (
        <div
          className="zk-products-quick-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Add unit"
        >
          <div className="zk-products-quick-sheet">
            <div className="zk-products-quick-head">
              <strong>New unit</strong>
              <button type="button" className="btn btn-ghost" onClick={() => setQuickUnit(null)}>
                ×
              </button>
            </div>
            <div className="zk-products-quick-body">
              <label>
                <span>Unit name</span>
                <input
                  className="search"
                  autoFocus
                  value={quickUnit.name}
                  placeholder="e.g. KG, PCS, Liter"
                  onChange={(e) => setQuickUnit({ ...quickUnit, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveQuickUnit()
                    }
                  }}
                />
              </label>
              <label>
                <span>Type</span>
                <MesaSelect
                  value={quickUnit.kind}
                  onChange={(v) =>
                    setQuickUnit({ ...quickUnit, kind: v as MeasureUnit['kind'] })
                  }
                  options={[
                    { value: 'generic', label: 'Generic' },
                    { value: 'count', label: 'Count (PCS)' },
                    { value: 'weight', label: 'Weight' },
                    { value: 'volume', label: 'Volume' },
                  ]}
                />
              </label>
              <label>
                <span>Quantity</span>
                <input
                  className="search"
                  type="number"
                  step="0.001"
                  min="0"
                  value={quickUnit.quantity}
                  onChange={(e) =>
                    setQuickUnit({
                      ...quickUnit,
                      quantity: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
            </div>
            <div className="zk-products-quick-actions">
              <button type="button" className="zk-products-action" onClick={() => setQuickUnit(null)}>
                Cancel
              </button>
              <button type="button" className="zk-products-action primary" onClick={saveQuickUnit}>
                Add unit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmDialog}
    </div>
  )
}
