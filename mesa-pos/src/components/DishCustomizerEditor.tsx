import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import MesaSelect from './MesaSelect'
import type { ItemCustomizer, MasterDish } from '../data/masters'
import { getAddonGroups, withSyncedBasePrice } from '../data/masters'
import {
  activeAddonMasters,
  attachMasterGroup,
} from '../data/addonMasters'
import { useCatalog } from '../state/CatalogContext'

type IngredientLike = { id: string; name: string; unit: string; active: boolean }
type StockLike = { id: string; name: string }

type Props = {
  dish: MasterDish
  onChange: (dish: MasterDish) => void
  ingredients: IngredientLike[]
  dishes: MasterDish[]
  stock?: StockLike[]
  /** Compact styles for products modal */
  variant?: 'masters' | 'products'
}

export function emptyCustomizer(basePrice = 29): ItemCustomizer {
  const t = Date.now()
  return {
    title: 'Choose options',
    variationLabel: 'Variation',
    variations: [
      { id: `v-${t}-1`, name: 'Small', price: Math.max(0, basePrice) },
      { id: `v-${t}-2`, name: 'Medium', price: Math.max(0, basePrice + 20) },
      { id: `v-${t}-3`, name: 'Large', price: Math.max(0, basePrice + 40) },
    ],
    addonGroups: [
      {
        id: `g-${t}`,
        name: 'Addons',
        appendVariationName: true,
        min: 0,
        max: 4,
        addons: [
          { id: `a-${t}-1`, name: 'Onion', price: 0 },
          { id: `a-${t}-2`, name: 'Tomato', price: 0 },
          { id: `a-${t}-3`, name: 'Mushroom', price: 3 },
          { id: `a-${t}-4`, name: 'Extra cheese', price: 6 },
        ],
      },
    ],
  }
}

