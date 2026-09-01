import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import MesaSelect from '../components/MesaSelect'
import {
  type Ingredient,
  type IngredientVendorLink,
  addIngredientCategory,
  alternateVendorCount,
  canonicalizeIngredientCategory,
  INGREDIENT_CATEGORIES_CHANGED,
  isIngredientNameTaken,
  isIngredientSkuTaken,
  listIngredientCategories,
  nextIngredientSku,
  normalizeIngredient,
  primaryVendorUnitPrice,
} from '../data/ingredients'
import { recipeLineIngredientId } from '../data/masters'
import {
  addStockLocationQuick,
  LOCATION_TYPE_LABELS,
  stockLocationLabel,
  type StockLocationType,
} from '../data/stockLocations'
import { useStockLocations } from '../hooks/useStockLocations'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { usePurchasing } from '../state/PurchasingContext'

function categoryBadgeClass(category: string, active: boolean) {
  if (!active) return 'zk-ing-badge off'
  const key = canonicalizeIngredientCategory(category)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `zk-ing-badge cat-${key || 'general'}`
}

const emptyRow = (sku: string): Ingredient => ({
  id: `ing-${Date.now()}`,
  name: '',
  sku,
  category: 'General',
  unit: 'kg',
  active: true,
})

const LOCATION_TYPE_OPTIONS = (
  Object.entries(LOCATION_TYPE_LABELS) as [StockLocationType, string][]
).map(([value, label]) => ({ value, label }))

