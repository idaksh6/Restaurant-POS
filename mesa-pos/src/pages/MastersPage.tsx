import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import MesaSelect from '../components/MesaSelect'
import { getActiveBranchId } from '../data/company'
import type { ItemCustomizer, MasterDish, MenuCategory } from '../data/masters'
import { getAddonGroups, isDishCodeTaken, nextUniqueDishCode, recipeLineIngredientId, withSyncedBasePrice } from '../data/masters'
import { money } from '../data/mock'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'

type Tab = 'categories' | 'dishes'

function parseMastersTab(value: string | null): Tab {
  return value === 'dishes' ? 'dishes' : 'categories'
}
type StatusFilter = 'all' | 'active' | 'inactive'
type CatDishFilter = 'all' | 'with' | 'empty'
type FlagFilter = 'all' | 'popular' | 'options' | 'recipe' | 'none'
type DishSort = 'name' | 'price-asc' | 'price-desc' | 'code'

const PAGE_SIZE = 10
const CAT_TONES = ['#0f766e', '#0369a1', '#b45309', '#047857', '#0e7490', '#be123c', '#115e59', '#a16207']

function categoryPathLabel(
  cat: MenuCategory | undefined,
  byId: Map<string, MenuCategory>,
): { main: string; sub: string | null; full: string } {
  if (!cat) return { main: '—', sub: null, full: '—' }
  if (!cat.parentId) return { main: cat.name, sub: null, full: cat.name }
  const parent = byId.get(cat.parentId)
  if (!parent) return { main: cat.name, sub: null, full: cat.name }
  return { main: parent.name, sub: cat.name, full: `${parent.name} › ${cat.name}` }
}

function buildCategorySelectOptions(
  cats: MenuCategory[],
  opts?: { includeAll?: boolean; allLabel?: string; offSuffix?: string },
) {
  const byId = new Map(cats.map((c) => [c.id, c]))
  const mains = cats
    .filter((c) => !c.parentId)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  const out: { value: string; label: string }[] = []
  if (opts?.includeAll) {
    out.push({ value: 'all', label: opts.allLabel ?? 'All categories' })
  }
  const off = opts?.offSuffix ?? '(off)'
  const used = new Set<string>()
  for (const main of mains) {
    used.add(main.id)
    out.push({
      value: main.id,
      label: main.active ? main.name : `${main.name} ${off}`,
    })
    const children = cats
      .filter((c) => c.parentId === main.id)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    for (const sub of children) {
      used.add(sub.id)
      const path = categoryPathLabel(sub, byId).full
      out.push({
        value: sub.id,
        label: sub.active ? path : `${path} ${off}`,
      })
    }
  }
  for (const c of cats) {
    if (used.has(c.id)) continue
    const path = categoryPathLabel(c, byId).full
    out.push({
      value: c.id,
      label: c.active ? path : `${path} ${off}`,
    })
  }
  return out
}

function dishInCategoryFilter(
  dish: MasterDish,
  filterId: string,
  byId: Map<string, MenuCategory>,
) {
  if (filterId === 'all') return true
  if (dish.categoryId === filterId) return true
  const cat = byId.get(dish.categoryId)
  return Boolean(cat?.parentId && cat.parentId === filterId)
}

function toneForCategory(cat: MenuCategory) {
  if (cat.buttonColor?.trim()) return cat.buttonColor.trim()
  let h = 0
  for (let i = 0; i < cat.name.length; i++) h = (h + cat.name.charCodeAt(i) * (i + 3)) % 997
  return CAT_TONES[h % CAT_TONES.length]
}

function MstIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="mst-ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function IconFolders() {
  return (
    <MstIcon>
      <path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2" />
    </MstIcon>
  )
}

function IconPlate() {
  return (
    <MstIcon>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20" />
    </MstIcon>
  )
}

function IconCheck() {
  return (
    <MstIcon>
      <path d="M20 7 10 17l-5-5" />
    </MstIcon>
  )
}

function IconSliders() {
  return (
    <MstIcon>
      <path d="M4 7h10M16 7h4M4 17h4M10 17h10M14 4v6M8 14v6" />
    </MstIcon>
  )
}

function IconSearch() {
  return (
    <MstIcon>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16.2 16.2 3.3 3.3" />
    </MstIcon>
  )
}

function IconPlus() {
  return (
    <MstIcon>
      <path d="M12 5v14M5 12h14" />
    </MstIcon>
  )
}

function IconEdit() {
  return (
    <MstIcon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
    </MstIcon>
  )
}

function IconDrink() {
  return (
    <MstIcon>
      <path d="M7 4h10l-1.2 14.2A2 2 0 0 1 13.8 20h-3.6a2 2 0 0 1-2-1.8L7 4Z" />
      <path d="M9 9h6" />
    </MstIcon>
  )
}

function IconFlame() {
  return (
    <MstIcon>
      <path d="M12 3c2 3 5 4.5 5 9a5 5 0 1 1-10 0c0-2.5 1.2-4.2 2.5-5.5C10.5 10 11 8 12 3Z" />
    </MstIcon>
  )
}

function IconLeaf() {
  return (
    <MstIcon>
      <path d="M5 19c8 0 12-5 14-14-8 1-13 5-14 14Z" />
      <path d="M5 19c3-4 7-7 12-9" />
    </MstIcon>
  )
}

function IconStar() {
  return (
    <svg className="mst-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="m12 3.4 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.6l5-.7L12 3.4Z" />
    </svg>
  )
}