function withAddonGroups(customizer: ItemCustomizer) {
  const groups = getAddonGroups(customizer)
  if (groups.length) return groups
  return [
    {
      id: `g-${Date.now()}`,
      name: 'Addons',
      appendVariationName: true as const,
      min: 0,
      max: 4,
      addons: [],
    },
  ]
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function appendTopping(
  dish: MasterDish,
  topping: { name: string; price: number },
  groupIndex = 0,
): MasterDish {
  if (!dish.customizer) return dish
  const groups = withAddonGroups(dish.customizer)
  const gi = Math.min(Math.max(0, groupIndex), Math.max(0, groups.length - 1))
  return {
    ...dish,
    customizer: {
      ...dish.customizer,
      addonGroups: groups.map((g, i) =>
        i === gi
          ? {
              ...g,
              addons: [
                ...g.addons,
                { id: newId('a'), name: topping.name, price: topping.price },
              ],
            }
          : g,
      ),
    },
  }
}

export default function DishCustomizerEditor({
  dish,
  onChange,
  ingredients,
  dishes,
  stock = [],
  variant = 'masters',
}: Props) {
  const { addonMasters } = useCatalog()
  const masterGroups = useMemo(() => activeAddonMasters(addonMasters), [addonMasters])
  const attachedMasterIds = useMemo(() => {
    if (!dish.customizer) return new Set<string>()
    const ids = new Set<string>()
    for (const g of getAddonGroups(dish.customizer)) {
      if (g.id.startsWith('from-')) ids.add(g.id.slice(5))
    }
    return ids
  }, [dish.customizer])

  const enabled = Boolean(dish.customizer)
  const rootClass =
    variant === 'products' ? 'mst-block mst-customizer-editor zk-cz-in-products' : 'mst-block mst-customizer-editor'

  const toppingPickOptions = useMemo(() => {
    if (!dish.customizer) return [] as { value: string; label: string }[]
    const used = new Set(
      withAddonGroups(dish.customizer)
        .flatMap((g) => g.addons.map((a) => a.name.trim().toLowerCase()))
        .filter(Boolean),
    )
    const seen = new Set<string>()
    const opts: { value: string; label: string }[] = []

    for (const ing of ingredients.filter((i) => i.active)) {
      const key = ing.name.trim().toLowerCase()
      if (!key || used.has(key) || seen.has(key)) continue
      seen.add(key)
      opts.push({ value: `ing:${ing.id}`, label: `${ing.name} (${ing.unit})` })
    }
    for (const d of dishes) {
      if (!d.customizer || d.id === dish.id) continue
      for (const g of getAddonGroups(d.customizer)) {
        for (const a of g.addons) {
          const key = a.name.trim().toLowerCase()
          if (!key || used.has(key) || seen.has(key)) continue
          seen.add(key)
          opts.push({
            value: `name:${encodeURIComponent(a.name)}:${a.price}`,
            label: `${a.name} · ${a.price}`,
          })
        }
      }
    }
    opts.sort((a, b) => a.label.localeCompare(b.label))
    opts.push({ value: '__custom__', label: 'Custom topping…' })
    return opts
  }, [dish, ingredients, dishes])

  function setCustomizer(next: ItemCustomizer | undefined) {
    onChange(withSyncedBasePrice({ ...dish, customizer: next }))
  }

  function attachMaster(masterId: string) {
    const master = masterGroups.find((m) => m.id === masterId)
    if (!master || !dish.customizer) return
    const groups = withAddonGroups(dish.customizer)
    setCustomizer({
      ...dish.customizer,
      addonGroups: attachMasterGroup(groups, master),
    })
  }

  function pickTopping(v: string, groupIndex: number) {
    if (!v || !dish.customizer) return
    if (v === '__custom__') {
      onChange(appendTopping(dish, { name: 'New topping', price: 0 }, groupIndex))
      return
    }
    if (v.startsWith('ing:')) {
      const id = v.slice('ing:'.length)
      const item = ingredients.find((i) => i.id === id)
      if (!item) return
      onChange(appendTopping(dish, { name: item.name, price: 0 }, groupIndex))
      return
    }
    if (v.startsWith('stock:')) {
      const id = v.slice('stock:'.length)
      const item = stock.find((s) => s.id === id)
      if (!item) return
      onChange(appendTopping(dish, { name: item.name, price: 0 }, groupIndex))
      return
    }
    if (v.startsWith('name:')) {
      const rest = v.slice('name:'.length)
      const lastColon = rest.lastIndexOf(':')
      const rawName = lastColon >= 0 ? rest.slice(0, lastColon) : rest
      const rawPrice = lastColon >= 0 ? rest.slice(lastColon + 1) : '0'
      let name = rawName
      try {
        name = decodeURIComponent(rawName)
      } catch {
        /* keep raw */
      }
      onChange(appendTopping(dish, { name, price: Number(rawPrice) || 0 }, groupIndex))
    }
  }

  return (
    <div className={rootClass}>
      <div className="mst-cz-enable-row">
        <div>
          <strong>Custom options</strong>
          <p className="mst-hint">
            Enable for pizza sizes & toppings. On POS the item shows <em>Opts</em> instead of Note.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className={`zk-user-switch${enabled ? ' on' : ''}`}
          onClick={() =>
            setCustomizer(enabled ? undefined : emptyCustomizer(Number(dish.price) || 29))
          }
        >
          <i aria-hidden />
          <strong>{enabled ? 'Enabled' : 'Off'}</strong>
        </button>
      </div>

      {dish.customizer ? (
        <>
          <div className="mst-cz-section">
            <div className="mst-cz-head">
              <strong>Variations (size / price)</strong>
              <button
                type="button"
                className="mst-btn ghost"
                onClick={() => {
                  const cz = dish.customizer!
                  setCustomizer({
                    ...cz,
                    variations: [
                      ...cz.variations,
                      { id: newId('v'), name: 'New size', price: dish.price },
                    ],
                  })
                }}
              >
                + Size
              </button>
            </div>
            <p className="mst-hint" style={{ marginTop: 0 }}>
              First size is the menu base price. POS charges the selected size (+ addons).
            </p>
            {dish.customizer.variations.map((v, vi) => (
              <div key={v.id} className="mst-recipe-row">
                <input
                  className="mst-input"
                  value={v.name}
                  aria-label={`Variation ${vi + 1} name`}
                  placeholder="Small / Medium / Large"
                  onChange={(e) => {
                    const cz = dish.customizer!
                    setCustomizer({
                      ...cz,
                      variations: cz.variations.map((row, i) =>
                        i === vi ? { ...row, name: e.target.value } : row,
                      ),
                    })
                  }}
                />
                <input
                  className="mst-input mesa-ltr-nums"
                  type="number"
                  step="0.01"
                  min={0}
                  value={v.price}
                  aria-label={`Variation ${vi + 1} price`}
                  onChange={(e) => {
                    const cz = dish.customizer!
                    const price = Number(e.target.value) || 0
                    setCustomizer({
                      ...cz,
                      variations: cz.variations.map((row, i) =>
                        i === vi ? { ...row, price } : row,
                      ),
                    })
                  }}
                />
                <button
                  type="button"
                  className="mst-btn ghost"
                  title="Remove size"
                  aria-label="Remove size"
                  disabled={(dish.customizer?.variations.length ?? 0) <= 1}
                  onClick={() => {
                    const cz = dish.customizer!
                    setCustomizer({
                      ...cz,
                      variations: cz.variations.filter((_, i) => i !== vi),
                    })
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {withAddonGroups(dish.customizer).map((g, gi) => (
            <div key={g.id} className="mst-topping-group mst-cz-section">
              <div className="mst-cz-head">
                <input
                  className="mst-input"
                  value={g.name}
                  aria-label={`Addon group ${gi + 1} name`}
                  placeholder="Group name (Addons, Cheese…)"
                  onChange={(e) => {
                    const groups = withAddonGroups(dish.customizer!)
                    setCustomizer({
                      ...dish.customizer!,
                      addonGroups: groups.map((grp, gIdx) =>
                        gIdx === gi ? { ...grp, name: e.target.value } : grp,
                      ),
                    })
                  }}
                />
                <label className="mst-cz-minmax">
                  Min
                  <input
                    className="mst-input mesa-ltr-nums"
                    type="number"
                    min={0}
                    value={g.min}
                    onChange={(e) => {
                      const groups = withAddonGroups(dish.customizer!)
                      const min = Math.max(0, Number(e.target.value) || 0)
                      setCustomizer({
                        ...dish.customizer!,
                        addonGroups: groups.map((grp, gIdx) =>
                          gIdx === gi ? { ...grp, min, max: Math.max(min, grp.max) } : grp,
                        ),
                      })
                    }}
                  />
                </label>
                <label className="mst-cz-minmax">
                  Max
                  <input
                    className="mst-input mesa-ltr-nums"
                    type="number"
                    min={0}
                    value={g.max}
                    onChange={(e) => {
                      const groups = withAddonGroups(dish.customizer!)
                      const max = Math.max(0, Number(e.target.value) || 0)
                      setCustomizer({
                        ...dish.customizer!,
                        addonGroups: groups.map((grp, gIdx) =>
                          gIdx === gi ? { ...grp, max, min: Math.min(grp.min, max) } : grp,
                        ),
                      })
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="mst-btn ghost"
                  title="Remove group"
                  aria-label="Remove group"
                  disabled={withAddonGroups(dish.customizer!).length <= 1}
                  onClick={() => {
                    const groups = withAddonGroups(dish.customizer!)
                    setCustomizer({
                      ...dish.customizer!,
                      addonGroups: groups.filter((_, gIdx) => gIdx !== gi),
                    })
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="mst-cz-col-labels" aria-hidden>
                <span>Addon name</span>
                <span>Price</span>
                <span />
              </div>

              {g.addons.length === 0 ? (
                <p className="mst-hint">No addons yet — use + Add topping below.</p>
              ) : (
                g.addons.map((a, ai) => (
                  <div key={a.id} className="mst-recipe-row">
                    <input
                      className="mst-input"
                      value={a.name}
                      aria-label={`Topping ${ai + 1} name`}
                      placeholder="Topping name"
                      onChange={(e) => {
                        const groups = withAddonGroups(dish.customizer!)
                        setCustomizer({
                          ...dish.customizer!,
                          addonGroups: groups.map((grp, gIdx) =>
                            gIdx === gi
                              ? {
                                  ...grp,
                                  addons: grp.addons.map((ad, aIdx) =>
                                    aIdx === ai ? { ...ad, name: e.target.value } : ad,
                                  ),
                                }
                              : grp,
                          ),
                        })
                      }}
                    />
                    <input
                      className="mst-input mesa-ltr-nums"
                      type="number"
                      step="0.01"
                      min={0}
                      value={a.price}
                      aria-label={`Topping ${ai + 1} price`}
                      onChange={(e) => {
                        const groups = withAddonGroups(dish.customizer!)
                        const price = Number(e.target.value) || 0
                        setCustomizer({
                          ...dish.customizer!,
                          addonGroups: groups.map((grp, gIdx) =>
                            gIdx === gi
                              ? {
                                  ...grp,
                                  addons: grp.addons.map((ad, aIdx) =>
                                    aIdx === ai ? { ...ad, price } : ad,
                                  ),
                                }
                              : grp,
                          ),
                        })
                      }}
                    />
                    <button
                      type="button"
                      className="mst-btn ghost"
                      title="Remove topping"
                      aria-label="Remove topping"
                      onClick={() => {
                        const groups = withAddonGroups(dish.customizer!)
                        setCustomizer({
                          ...dish.customizer!,
                          addonGroups: groups.map((grp, gIdx) =>
                            gIdx === gi
                              ? {
                                  ...grp,
                                  addons: grp.addons.filter((_, aIdx) => aIdx !== ai),
                                }
                              : grp,
                          ),
                        })
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}

              <div className="mst-topping-pick">
                <MesaSelect
                  value=""
                  placeholder="+ Add topping"
                  aria-label={`Add topping to ${g.name}`}
                  options={toppingPickOptions}
                  onChange={(v) => pickTopping(v, gi)}
                />
              </div>
            </div>
          ))}

          <div className="mst-cz-section">
            <div className="mst-cz-head">
              <strong>From Addons master</strong>
              <Link to="/settings/addons" className="mst-btn ghost">
                Manage
              </Link>
            </div>
            {masterGroups.length === 0 ? (
              <p className="mst-hint">
                No shared groups yet — create them in{' '}
                <Link to="/settings/addons">Addons master</Link>, then attach here.
              </p>
            ) : (
              <div className="mst-addon-master-attach">
                {masterGroups.map((m) => {
                  const attached = attachedMasterIds.has(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`mst-btn${attached ? '' : ' ghost'}`}
                      onClick={() => attachMaster(m.id)}
                      title={
                        attached
                          ? 'Replace this group on the dish with the latest master'
                          : 'Attach this group to the dish'
                      }
                    >
                      {attached ? 'Refresh · ' : 'Attach · '}
                      {m.name}
                      <span className="muted"> ({m.addons.length})</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            className="mst-btn ghost"
            onClick={() => {
              const groups = withAddonGroups(dish.customizer!)
              setCustomizer({
                ...dish.customizer!,
                addonGroups: [
                  ...groups,
                  {
                    id: newId('g'),
                    name: 'New group',
                    appendVariationName: false,
                    min: 0,
                    max: 1,
                    addons: [],
                  },
                ],
              })
            }}
          >
            + Addon group
          </button>

          {!ingredients.length ? (
            <p className="mst-hint">
              Tip: add items in <Link to="/settings/ingredients/list">Ingredient Master</Link> first.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