export default function IngredientMasterPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const { dishes } = useMasters()
  const { ingredients, saveIngredient, deleteIngredient } = usePos()
  const { suppliers } = usePurchasing()
  const stockLocations = useStockLocations()
  const [searchParams, setSearchParams] = useSearchParams()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const vendorOptions = useMemo(
    () =>
      suppliers
        .filter((s) => s.active)
        .map((s) => ({ value: s.id, label: s.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [suppliers],
  )

  const locationOptions = useMemo(
    () =>
      stockLocations
        .filter((l) => l.active)
        .map((l) => ({
          value: l.id,
          label: l.label,
        })),
    [stockLocations],
  )

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | string>('all')
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [categoryTick, setCategoryTick] = useState(0)
  const [quickCategory, setQuickCategory] = useState<{ name: string } | null>(null)
  const [quickLocation, setQuickLocation] = useState<{
    name: string
    type: StockLocationType
  } | null>(null)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  useEffect(() => {
    const refresh = () => setCategoryTick((n) => n + 1)
    window.addEventListener(INGREDIENT_CATEGORIES_CHANGED, refresh)
    return () => window.removeEventListener(INGREDIENT_CATEGORIES_CHANGED, refresh)
  }, [])

  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId || editing) return
    const row = ingredients.find((r) => r.id === editId)
    if (row) {
      setIsNew(false)
      setEditing({ ...row })
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, ingredients, editing, setSearchParams])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...ingredients]
      .filter((r) => {
        const cat = canonicalizeIngredientCategory(r.category)
        if (category !== 'all' && cat !== category) return false
        if (!q) return true
        return (
          r.name.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [ingredients, query, category])

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of ingredients) {
      const cat = canonicalizeIngredientCategory(r.category)
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return map
  }, [ingredients])

  const filterCategories = useMemo(() => {
    const fromData = [...categoryCounts.keys()].filter((c) => (categoryCounts.get(c) ?? 0) > 0)
    const catalog = listIngredientCategories(ingredients.map((r) => r.category))
    const ordered = [
      ...catalog.filter((c) => fromData.includes(c)),
      ...fromData.filter((c) => !catalog.includes(c)).sort((a, b) => a.localeCompare(b)),
    ]
    if (category !== 'all' && !ordered.includes(category)) ordered.push(category)
    return ordered
  }, [categoryCounts, category, ingredients, categoryTick])

  const categorySelectOptions = useMemo(() => {
    const catalog = listIngredientCategories(ingredients.map((r) => r.category))
    const current = editing?.category ? canonicalizeIngredientCategory(editing.category) : ''
    const all =
      current && !catalog.some((c) => c.toLowerCase() === current.toLowerCase())
        ? [...catalog, current]
        : catalog
    return all.map((c) => ({ value: c, label: c }))
  }, [ingredients, editing?.category, categoryTick])

  function openQuickCategory() {
    setQuickCategory({ name: '' })
  }

  function saveQuickCategory() {
    if (!quickCategory || !editing) return
    const result = addIngredientCategory(quickCategory.name)
    if (!result.ok) {
      flash(result.error, 'err')
      if (result.existing) {
        setEditing({ ...editing, category: result.existing })
      }
      return
    }
    setEditing({ ...editing, category: result.name })
    setQuickCategory(null)
    flash(`Category “${result.name}” added`)
  }

  function openQuickLocation() {
    setQuickLocation({ name: '', type: 'other' })
  }

  function saveQuickLocation() {
    if (!quickLocation || !editing) return
    const result = addStockLocationQuick(quickLocation.name, quickLocation.type)
    if (!result.ok) {
      flash(result.error, 'err')
      if (result.existing) {
        setEditing({ ...editing, defaultLocationId: result.existing.id })
      }
      return
    }
    setEditing({ ...editing, defaultLocationId: result.location.id })
    setQuickLocation(null)
    flash(`Location “${result.location.label}” added`)
  }

  function startAdd() {
    setIsNew(true)
    setEditing(emptyRow(nextIngredientSku(ingredients)))
  }

  function startEdit(row: Ingredient) {
    setIsNew(false)
    setEditing(
      normalizeIngredient({
        ...row,
        category: canonicalizeIngredientCategory(row.category),
      }),
    )
  }

  function setPrimaryVendor(vendorId: string) {
    if (!editing) return
    const name = vendorOptions.find((o) => o.value === vendorId)?.label ?? ''
    const links = [...(editing.vendorLinks ?? [])]
    const existing = links.find((l) => l.vendorId === vendorId)
    const primaryPrice = existing?.unitPrice
    const alternates = links
      .filter((l) => l.vendorId !== vendorId)
      .map((l) => ({ ...l, primary: false }))
    const nextLinks: IngredientVendorLink[] = vendorId
      ? [{ vendorId, vendor: name || undefined, unitPrice: primaryPrice, primary: true }, ...alternates]
      : alternates
    setEditing({
      ...editing,
      vendorId: vendorId || undefined,
      vendor: name || undefined,
      vendorLinks: nextLinks.length ? nextLinks : undefined,
    })
  }

  function setPrimaryUnitPrice(raw: string) {
    if (!editing?.vendorId) return
    const unitPrice = raw === '' ? undefined : Math.max(0, Number(raw) || 0)
    const links = (editing.vendorLinks ?? []).map((l) =>
      l.vendorId === editing.vendorId ? { ...l, unitPrice } : l,
    )
    if (!links.some((l) => l.vendorId === editing.vendorId)) {
      links.unshift({
        vendorId: editing.vendorId,
        vendor: editing.vendor,
        unitPrice,
        primary: true,
      })
    }
    setEditing({ ...editing, vendorLinks: links })
  }

  function addAlternateVendor() {
    if (!editing) return
    const pick = vendorOptions.find(
      (o) =>
        o.value !== editing.vendorId &&
        !(editing.vendorLinks ?? []).some((l) => l.vendorId === o.value),
    )
    if (!pick) {
      flash('No more vendors to add')
      return
    }
    const links: IngredientVendorLink[] = [
      ...(editing.vendorLinks ?? []),
      { vendorId: pick.value, vendor: pick.label, primary: false },
    ]
    setEditing({ ...editing, vendorLinks: links })
  }

  function updateAlternateVendor(idx: number, vendorId: string) {
    if (!editing) return
    const alternates = (editing.vendorLinks ?? []).filter((l) => !l.primary)
    const row = alternates[idx]
    if (!row) return
    if (
      vendorId === editing.vendorId ||
      alternates.some((l, i) => i !== idx && l.vendorId === vendorId)
    ) {
      flash('Vendor already linked to this ingredient')
      return
    }
    const name = vendorOptions.find((o) => o.value === vendorId)?.label ?? ''
    alternates[idx] = { ...row, vendorId, vendor: name || undefined }
    const primary = (editing.vendorLinks ?? []).find((l) => l.primary)
    setEditing({
      ...editing,
      vendorLinks: primary ? [primary, ...alternates] : alternates,
    })
  }

  function updateAlternatePrice(idx: number, raw: string) {
    if (!editing) return
    const unitPrice = raw === '' ? undefined : Math.max(0, Number(raw) || 0)
    const alternates = (editing.vendorLinks ?? []).filter((l) => !l.primary)
    alternates[idx] = { ...alternates[idx], unitPrice }
    const primary = (editing.vendorLinks ?? []).find((l) => l.primary)
    setEditing({
      ...editing,
      vendorLinks: primary ? [primary, ...alternates] : alternates,
    })
  }

  function removeAlternateVendor(idx: number) {
    if (!editing) return
    const alternates = (editing.vendorLinks ?? []).filter((l) => !l.primary)
    alternates.splice(idx, 1)
    const primary = (editing.vendorLinks ?? []).find((l) => l.primary)
    setEditing({
      ...editing,
      vendorLinks: primary ? [primary, ...alternates] : alternates.length ? alternates : undefined,
    })
  }

  function save() {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) {
      flash('Ingredient name is required')
      return
    }
    const sku = editing.sku.trim() || nextIngredientSku(ingredients.filter((i) => i.id !== editing.id))
    if (isIngredientNameTaken(ingredients, name, editing.id)) {
      flash('Ingredient name already exists')
      return
    }
    if (isIngredientSkuTaken(ingredients, sku, editing.id)) {
      flash('SKU / code already exists')
      return
    }
    saveIngredient(
      normalizeIngredient({
        ...editing,
        name,
        sku,
        category: canonicalizeIngredientCategory(editing.category) || 'General',
      }),
    )
    setEditing(null)
    flash(isNew ? `Ingredient “${name}” added` : `Ingredient “${name}” saved`)
  }

  function remove() {
    if (!editing || isNew) return
    const used = dishes.some((d) =>
      (d.recipe ?? []).some((line) => recipeLineIngredientId(line) === editing.id),
    )
    if (used) {
      flash('Remove this ingredient from dish recipes before deleting')
      return
    }
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deleteIngredient(editing.id)
        setEditing(null)
        flash('Ingredient deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Ingredient master locked</strong>
          <div style={{ marginTop: '1rem' }}>
            <Link to={settingsHubPath('ingredients')} className="btn btn-ghost">
              Back
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-ing">
      <HubHeader closeTo={settingsHubPath('ingredients')} />

      <div className="zk-ing-bar">
        <div className="zk-ing-bar-text">
          <h1>{t.setIngredientList}</h1>
          <p>{t.setIngredientListHint}</p>
        </div>
        <div className="zk-ing-bar-actions">
          <label className="zk-ing-search">
            <span className="sr-only">Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, SKU, category…"
              aria-label="Search ingredients"
            />
          </label>
          <button type="button" className="zk-ing-add" onClick={startAdd} title="Add ingredient">
            +
          </button>
        </div>
      </div>

      <div className="zk-ing-filters" role="tablist" aria-label="Category filter">
        <button
          type="button"
          className={category === 'all' ? 'on' : ''}
          onClick={() => setCategory('all')}
        >
          All <em>{ingredients.length}</em>
        </button>
        {filterCategories.map((c) => (
          <button
            key={c}
            type="button"
            className={category === c ? 'on' : ''}
            onClick={() => setCategory(c)}
          >
            {c} <em>{categoryCounts.get(c) ?? 0}</em>
          </button>
        ))}
      </div>

      <div className="zk-ing-body">
        {filtered.length === 0 ? (
          <div className="zk-ing-empty">
            <strong>{ingredients.length ? 'No matches' : 'No ingredients yet'}</strong>
            <span>
              {ingredients.length
                ? 'Try another search or category.'
                : 'Tap + to define items used in recipes.'}
            </span>
            {!ingredients.length ? (
              <button type="button" className="btn btn-teal" onClick={startAdd}>
                Add ingredient
              </button>
            ) : null}
          </div>
        ) : (
          <div className="zk-ing-grid">
            {filtered.map((row) => {
              const norm = normalizeIngredient(row)
              const vendorCount = norm.vendorLinks?.length ?? 0
              const primaryName = norm.vendor?.trim()
              const extras = alternateVendorCount(norm)
              const unitPrice = primaryVendorUnitPrice(norm)
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`zk-ing-card${!row.active ? ' off' : ''}`}
                  onClick={() => startEdit(row)}
                >
                  <span className="zk-ing-card-mark" aria-hidden>
                    {row.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="zk-ing-card-main">
                    <strong>{row.name}</strong>
                    <small>
                      {row.sku} · {row.unit}
                      {(row.reorderAt ?? 0) > 0 ? ` · par ${row.reorderAt}` : ''}
                      {row.defaultLocationId
                        ? ` · ${stockLocationLabel(row.defaultLocationId)}`
                        : ''}
                    </small>
                    {primaryName ? (
                      <span className="zk-ing-card-vendors">
                        <span className="zk-ing-vendor-chip primary" title="Preferred vendor">
                          {primaryName}
                          {unitPrice != null ? (
                            <em className="mesa-ltr-nums">{unitPrice.toFixed(2)}</em>
                          ) : null}
                        </span>
                        {extras > 0 ? (
                          <span
                            className="zk-ing-vendor-chip more"
                            title={(norm.vendorLinks ?? [])
                              .filter((l) => !l.primary)
                              .map((l) => l.vendor || l.vendorId)
                              .join(', ')}
                          >
                            +{extras} vendor{extras === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </span>
                    ) : vendorCount === 0 ? (
                      <span className="zk-ing-card-vendors muted">No vendor set</span>
                    ) : null}
                  </span>
                  <span className={categoryBadgeClass(row.category, row.active)}>
                    {row.active ? canonicalizeIngredientCategory(row.category) : 'Inactive'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <HubFooter backTo={settingsHubPath('ingredients')} backLabel={t.ingredients} />

      {editing ? (
        <div className="zk-ing-modal" role="dialog" aria-modal="true">
          <div className="zk-ing-sheet zk-ing-sheet-wide">
            <div className="zk-ing-sheet-head">
              <h2>{isNew ? 'New ingredient' : `Edit ${editing.name.trim() || 'ingredient'}`}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>

            <div className="zk-ing-sheet-body">
            <div className="zk-ing-form">
              <label>
                <span>SKU / code</span>
                <input
                  className="search mesa-ltr-nums"
                  value={editing.sku}
                  onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                  placeholder="Auto or type your own"
                />
              </label>
              <label>
                <span>
                  Name <Req />
                </span>
                <input
                  className="search"
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label>
                <span>Unit</span>
                <input
                  className="search"
                  value={editing.unit}
                  onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                  placeholder="kg, L, pcs…"
                />
              </label>
              <label>
                <span>{t.reorderLevel}</span>
                <input
                  className="search mesa-ltr-nums"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={editing.reorderAt ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      reorderAt:
                        e.target.value === '' ? 0 : Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
                <small className="zk-ing-hint">
                  {t.reorderLevelHint} ({editing.unit || 'unit'})
                </small>
              </label>
              <label>
                <span>{t.defaultStorageLocation}</span>
                <div className="zk-ing-select-add">
                  <MesaSelect
                    value={
                      editing.defaultLocationId &&
                      locationOptions.some((o) => o.value === editing.defaultLocationId)
                        ? editing.defaultLocationId
                        : ''
                    }
                    onChange={(v) =>
                      setEditing({
                        ...editing,
                        defaultLocationId: v || undefined,
                      })
                    }
                    options={locationOptions}
                    placeholder={t.defaultStorageLocationPlaceholder}
                  />
                  <button
                    type="button"
                    className="zk-ing-quick-add"
                    title="Add storage location"
                    aria-label="Add storage location"
                    onClick={openQuickLocation}
                  >
                    +
                  </button>
                </div>
                <small className="zk-ing-hint">{t.defaultStorageLocationHint}</small>
              </label>
              <label>
                <span>Category</span>
                <div className="zk-ing-select-add">
                  <MesaSelect
                    value={canonicalizeIngredientCategory(editing.category)}
                    onChange={(v) => setEditing({ ...editing, category: v })}
                    options={categorySelectOptions}
                    placeholder="Select category"
                  />
                  <button
                    type="button"
                    className="zk-ing-quick-add"
                    title="Add category"
                    aria-label="Add category"
                    onClick={openQuickCategory}
                  >
                    +
                  </button>
                </div>
              </label>
              <label>
                <span>{t.preferredVendor}</span>
                <MesaSelect
                  value={
                    editing.vendorId &&
                    vendorOptions.some((o) => o.value === editing.vendorId)
                      ? editing.vendorId
                      : vendorOptions.find((o) => o.label === editing.vendor)?.value || ''
                  }
                  onChange={setPrimaryVendor}
                  options={vendorOptions}
                  placeholder={t.preferredVendorPlaceholder}
                />
                <small className="zk-ing-hint">{t.preferredVendorHint}</small>
              </label>
              {editing.vendorId ? (
                <label>
                  <span>{t.vendorUnitPrice}</span>
                  <input
                    className="search mesa-ltr-nums"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={
                      editing.vendorLinks?.find((l) => l.vendorId === editing.vendorId)?.unitPrice ??
                      ''
                    }
                    onChange={(e) => setPrimaryUnitPrice(e.target.value)}
                  />
                  <small className="zk-ing-hint">
                    {t.vendorUnitPriceHint} ({editing.unit || 'unit'})
                  </small>
                </label>
              ) : null}
              <div className="zk-ing-vendors">
                <div className="zk-ing-vendors-head">
                  <span>{t.alternateVendors}</span>
                  <button
                    type="button"
                    className="btn btn-ghost zk-ing-vendors-add"
                    onClick={addAlternateVendor}
                    disabled={!vendorOptions.length}
                  >
                    + {t.addAlternateVendor}
                  </button>
                </div>
                {(editing.vendorLinks ?? []).filter((l) => !l.primary).length === 0 ? (
                  <p className="zk-ing-form-note">{t.alternateVendorsEmpty}</p>
                ) : (
                  <div className="zk-ing-vendors-table" role="table">
                    <div className="zk-ing-vendors-row head" role="row">
                      <span role="columnheader">{t.vendorTitle}</span>
                      <span role="columnheader">{t.vendorUnitPrice}</span>
                      <span role="columnheader" className="sr-only">
                        Remove
                      </span>
                    </div>
                    {(editing.vendorLinks ?? [])
                      .filter((l) => !l.primary)
                      .map((link, idx) => (
                        <div key={link.vendorId} className="zk-ing-vendors-row" role="row">
                          <MesaSelect
                            value={link.vendorId}
                            onChange={(id) => updateAlternateVendor(idx, id)}
                            options={vendorOptions.filter((o) => {
                              const used = new Set(
                                (editing.vendorLinks ?? [])
                                  .filter((l) => l.vendorId !== link.vendorId)
                                  .map((l) => l.vendorId),
                              )
                              if (editing.vendorId) used.add(editing.vendorId)
                              return !used.has(o.value) || o.value === link.vendorId
                            })}
                            aria-label={`Alternate vendor ${idx + 1}`}
                          />
                          <input
                            className="search mesa-ltr-nums"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            aria-label={`Unit price for ${link.vendor ?? 'vendor'}`}
                            value={link.unitPrice ?? ''}
                            onChange={(e) => updateAlternatePrice(idx, e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost zk-ing-vendors-remove"
                            aria-label="Remove alternate vendor"
                            onClick={() => removeAlternateVendor(idx)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
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
      {quickCategory ? (
        <div
          className="zk-products-quick-modal zk-ing-quick-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Add category"
        >
          <div className="zk-products-quick-sheet">
            <div className="zk-products-quick-head">
              <strong>New category</strong>
              <button type="button" className="btn btn-ghost" onClick={() => setQuickCategory(null)}>
                ×
              </button>
            </div>
            <div className="zk-products-quick-body">
              <label>
                <span>Category name</span>
                <input
                  className="search"
                  autoFocus
                  value={quickCategory.name}
                  placeholder="e.g. Frozen, Bakery"
                  onChange={(e) => setQuickCategory({ name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveQuickCategory()
                    }
                  }}
                />
                <small className="zk-ing-hint">Must be unique — duplicates are blocked.</small>
              </label>
            </div>
            <div className="zk-products-quick-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setQuickCategory(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-teal" onClick={saveQuickCategory}>
                Add category
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quickLocation ? (
        <div
          className="zk-products-quick-modal zk-ing-quick-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Add storage location"
        >
          <div className="zk-products-quick-sheet">
            <div className="zk-products-quick-head">
              <strong>New storage location</strong>
              <button type="button" className="btn btn-ghost" onClick={() => setQuickLocation(null)}>
                ×
              </button>
            </div>
            <div className="zk-products-quick-body">
              <label>
                <span>Location name</span>
                <input
                  className="search"
                  autoFocus
                  value={quickLocation.name}
                  placeholder="e.g. Freezer 2, Prep sink"
                  onChange={(e) => setQuickLocation({ ...quickLocation, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveQuickLocation()
                    }
                  }}
                />
                <small className="zk-ing-hint">Must be unique — duplicates are blocked.</small>
              </label>
              <label>
                <span>Type</span>
                <MesaSelect
                  value={quickLocation.type}
                  onChange={(v) =>
                    setQuickLocation({ ...quickLocation, type: v as StockLocationType })
                  }
                  options={LOCATION_TYPE_OPTIONS}
                />
              </label>
            </div>
            <div className="zk-products-quick-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setQuickLocation(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-teal" onClick={saveQuickLocation}>
                Add location
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmDialog}
    </div>
  )
}