function categoryGlyph(name: string): ReactNode {
  const n = name.toLowerCase()
  if (/drink|beverage|juice|coffee|tea|bar/.test(n)) return <IconDrink />
  if (/grill|bbq|hot|pizza|burger|mandi/.test(n)) return <IconFlame />
  if (/salad|starter|cold|veg|green/.test(n)) return <IconLeaf />
  if (/dessert|sweet|cake/.test(n)) return <IconStar />
  return <IconFolders />
}

function blankCategory(sort: number): MenuCategory {
  return {
    id: `cat-${Date.now()}`,
    name: '',
    sort,
    active: true,
    branchId: getActiveBranchId(),
  }
}

function blankDish(categories: MenuCategory[], code: string): MasterDish {
  const cat = categories.find((c) => c.active) ?? categories[0]
  return {
    id: `dish-${Date.now()}`,
    name: '',
    categoryId: cat?.id ?? '',
    category: cat?.name ?? '',
    price: 0,
    code,
    active: true,
    popular: false,
    branchId: getActiveBranchId(),
  }
}

const emptyCustomizer = (): ItemCustomizer => ({
  title: 'Choose options',
  variationLabel: 'Variation',
  variations: [
    { id: `v-${Date.now()}-1`, name: 'Small', price: 29 },
    { id: `v-${Date.now()}-2`, name: 'Medium', price: 49 },
    { id: `v-${Date.now()}-3`, name: 'Large', price: 69 },
  ],
  addonGroups: [
    {
      id: `g-${Date.now()}`,
      name: 'Addons',
      appendVariationName: true,
      min: 0,
      max: 4,
      addons: [
        { id: `a-${Date.now()}-1`, name: 'Onion', price: 0 },
        { id: `a-${Date.now()}-2`, name: 'Tomato', price: 0 },
        { id: `a-${Date.now()}-3`, name: 'Mushroom', price: 3 },
        { id: `a-${Date.now()}-4`, name: 'Extra cheese', price: 6 },
      ],
    },
  ],
})

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
                {
                  id: newId('a'),
                  name: topping.name,
                  price: topping.price,
                },
              ],
            }
          : g,
      ),
    },
  }
}

export default function MastersPage() {
  const { user } = useAuth()
  const { flash, stock, ingredients } = usePos()
  const { activeBranch } = useBranch()
  const { syncEpoch, runSync } = useSync()
  const { t } = useI18n()
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()
  const { categories, dishes, saveCategory, deleteCategory, saveDish, deleteDish } = useMasters()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseMastersTab(searchParams.get('tab'))

  function setTab(next: Tab) {
    setSearchParams(next === 'categories' ? {} : { tab: next }, { replace: true })
  }

  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [catDishFilter, setCatDishFilter] = useState<CatDishFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('all')
  const [dishSort, setDishSort] = useState<DishSort>('name')
  const [editingCat, setEditingCat] = useState<MenuCategory | null>(null)
  const [editingDish, setEditingDish] = useState<MasterDish | null>(null)
  const [isNew, setIsNew] = useState(false)

  void syncEpoch

  const modalOpen = Boolean(editingCat || editingDish)

  const filtersActive =
    Boolean(query.trim()) ||
    statusFilter !== 'all' ||
    (tab === 'categories' && catDishFilter !== 'all') ||
    (tab === 'dishes' &&
      (categoryFilter !== 'all' || flagFilter !== 'all' || dishSort !== 'name'))

  function resetFilters() {
    setQuery('')
    setStatusFilter('all')
    setCatDishFilter('all')
    setCategoryFilter('all')
    setFlagFilter('all')
    setDishSort('name')
    setPage(1)
  }

  function closeEditor() {
    setEditingCat(null)
    setEditingDish(null)
    setIsNew(false)
  }

  function goDepartments() {
    closeEditor()
    navigate('/settings/departments')
  }

  function goTaxPhotos() {
    closeEditor()
    navigate('/settings/menu-details')
  }

  useEffect(() => {
    if (!modalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeEditor()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [modalOpen])

  useEffect(() => {
    setPage(1)
  }, [query, tab, statusFilter, catDishFilter, categoryFilter, flagFilter, dishSort])

  const dishCountByCat = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of dishes) map.set(d.categoryId, (map.get(d.categoryId) ?? 0) + 1)
    return map
  }, [dishes])

  const sortedCats = useMemo(
    () => [...categories].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    [categories],
  )

  const categoryOptions = useMemo(
    () =>
      buildCategorySelectOptions(sortedCats, {
        includeAll: true,
        allLabel: t.mstAllCategories,
        offSuffix: t.mstCatOffSuffix,
      }),
    [sortedCats, t],
  )

  const dishCategoryOptions = useMemo(
    () => buildCategorySelectOptions(sortedCats, { offSuffix: t.mstCatOffSuffix }),
    [sortedCats, t],
  )

  const catDishOptions = useMemo(
    () => [
      { value: 'all', label: t.mstAllCategories },
      { value: 'with', label: t.mstWithDishes },
      { value: 'empty', label: t.mstEmptyCats },
    ],
    [t],
  )

  const flagOptions = useMemo(
    () => [
      { value: 'all', label: t.mstAllFlags },
      { value: 'popular', label: t.popular },
      { value: 'options', label: t.mstHasOptions },
      { value: 'recipe', label: t.mstHasRecipe },
      { value: 'none', label: t.mstNoFlags },
    ],
    [t],
  )

  const dishSortOptions = useMemo(
    () => [
      { value: 'name', label: t.mstSortName },
      { value: 'price-asc', label: t.mstSortPriceAsc },
      { value: 'price-desc', label: t.mstSortPriceDesc },
      { value: 'code', label: t.code },
    ],
    [t],
  )

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  /** Ingredient catalog + toppings from other dishes, for the Add topping dropdown. */
  const toppingPickOptions = useMemo(() => {
    if (!editingDish?.customizer) return [] as { value: string; label: string }[]
    const used = new Set(
      withAddonGroups(editingDish.customizer)
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
      if (!d.customizer || d.id === editingDish.id) continue
      for (const g of getAddonGroups(d.customizer)) {
        for (const a of g.addons) {
          const key = a.name.trim().toLowerCase()
          if (!key || used.has(key) || seen.has(key)) continue
          seen.add(key)
          opts.push({
            value: `name:${encodeURIComponent(a.name)}:${a.price}`,
            label: `${a.name} · ${money(a.price)}`,
          })
        }
      }
    }
    opts.sort((a, b) => a.label.localeCompare(b.label))
    opts.push({ value: '__custom__', label: 'Custom topping…' })
    return opts
  }, [editingDish, ingredients, dishes])

  const filteredCats = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sortedCats.filter((c) => {
      if (statusFilter === 'active' && !c.active) return false
      if (statusFilter === 'inactive' && c.active) return false
      const count = dishCountByCat.get(c.id) ?? 0
      if (catDishFilter === 'with' && count === 0) return false
      if (catDishFilter === 'empty' && count > 0) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || (c.alias ?? '').toLowerCase().includes(q)
    })
  }, [sortedCats, query, statusFilter, catDishFilter, dishCountByCat])

  const filteredDishes = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = dishes.filter((d) => {
      if (statusFilter === 'active' && !d.active) return false
      if (statusFilter === 'inactive' && d.active) return false
      if (categoryFilter !== 'all' && !dishInCategoryFilter(d, categoryFilter, catById)) {
        return false
      }
      if (flagFilter === 'popular' && !d.popular) return false
      if (flagFilter === 'options' && !d.customizer) return false
      if (flagFilter === 'recipe' && !(d.recipe?.length ?? 0)) return false
      if (flagFilter === 'none' && (d.popular || d.customizer || (d.recipe?.length ?? 0) > 0)) {
        return false
      }
      if (!q) return true
      const path = categoryPathLabel(catById.get(d.categoryId), catById).full.toLowerCase()
      return (
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        path.includes(q)
      )
    })
    list = [...list]
    list.sort((a, b) => {
      if (dishSort === 'price-asc') return a.price - b.price || a.name.localeCompare(b.name)
      if (dishSort === 'price-desc') return b.price - a.price || a.name.localeCompare(b.name)
      if (dishSort === 'code') return a.code.localeCompare(b.code, undefined, { numeric: true })
      return a.name.localeCompare(b.name)
    })
    return list
  }, [dishes, query, statusFilter, categoryFilter, flagFilter, dishSort, catById])

  const list = tab === 'categories' ? filteredCats : filteredDishes
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageSlice = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const statusCounts = useMemo(() => {
    const source = tab === 'categories' ? categories : dishes
    return {
      all: source.length,
      active: source.filter((x) => x.active).length,
      inactive: source.filter((x) => !x.active).length,
    }
  }, [tab, categories, dishes])

  const stats = useMemo(
    () => [
      { key: 'cats', label: t.categories, value: categories.length, tone: 'teal', icon: <IconFolders /> },
      { key: 'dishes', label: t.menuItems, value: dishes.length, tone: 'ocean', icon: <IconPlate /> },
      {
        key: 'active',
        label: t.active,
        value: dishes.filter((d) => d.active).length,
        tone: 'lime',
        icon: <IconCheck />,
      },
      {
        key: 'custom',
        label: t.mstCustomizable,
        value: dishes.filter((d) => d.customizer).length,
        tone: 'amber',
        icon: <IconSliders />,
      },
    ],
    [categories, dishes, t],
  )

  function startNewCategory() {
    setTab('categories')
    setIsNew(true)
    setEditingDish(null)
    setEditingCat(blankCategory(Math.max(0, ...categories.map((c) => c.sort)) + 1))
  }

  function startNewDish() {
    if (!categories.length) {
      flash(t.mstAddCategoryFirst, 'err')
      setTab('categories')
      return
    }
    setTab('dishes')
    setIsNew(true)
    setEditingCat(null)
    setEditingDish(blankDish(sortedCats, nextUniqueDishCode(dishes)))
  }

  function openCategory(cat: MenuCategory) {
    setIsNew(false)
    setEditingDish(null)
    setEditingCat({ ...cat })
  }

  function openDish(dish: MasterDish) {
    setIsNew(false)
    setEditingCat(null)
    setEditingDish({ ...dish })
  }

  function saveCat() {
    if (!editingCat) return
    if (!editingCat.name.trim()) {
      flash(t.mstCategoryNameRequired, 'err')
      return
    }
    saveCategory({
      ...editingCat,
      name: editingCat.name.trim(),
      branchId: editingCat.branchId ?? getActiveBranchId(),
      sort: Number(editingCat.sort) || 0,
    })
    flash(isNew ? t.mstCategoryCreated : t.mstCategoryUpdated)
    closeEditor()
    void runSync({ quiet: true }).catch(() => undefined)
  }

  function removeCat() {
    if (!editingCat || isNew) return
    const linked = dishes.filter((d) => d.categoryId === editingCat.id).length
    if (linked > 0) {
      flash(t.mstMoveDishesFirst.replace('{count}', String(linked)), 'err')
      return
    }
    askDelete({
      name: editingCat.name,
      onConfirm: () => {
        void deleteCategory(editingCat.id).then(() => {
          flash(t.mstCategoryDeleted)
          closeEditor()
          void runSync({ quiet: true }).catch(() => undefined)
        })
      },
    })
  }

  function saveDishForm() {
    if (!editingDish) return
    if (!editingDish.name.trim()) {
      flash(t.mstMenuItemNameRequired, 'err')
      return
    }
    if (!editingDish.categoryId) {
      flash(t.mstPickCategory, 'err')
      return
    }
    const code =
      editingDish.code.trim() || nextUniqueDishCode(dishes.filter((d) => d.id !== editingDish.id))
    if (isDishCodeTaken(dishes, code, editingDish.id)) {
      flash(t.mstCodeTaken, 'err')
      return
    }
    const cat = categories.find((c) => c.id === editingDish.categoryId)
    void saveDish(
      withSyncedBasePrice({
        ...editingDish,
        name: editingDish.name.trim(),
        code,
        category: cat?.name ?? editingDish.category,
        price: Math.max(0, Number(editingDish.price) || 0),
        branchId: editingDish.branchId ?? getActiveBranchId(),
      }),
    ).then(() => {
      flash(isNew ? t.mstMenuItemCreated : t.mstMenuItemUpdated)
      closeEditor()
      void runSync({ quiet: true }).catch(() => undefined)
    })
  }

  function removeDish() {
    if (!editingDish || isNew) return
    askDelete({
      name: editingDish.name,
      onConfirm: () => {
        void deleteDish(editingDish.id).then(() => {
          flash(t.mstMenuItemDeleted)
          closeEditor()
          void runSync({ quiet: true }).catch(() => undefined)
        })
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>{t.mstLocked}</strong>
          <p>{t.mstLockedHint}</p>
          <Link to="/" className="btn btn-ghost" style={{ marginTop: '1rem' }}>
            {t.mainMenu}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-mst-desk">
      <DashHeader search={query} onSearchChange={setQuery} brandTo="/" />

      <div className="mst-page-inner">
        <header className="mst-hero">
          <div className="mst-hero-brand">
            <span className="mst-hero-mark">
              <IconFolders />
            </span>
            <div>
              <h1>{t.mstTitle}</h1>
              <p>
                {t.mstHeroHint
                  .replace('{code}', activeBranch.code)
                  .replace('{name}', activeBranch.name)}
              </p>
            </div>
          </div>
          <div className="mst-hero-stats">
            {stats.map((s) => (
              <span key={s.key} className={`mst-stat tone-${s.tone}`}>
                {s.icon}
                <strong className="mesa-ltr-nums">{s.value}</strong>
                <em>{s.label}</em>
              </span>
            ))}
          </div>
          <div className="mst-hero-actions">
            <button
              type="button"
              className="mst-link-btn primary"
              onClick={() => (tab === 'categories' ? startNewCategory() : startNewDish())}
            >
              <IconPlus /> {tab === 'categories' ? t.category : t.menuItem}
            </button>
          </div>
        </header>

        <section className="mst-board">
          <div className="mst-toolbar">
            <nav className="mst-tabs" aria-label={t.mstSectionsAria}>
              <button
                type="button"
                className={tab === 'categories' ? 'on' : ''}
                onClick={() => {
                  setTab('categories')
                  closeEditor()
                }}
              >
                <IconFolders /> {t.categories}
              </button>
              <button
                type="button"
                className={tab === 'dishes' ? 'on' : ''}
                onClick={() => {
                  setTab('dishes')
                  closeEditor()
                }}
              >
                <IconPlate /> {t.menuItems}
              </button>
              <button type="button" onClick={goDepartments}>
                {t.departments}
              </button>
              <button type="button" onClick={goTaxPhotos}>
                {t.menuTaxPhotos}
              </button>
            </nav>
            <button
              type="button"
              className="mst-add-btn"
              onClick={() => (tab === 'categories' ? startNewCategory() : startNewDish())}
            >
              <IconPlus /> {tab === 'categories' ? t.category : t.menuItem}
            </button>
          </div>

          <div className="mst-filters">
            <label className="mst-search">
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === 'categories' ? t.mstSearchCategories : t.mstSearchMenuItems}
                aria-label={tab === 'categories' ? t.mstSearchCategories : t.mstSearchMenuItems}
              />
            </label>
            <div className="mst-status-pills" role="tablist" aria-label={t.mstStatusFilterAria}>
              {(
                [
                  ['all', t.all, statusCounts.all],
                  ['active', t.active, statusCounts.active],
                  ['inactive', t.inactive, statusCounts.inactive],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  className={`mst-pill${statusFilter === id ? ' on' : ''}`}
                  onClick={() => setStatusFilter(id)}
                >
                  {label}
                  <em className="mesa-ltr-nums">{count}</em>
                </button>
              ))}
            </div>
            {tab === 'categories' ? (
              <div className="mst-pick">
                <MesaSelect
                  aria-label={t.mstFilterDishCountAria}
                  value={catDishFilter}
                  onChange={(v) => setCatDishFilter(v as CatDishFilter)}
                  options={catDishOptions}
                />
              </div>
            ) : (
              <>
                <div className="mst-pick">
                  <MesaSelect
                    aria-label={t.mstFilterCategoryAria}
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    options={categoryOptions}
                  />
                </div>
                <div className="mst-pick">
                  <MesaSelect
                    aria-label={t.mstFilterFlagsAria}
                    value={flagFilter}
                    onChange={(v) => setFlagFilter(v as FlagFilter)}
                    options={flagOptions}
                  />
                </div>
                <div className="mst-pick">
                  <MesaSelect
                    aria-label={t.mstSortDishesAria}
                    value={dishSort}
                    onChange={(v) => setDishSort(v as DishSort)}
                    options={dishSortOptions}
                  />
                </div>
              </>
            )}
            <span className="mst-count mesa-ltr-nums">
              {list.length} / {tab === 'categories' ? categories.length : dishes.length}
            </span>
            {filtersActive ? (
              <button type="button" className="mst-reset" onClick={resetFilters}>
                {t.clear}
              </button>
            ) : null}
          </div>

          {tab === 'categories' ? (
            filteredCats.length === 0 ? (
              <div className="mst-empty">
                <strong>{categories.length === 0 ? t.mstNoCategoriesYet : t.mstNoCategoriesMatch}</strong>
                <p>
                  {categories.length === 0 ? t.mstNoCategoriesHint : t.mstTryClearFilters}
                </p>
                <div className="mst-empty-actions">
                  {filtersActive ? (
                    <button type="button" className="mst-btn ghost" onClick={resetFilters}>
                      {t.clearFilters}
                    </button>
                  ) : null}
                  <button type="button" className="mst-add-btn" onClick={startNewCategory}>
                    <IconPlus /> {t.category}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mst-table-wrap">
                  <table className="mst-table">
                    <colgroup>
                  <col className="mst-col-name" />
                  <col className="mst-col-type" />
                  <col className="mst-col-dishes" />
                  <col className="mst-col-sort" />
                  <col className="mst-col-status" />
                  <col className="mst-col-action" />
                </colgroup>
                    <thead>
                      <tr>
                        <th>{t.category}</th>
                        <th>{t.type}</th>
                        <th>{t.menuItems}</th>
                        <th>{t.sort}</th>
                        <th>{t.status}</th>
                        <th aria-label={t.edit} />
                      </tr>
                    </thead>
                    <tbody>
                      {(pageSlice as MenuCategory[]).map((cat) => {
                        const count = dishCountByCat.get(cat.id) ?? 0
                        const tone = toneForCategory(cat)
                        const path = categoryPathLabel(cat, catById)
                        const isSub = Boolean(cat.parentId)
                        return (
                          <tr
                            key={cat.id}
                            className={cat.active ? '' : 'is-off'}
                            onDoubleClick={() => openCategory(cat)}
                          >
                            <td>
                              <div className="mst-name">
                                <span className="mst-badge" style={{ background: tone }} aria-hidden>
                                  {categoryGlyph(cat.name)}
                                </span>
                                <div className="mst-name-text">
                                  <strong title={path.full}>{path.full}</strong>
                                  {cat.alias ? <span>{cat.alias}</span> : null}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`mst-type-pill${isSub ? ' sub' : ' main'}`}>
                                {isSub ? t.mstSub : t.mstMain}
                              </span>
                            </td>
                            <td>
                              <span className="mst-chip mesa-ltr-nums">{count}</span>
                            </td>
                            <td className="mesa-ltr-nums">{cat.sort}</td>
                            <td>
                              <span className={`mst-status ${cat.active ? 'ok' : 'off'}`}>
                                {cat.active ? t.active : t.inactive}
                              </span>
                            </td>
                            <td>
                              <div className="mst-row-actions">
                                <button
                                  type="button"
                                  className="mst-icon-btn"
                                  title={t.mstEditCategoryTitle}
                                  aria-label={`${t.edit} ${cat.name}`}
                                  onClick={() => openCategory(cat)}
                                >
                                  <IconEdit />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          ) : filteredDishes.length === 0 ? (
            <div className="mst-empty">
              <strong>{dishes.length === 0 ? t.mstNoDishesYet : t.mstNoDishesMatch}</strong>
              <p>
                {dishes.length === 0 ? t.mstNoDishesHint : t.mstTryClearFilters}
              </p>
              <div className="mst-empty-actions">
                {filtersActive ? (
                  <button type="button" className="mst-btn ghost" onClick={resetFilters}>
                    {t.clearFilters}
                  </button>
                ) : null}
                <button type="button" className="mst-add-btn" onClick={startNewDish}>
                  <IconPlus /> {t.menuItem}
                </button>
              </div>
            </div>
          ) : (
            <div className="mst-table-wrap">
              <table className="mst-table">
                <colgroup>
                  <col className="mst-col-dish" />
                  <col className="mst-col-code" />
                  <col className="mst-col-cat" />
                  <col className="mst-col-price" />
                  <col className="mst-col-flags" />
                  <col className="mst-col-status" />
                  <col className="mst-col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t.menuItem}</th>
                    <th>{t.code}</th>
                    <th>{t.category}</th>
                    <th>{t.price}</th>
                    <th>{t.flags}</th>
                    <th>{t.status}</th>
                    <th aria-label={t.edit} />
                  </tr>
                </thead>
                <tbody>
                  {(pageSlice as MasterDish[]).map((dish) => {
                    const cat = catById.get(dish.categoryId)
                    const tone = cat ? toneForCategory(cat) : '#0f766e'
                    const path = categoryPathLabel(cat, catById)
                    return (
                      <tr
                        key={dish.id}
                        className={dish.active ? '' : 'is-off'}
                        onDoubleClick={() => openDish(dish)}
                      >
                        <td>
                          <div className="mst-name">
                            <span className="mst-badge soft" style={{ background: tone }} aria-hidden>
                              <IconPlate />
                            </span>
                            <div className="mst-name-text">
                              <strong title={dish.name}>
                                {dish.name}
                                {dish.popular ? (
                                  <i className="mst-star" title={t.popular}>
                                    <IconStar />
                                  </i>
                                ) : null}
                              </strong>
                            </div>
                          </div>
                        </td>
                        <td className="mesa-ltr-nums">{dish.code || '—'}</td>
                        <td>
                          <div className="mst-cat-cell" title={path.full}>
                            <strong>{path.main}</strong>
                            {path.sub ? <span>{path.sub}</span> : null}
                          </div>
                        </td>
                        <td className="mesa-ltr-nums">{money(dish.price)}</td>
                        <td>
                          <div className="mst-flags">
                            {dish.customizer ? <span className="mst-flag">{t.options}</span> : null}
                            {(dish.recipe?.length ?? 0) > 0 ? (
                              <span className="mst-flag recipe">{t.recipe}</span>
                            ) : null}
                            {!dish.customizer && !(dish.recipe?.length ?? 0) ? (
                              <em className="mst-muted">—</em>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span className={`mst-status ${dish.active ? 'ok' : 'off'}`}>
                            {dish.active ? t.active : t.inactive}
                          </span>
                        </td>
                        <td>
                          <div className="mst-row-actions">
                            <button
                              type="button"
                              className="mst-icon-btn"
                              title={t.mstEditDishTitle}
                              aria-label={`${t.edit} ${dish.name}`}
                              onClick={() => openDish(dish)}
                            >
                              <IconEdit />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {list.length > 0 ? (
            <div className="mst-pager">
              <span className="mesa-ltr-nums">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, list.length)}{' '}
                {t.expensePagerOf} {list.length}
              </span>
              <div className="mst-pager-actions">
                <button
                  type="button"
                  className="mst-page-btn"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t.expensePagerPrev}
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`mst-page-btn${n === safePage ? ' on' : ''}`}
                    onClick={() => setPage(n)}
                    aria-current={n === safePage ? 'page' : undefined}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="mst-page-btn"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  {t.expensePagerNext}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {editingCat ? (
        <div
          className="modal-backdrop mst-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditor()
          }}
        >
          <div className="modal-card mst-modal">
            <div className="mst-modal-head">
              <div className="mst-editor-head">
                <span
                  className="mst-badge"
                  style={{ background: toneForCategory(editingCat) }}
                  aria-hidden
                >
                  {categoryGlyph(editingCat.name || 'Category')}
                </span>
                <div>
                  <h2>{isNew ? t.mstNewCategory : t.mstEditCategory}</h2>
                  <p>{t.mstCategoryModalHint}</p>
                </div>
              </div>
              <button type="button" className="mst-btn ghost" onClick={closeEditor}>
                {t.close}
              </button>
            </div>

            <div className="mst-form">
              <label className="mst-field mst-span-2">
                <span>
                  {t.name} <i>*</i>
                </span>
                <input
                  className="mst-input"
                  value={editingCat.name}
                  onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                  autoFocus
                />
              </label>
              <label className="mst-field">
                <span>{t.sort}</span>
                <input
                  className="mst-input mesa-ltr-nums"
                  type="number"
                  value={editingCat.sort}
                  onChange={(e) =>
                    setEditingCat({ ...editingCat, sort: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <div className="mst-field">
                <span>{t.active}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editingCat.active}
                  className={`zk-user-switch${editingCat.active ? ' on' : ''}`}
                  onClick={() => setEditingCat({ ...editingCat, active: !editingCat.active })}
                >
                  <i aria-hidden />
                  <strong>{editingCat.active ? t.onLabel : t.offLabel}</strong>
                </button>
              </div>
            </div>

            <div className="mst-modal-actions">
              {!isNew ? (
                <button type="button" className="mst-btn danger" onClick={removeCat}>
                  {t.delete}
                </button>
              ) : (
                <span />
              )}
              <div className="mst-modal-actions-end">
                <button type="button" className="mst-btn ghost" onClick={closeEditor}>
                  {t.cancel}
                </button>
                <button type="button" className="mst-btn primary" onClick={saveCat}>
                  {t.save}
                </button>
              </div>
            </div>
            <p className="mst-hint">
              {t.mstDeptColorsHint} <Link to="/settings/departments">{t.departments}</Link>.
            </p>
          </div>
        </div>
      ) : null}

      {editingDish ? (
        <div
          className="modal-backdrop mst-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditor()
          }}
        >
          <div className="modal-card mst-modal mst-modal-wide">
            <div className="mst-modal-head">
              <div className="mst-editor-head">
                <span
                  className="mst-badge soft"
                  style={{
                    background: catById.get(editingDish.categoryId)
                      ? toneForCategory(catById.get(editingDish.categoryId)!)
                      : '#0f766e',
                  }}
                  aria-hidden
                >
                  <IconPlate />
                </span>
                <div>
                  <h2>{isNew ? t.mstNewDish : t.mstEditDish}</h2>
                  <p>{t.mstDishModalHint}</p>
                </div>
              </div>
              <button type="button" className="mst-btn ghost" onClick={closeEditor}>
                {t.close}
              </button>
            </div>

            <div className="mst-form">
              <label className="mst-field mst-span-2">
                <span>
                  {t.name} <i>*</i>
                </span>
                <input
                  className="mst-input"
                  value={editingDish.name}
                  onChange={(e) => setEditingDish({ ...editingDish, name: e.target.value })}
                  autoFocus
                />
              </label>
              <label className="mst-field">
                <span>{t.code}</span>
                <input
                  className="mst-input mesa-ltr-nums"
                  value={editingDish.code}
                  onChange={(e) => setEditingDish({ ...editingDish, code: e.target.value })}
                  placeholder="Auto or type your own"
                  title="Suggested unique code — change freely; duplicates are blocked on save"
                />
              </label>
              <label className="mst-field">
                <span>{t.price} (SAR)</span>
                <input
                  className="mst-input mesa-ltr-nums"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editingDish.price}
                  onChange={(e) =>
                    setEditingDish({ ...editingDish, price: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label className="mst-field mst-span-2">
                <span>{t.category}</span>
                <MesaSelect
                  value={editingDish.categoryId}
                  onChange={(v) => {
                    const cat = categories.find((c) => c.id === v)
                    setEditingDish({
                      ...editingDish,
                      categoryId: v,
                      category: cat?.name ?? editingDish.category,
                    })
                  }}
                  options={dishCategoryOptions}
                />
              </label>
              <div className="mst-field">
                <span>{t.popular}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!editingDish.popular}
                  className={`zk-user-switch${editingDish.popular ? ' on' : ''}`}
                  onClick={() => setEditingDish({ ...editingDish, popular: !editingDish.popular })}
                >
                  <i aria-hidden />
                  <strong>{editingDish.popular ? t.onLabel : t.offLabel}</strong>
                </button>
              </div>
              <div className="mst-field">
                <span>{t.mstActiveOnPos}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editingDish.active}
                  className={`zk-user-switch${editingDish.active ? ' on' : ''}`}
                  onClick={() => setEditingDish({ ...editingDish, active: !editingDish.active })}
                >
                  <i aria-hidden />
                  <strong>{editingDish.active ? t.onLabel : t.offLabel}</strong>
                </button>
              </div>
              <div className="mst-field mst-span-2">
                <span>{t.mstCustomOptions}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!editingDish.customizer}
                  className={`zk-user-switch${editingDish.customizer ? ' on' : ''}`}
                  onClick={() =>
                    setEditingDish({
                      ...editingDish,
                      customizer: editingDish.customizer ? undefined : emptyCustomizer(),
                    })
                  }
                >
                  <i aria-hidden />
                  <strong>{editingDish.customizer ? t.enabled : t.offLabel}</strong>
                </button>
              </div>
            </div>

            {editingDish.customizer ? (
              <div className="mst-block mst-customizer-editor">
                <strong>Custom options setup</strong>
                <p className="mst-hint">
                  POS shows these as size buttons + toppings. Base dish price is used only when no
                  variation is selected.
                </p>

                <div className="mst-cz-section">
                  <div className="mst-cz-head">
                    <strong>Variations (size / price)</strong>
                    <button
                      type="button"
                      className="mst-btn ghost"
                      onClick={() => {
                        const cz = editingDish.customizer!
                        setEditingDish({
                          ...editingDish,
                          customizer: {
                            ...cz,
                            variations: [
                              ...cz.variations,
                              { id: newId('v'), name: 'New size', price: editingDish.price },
                            ],
                          },
                        })
                      }}
                    >
                      + Size
                    </button>
                  </div>
                  {editingDish.customizer.variations.map((v, vi) => (
                    <div key={v.id} className="mst-recipe-row">
                      <input
                        className="mst-input"
                        value={v.name}
                        aria-label={`Variation ${vi + 1} name`}
                        placeholder="Small / Medium / Large"
                        onChange={(e) => {
                          const cz = editingDish.customizer!
                          setEditingDish({
                            ...editingDish,
                            customizer: {
                              ...cz,
                              variations: cz.variations.map((row, i) =>
                                i === vi ? { ...row, name: e.target.value } : row,
                              ),
                            },
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
                        title="Variation price"
                        onChange={(e) => {
                          const cz = editingDish.customizer!
                          const price = Number(e.target.value) || 0
                          setEditingDish({
                            ...editingDish,
                            customizer: {
                              ...cz,
                              variations: cz.variations.map((row, i) =>
                                i === vi ? { ...row, price } : row,
                              ),
                            },
                          })
                        }}
                      />
                      <button
                        type="button"
                        className="mst-btn ghost"
                        title="Remove size"
                        aria-label="Remove size"
                        disabled={(editingDish.customizer?.variations.length ?? 0) <= 1}
                        onClick={() => {
                          const cz = editingDish.customizer!
                          setEditingDish({
                            ...editingDish,
                            customizer: {
                              ...cz,
                              variations: cz.variations.filter((_, i) => i !== vi),
                            },
                          })
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {withAddonGroups(editingDish.customizer).map((g, gi) => (
                  <div key={g.id} className="mst-topping-group mst-cz-section">
                    <div className="mst-cz-head">
                      <input
                        className="mst-input"
                        value={g.name}
                        aria-label={`Addon group ${gi + 1} name`}
                        placeholder="Group name (Addons, Cheese…)"
                        onChange={(e) => {
                          const groups = withAddonGroups(editingDish.customizer!)
                          setEditingDish({
                            ...editingDish,
                            customizer: {
                              ...editingDish.customizer!,
                              addonGroups: groups.map((grp, gIdx) =>
                                gIdx === gi ? { ...grp, name: e.target.value } : grp,
                              ),
                            },
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
                            const groups = withAddonGroups(editingDish.customizer!)
                            const min = Math.max(0, Number(e.target.value) || 0)
                            setEditingDish({
                              ...editingDish,
                              customizer: {
                                ...editingDish.customizer!,
                                addonGroups: groups.map((grp, gIdx) =>
                                  gIdx === gi ? { ...grp, min, max: Math.max(min, grp.max) } : grp,
                                ),
                              },
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
                            const groups = withAddonGroups(editingDish.customizer!)
                            const max = Math.max(0, Number(e.target.value) || 0)
                            setEditingDish({
                              ...editingDish,
                              customizer: {
                                ...editingDish.customizer!,
                                addonGroups: groups.map((grp, gIdx) =>
                                  gIdx === gi ? { ...grp, max, min: Math.min(grp.min, max) } : grp,
                                ),
                              },
                            })
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="mst-btn ghost"
                        title="Remove group"
                        aria-label="Remove group"
                        disabled={withAddonGroups(editingDish.customizer!).length <= 1}
                        onClick={() => {
                          const groups = withAddonGroups(editingDish.customizer!)
                          setEditingDish({
                            ...editingDish,
                            customizer: {
                              ...editingDish.customizer!,
                              addonGroups: groups.filter((_, gIdx) => gIdx !== gi),
                            },
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
                              const groups = withAddonGroups(editingDish.customizer!)
                              setEditingDish({
                                ...editingDish,
                                customizer: {
                                  ...editingDish.customizer!,
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
                                },
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
                            title="Addon price"
                            onChange={(e) => {
                              const groups = withAddonGroups(editingDish.customizer!)
                              const price = Number(e.target.value) || 0
                              setEditingDish({
                                ...editingDish,
                                customizer: {
                                  ...editingDish.customizer!,
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
                                },
                              })
                            }}
                          />
                          <button
                            type="button"
                            className="mst-btn ghost"
                            title="Remove topping"
                            aria-label="Remove topping"
                            onClick={() => {
                              const groups = withAddonGroups(editingDish.customizer!)
                              setEditingDish({
                                ...editingDish,
                                customizer: {
                                  ...editingDish.customizer!,
                                  addonGroups: groups.map((grp, gIdx) =>
                                    gIdx === gi
                                      ? {
                                          ...grp,
                                          addons: grp.addons.filter((_, aIdx) => aIdx !== ai),
                                        }
                                      : grp,
                                  ),
                                },
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
                        onChange={(v) => {
                          if (!v || !editingDish.customizer) return
                          if (v === '__custom__') {
                            setEditingDish(
                              appendTopping(editingDish, { name: 'New topping', price: 0 }, gi),
                            )
                            return
                          }
                          if (v.startsWith('ing:')) {
                            const id = v.slice('ing:'.length)
                            const item = ingredients.find((i) => i.id === id)
                            if (!item) return
                            setEditingDish(
                              appendTopping(editingDish, { name: item.name, price: 0 }, gi),
                            )
                            return
                          }
                          if (v.startsWith('stock:')) {
                            const id = v.slice('stock:'.length)
                            const item = stock.find((s) => s.id === id)
                            if (!item) return
                            setEditingDish(
                              appendTopping(editingDish, { name: item.name, price: 0 }, gi),
                            )
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
                            setEditingDish(
                              appendTopping(
                                editingDish,
                                { name, price: Number(rawPrice) || 0 },
                                gi,
                              ),
                            )
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="mst-btn ghost"
                  onClick={() => {
                    const groups = withAddonGroups(editingDish.customizer!)
                    setEditingDish({
                      ...editingDish,
                      customizer: {
                        ...editingDish.customizer!,
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
                      },
                    })
                  }}
                >
                  + Addon group
                </button>

                {!ingredients.length ? (
                  <p className="mst-hint">
                    Tip: add items in{' '}
                    <Link to="/settings/ingredients/list">Ingredient Master</Link> first, then link
                    stock in Stock Master.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mst-block">
              <strong>Recipe (stock on settle)</strong>
              {(editingDish.recipe ?? []).map((r, idx) => {
                const ingId = recipeLineIngredientId(r)
                return (
                <div key={`${ingId}-${idx}`} className="mst-recipe-row">
                  <MesaSelect
                    value={ingId}
                    onChange={(v) => {
                      const recipe = [...(editingDish.recipe ?? [])]
                      recipe[idx] = { ...recipe[idx], ingredientId: v, stockId: undefined }
                      setEditingDish({ ...editingDish, recipe })
                    }}
                    options={ingredients.filter((i) => i.active).map((i) => ({
                      value: i.id,
                      label: `${i.name} (${i.unit})`,
                    }))}
                  />
                  <input
                    className="mst-input mesa-ltr-nums"
                    type="number"
                    step="0.01"
                    value={r.qty}
                    onChange={(e) => {
                      const recipe = [...(editingDish.recipe ?? [])]
                      recipe[idx] = { ...recipe[idx], qty: Number(e.target.value) || 0 }
                      setEditingDish({ ...editingDish, recipe })
                    }}
                  />
                  <button
                    type="button"
                    className="mst-btn ghost"
                    onClick={() => {
                      const recipe = (editingDish.recipe ?? []).filter((_, i) => i !== idx)
                      setEditingDish({
                        ...editingDish,
                        recipe: recipe.length ? recipe : undefined,
                      })
                    }}
                  >
                    ✕
                  </button>
                </div>
              )})}
              <button
                type="button"
                className="mst-btn ghost"
                disabled={!ingredients.length}
                onClick={() =>
                  setEditingDish({
                    ...editingDish,
                    recipe: [
                      ...(editingDish.recipe ?? []),
                      { ingredientId: ingredients[0]?.id ?? '', qty: 0.1 },
                    ],
                  })
                }
              >
                + Ingredient
              </button>
            </div>

            <div className="mst-modal-actions">
              {!isNew ? (
                <button type="button" className="mst-btn danger" onClick={removeDish}>
                  {t.delete}
                </button>
              ) : (
                <span />
              )}
              <div className="mst-modal-actions-end">
                <button type="button" className="mst-btn ghost" onClick={closeEditor}>
                  {t.cancel}
                </button>
                <button type="button" className="mst-btn primary" onClick={saveDishForm}>
                  {t.save}
                </button>
              </div>
            </div>
            <p className="mst-hint">
              {t.menuTaxPhotos}: <Link to="/settings/menu-details">{t.menuDetails}</Link>.
            </p>
          </div>
        </div>
      ) : null}

      <HubFooter backTo={settingsHubPath('ingredients')} backLabel={t.ingredients} />
      {deleteConfirmDialog}
    </div>
  )
}
