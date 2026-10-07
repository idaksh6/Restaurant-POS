import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { mastersRepo, sortDishes } from '../data/repos/mastersRepo'
import { migrateLocalStorageToDexie } from '../data/repos/db'
import {
  isDemoCategory,
  isDemoDish,
  getAddonGroups,
  type ItemCustomizer,
  type MasterDish,
  type MenuCategory,
  type MenuItem,
} from '../data/masters'
import { recipeLineIngredientId } from '../data/masters'
import { normalizeTaxIds } from '../data/tax'
import {
  apiDeleteCategory,
  apiDeleteProduct,
  apiListCategories,
  apiListProducts,
  apiMastersReady,
  apiPutCategory,
  apiPutProduct,
  type ApiCategory,
  type ApiProduct,
} from '../lib/apiMasters'
import { dropPendingUpsertsFor, enqueueOutbox } from '../sync/outbox'
import { getDeviceId } from '../sync/deviceId'
import { getActiveBranchId } from '../data/company'
import { useAuth } from './AuthContext'
import { useBranch } from './BranchContext'
import { useSync } from '../sync/SyncContext'

type MastersValue = {
  categories: MenuCategory[]
  dishes: MasterDish[]
  activeDishes: MenuItem[]
  ready: boolean
  saveCategory: (cat: MenuCategory) => void
  deleteCategory: (id: string) => Promise<void>
  saveDish: (dish: MasterDish) => Promise<void>
  /** Atomic multi-product update (avoids stale-state races from parallel saveDish). */
  saveDishes: (rows: MasterDish[]) => Promise<number>
  deleteDish: (id: string) => Promise<void>
  resetMasters: () => void
}

const MastersContext = createContext<MastersValue | null>(null)

function fromApiCategory(row: ApiCategory): MenuCategory {
  const meta = (row.meta ?? {}) as Record<string, unknown>
  return {
    id: row.id,
    name: row.name,
    alias: row.alias ?? '',
    sort: row.sort ?? 0,
    active: row.active !== false,
    parentId: row.parentId ?? undefined,
    branchId: row.branchId ?? undefined,
    isBar: meta.isBar === true,
    buttonColor: meta.buttonColor ? String(meta.buttonColor) : undefined,
    buttonHeight: meta.buttonHeight != null ? Number(meta.buttonHeight) : undefined,
    buttonFontSize: meta.buttonFontSize != null ? Number(meta.buttonFontSize) : undefined,
    productButtonColor: meta.productButtonColor ? String(meta.productButtonColor) : undefined,
    productButtonHeight:
      meta.productButtonHeight != null ? Number(meta.productButtonHeight) : undefined,
    productButtonFontSize:
      meta.productButtonFontSize != null ? Number(meta.productButtonFontSize) : undefined,
    deptFontColor: meta.deptFontColor ? String(meta.deptFontColor) : undefined,
    productFontColor: meta.productFontColor ? String(meta.productFontColor) : undefined,
    imageDataUrl: meta.imageDataUrl ? String(meta.imageDataUrl) : undefined,
  }
}

function fromApiProduct(row: ApiProduct): MasterDish {
  const meta = (row.meta ?? {}) as Record<string, unknown>
  return {
    id: row.id,
    name: row.name,
    alias: row.alias ?? '',
    categoryId: row.categoryId,
    category: row.category,
    branchId: row.branchId ?? undefined,
    price: row.price,
    cost: row.cost,
    code: row.code,
    active: row.active !== false,
    popular: meta.popular === true,
    customizer: meta.customizer as ItemCustomizer | undefined,
    recipe: Array.isArray(meta.recipe) && (meta.recipe as unknown[]).length
      ? (meta.recipe as Array<{ ingredientId?: string; stockId?: string; qty: number }>).map(
          (line) => ({
            ingredientId: recipeLineIngredientId(line),
            qty: Number(line.qty) || 0,
          }),
        )
      : undefined,
    unitId: meta.unitId ? String(meta.unitId) : undefined,
    vendorId: meta.vendorId ? String(meta.vendorId) : undefined,
    hsn: meta.hsn ? String(meta.hsn) : undefined,
    details: meta.details ? String(meta.details) : undefined,
    productType: meta.productType === 'combo' ? 'combo' : meta.productType === 'single' ? 'single' : undefined,
    taxIds: Array.isArray(meta.taxIds)
      ? normalizeTaxIds(meta.taxIds.map((x) => String(x)))
      : undefined,
    discountIds: Array.isArray(meta.discountIds)
      ? meta.discountIds.map((x) => String(x))
      : undefined,
    imageDataUrl: meta.imageDataUrl ? String(meta.imageDataUrl) : undefined,
    requiresKitchen: meta.requiresKitchen === false ? false : meta.requiresKitchen === true ? true : undefined,
  }
}

function pushDish(dish: MasterDish) {
  if (isDemoDish(dish.id) || isDemoCategory(dish.categoryId)) return
  const branchId = dish.branchId ?? getActiveBranchId()
  const stamped = { ...dish, branchId }
  // Always send clearable keys so the API can clear vs preserve correctly
  // (JSON omits `undefined`, which previously resurrected recipe/customizer).
  const payload = {
    ...stamped,
    imageDataUrl: stamped.imageDataUrl ?? null,
    recipe: Array.isArray(stamped.recipe) ? stamped.recipe : [],
    customizer: stamped.customizer ?? null,
  }
  const body = { kind: 'dish' as const, dish: payload }
  if (apiMastersReady()) {
    void apiPutProduct(payload as unknown as Record<string, unknown>)
      .then(() => dropPendingUpsertsFor(stamped.id, 'masters.upsert'))
      .catch(() =>
        enqueueOutbox('masters.upsert', stamped.id, body, getDeviceId(), branchId),
      )
  } else {
    enqueueOutbox('masters.upsert', stamped.id, body, getDeviceId(), branchId)
  }
}

function pushCategory(cat: MenuCategory) {
  if (isDemoCategory(cat.id)) return
  const branchId = cat.branchId ?? getActiveBranchId()
  const stamped = { ...cat, branchId }
  const body = { kind: 'category' as const, cat: stamped }
  if (apiMastersReady()) {
    void apiPutCategory(stamped as unknown as Record<string, unknown>)
      .then(() => dropPendingUpsertsFor(stamped.id, 'masters.upsert'))
      .catch(() =>
        enqueueOutbox('masters.upsert', stamped.id, body, getDeviceId(), branchId),
      )
  } else {
    enqueueOutbox('masters.upsert', stamped.id, body, getDeviceId(), branchId)
  }
}

function categoriesUiSig(rows: MenuCategory[]) {
  return rows
    .map(
      (c) =>
        `${c.id}:${c.name}:${c.parentId ?? ''}:${c.active ? 1 : 0}:${c.sort ?? 0}:${c.branchId ?? ''}`,
    )
    .sort()
    .join('|')
}

/** Fields that affect POS menu / tax / recipe / options UI (skip image bytes). */
function dishesUiSig(rows: MasterDish[]) {
  return rows
    .map((d) => {
      const tax = (d.taxIds ?? []).join(',')
      const recipe = (d.recipe ?? [])
        .map((r) => `${recipeLineIngredientId(r)}:${r.qty}`)
        .sort()
        .join(',')
      const cz = d.customizer
      const customizer = cz
        ? [
            (cz.variations ?? []).map((v) => `${v.id}:${v.name}:${v.price}`).join(','),
            getAddonGroups(cz)
              .map(
                (g) =>
                  `${g.id}:${g.name}:${g.min}:${g.max}:${g.addons
                    .map((a) => `${a.id}:${a.name}:${a.price}`)
                    .join('+')}`,
              )
              .join(';'),
          ].join('#')
        : ''
      return `${d.id}:${d.name}:${d.alias ?? ''}:${d.price}:${d.categoryId}:${d.active ? 1 : 0}:${tax}:${d.code ?? ''}:${d.popular ? 1 : 0}:${d.imageDataUrl ? 1 : 0}:${recipe}:${customizer}`
    })
    .sort()
    .join('|')
}

export function MastersProvider({ children }: { children: ReactNode }) {
  const { token, companyId } = useAuth()
  const { activeBranchId } = useBranch()
  const { syncEpoch } = useSync()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [dishes, setDishes] = useState<MasterDish[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await migrateLocalStorageToDexie()
      const branchId = getActiveBranchId()
      const [cats, dsh] = await Promise.all([
        mastersRepo.listCategories(branchId),
        mastersRepo.listDishes(branchId),
      ])
      if (cancelled) return
      // Keep previous React references when content is unchanged (background sync must not blink UI).
      setCategories((prev) => (categoriesUiSig(prev) === categoriesUiSig(cats) ? prev : cats))
      setDishes((prev) => (dishesUiSig(prev) === dishesUiSig(dsh) ? prev : dsh))
      setReady(true)

      if (!apiMastersReady()) return
      try {
        const remote = (await apiListCategories(branchId))
          .map(fromApiCategory)
          .filter((c) => !isDemoCategory(c.id))
        if (cancelled) return
        const nextCats = await mastersRepo.replaceCategories(remote, branchId)
        setCategories((prev) => (categoriesUiSig(prev) === categoriesUiSig(nextCats) ? prev : nextCats))
      } catch {
        /* keep local categories */
      }

      try {
        const remoteDishes = (await apiListProducts(branchId))
          .map(fromApiProduct)
          .filter((d) => !isDemoDish(d.id) && !isDemoCategory(d.categoryId))
        if (cancelled) return
        // Empty remote list is authoritative (peer deleted all / wiped branch).
        const nextDishes = await mastersRepo.replaceDishes(remoteDishes, branchId)
        setDishes((prev) => (dishesUiSig(prev) === dishesUiSig(nextDishes) ? prev : nextDishes))
      } catch {
        /* keep local dishes */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, companyId, syncEpoch, activeBranchId])

  const saveCategory = useCallback(
    async (cat: MenuCategory) => {
      if (isDemoCategory(cat.id)) return
      const stamped = { ...cat, branchId: cat.branchId ?? getActiveBranchId() }
      setCategories((prev) =>
        prev.some((c) => c.id === stamped.id)
          ? prev.map((c) => (c.id === stamped.id ? stamped : c))
          : [...prev, stamped].sort((a, b) => a.sort - b.sort),
      )
      await mastersRepo.saveCategory(stamped)
      setDishes((prevDishes) => {
        const nextDishes = prevDishes.map((d) =>
          d.categoryId === stamped.id ? { ...d, category: stamped.name } : d,
        )
        for (const d of nextDishes.filter((x) => x.categoryId === stamped.id)) {
          void mastersRepo.saveDish(d)
        }
        return nextDishes
      })
      pushCategory(stamped)
    },
    [],
  )

  const deleteCategory = useCallback(
    async (id: string) => {
      if (dishes.some((d) => d.categoryId === id)) return
      if (categories.some((c) => c.parentId === id)) return
      const row = categories.find((c) => c.id === id)
      const next = categories.filter((c) => c.id !== id)
      setCategories(next)
      await mastersRepo.deleteCategory(id)
      enqueueOutbox(
        'masters.delete',
        id,
        { kind: 'category' },
        getDeviceId(),
        row?.branchId ?? getActiveBranchId(),
      )
      if (apiMastersReady()) {
        try {
          await apiDeleteCategory(id)
        } catch {
          /* outbox still carries the delete */
        }
      }
    },
    [categories, dishes],
  )

  const saveDish = useCallback(
    async (dish: MasterDish) => {
      if (isDemoDish(dish.id) || isDemoCategory(dish.categoryId)) return
      const cat = categories.find((c) => c.id === dish.categoryId)
      const nextDish = {
        ...dish,
        category: cat?.name ?? dish.category,
        branchId: dish.branchId ?? getActiveBranchId(),
        // Empty recipe must clear the flag — do not leave a stale [] vs undefined mismatch.
        recipe: dish.recipe?.length ? dish.recipe : undefined,
        customizer: dish.customizer || undefined,
      }
      const next = dishes.some((d) => d.id === dish.id)
        ? dishes.map((d) => (d.id === dish.id ? nextDish : d))
        : sortDishes([...dishes, nextDish])
      setDishes(next)
      void mastersRepo.saveDish(nextDish)
      pushDish(nextDish)
    },
    [categories, dishes],
  )

  const saveDishes = useCallback(
    async (rows: MasterDish[]) => {
      if (!rows.length) return 0
      const stamped: MasterDish[] = []
      for (const dish of rows) {
        if (isDemoDish(dish.id) || isDemoCategory(dish.categoryId)) continue
        const cat = categories.find((c) => c.id === dish.categoryId)
        stamped.push({
          ...dish,
          category: cat?.name ?? dish.category,
          branchId: dish.branchId ?? getActiveBranchId(),
        })
      }
      if (!stamped.length) return 0
      const byId = new Map(stamped.map((d) => [d.id, d]))
      const next = sortDishes(dishes.map((d) => byId.get(d.id) ?? d))
      for (const d of stamped) {
        if (!dishes.some((x) => x.id === d.id)) next.push(d)
      }
      setDishes(sortDishes(next))
      for (const d of stamped) {
        void mastersRepo.saveDish(d)
        pushDish(d)
      }
      return stamped.length
    },
    [categories, dishes],
  )

  const deleteDish = useCallback(
    async (id: string) => {
      const row = dishes.find((d) => d.id === id)
      const next = dishes.filter((d) => d.id !== id)
      setDishes(next)
      await mastersRepo.deleteDish(id)
      enqueueOutbox(
        'masters.delete',
        id,
        { kind: 'dish' },
        getDeviceId(),
        row?.branchId ?? getActiveBranchId(),
      )
      if (apiMastersReady()) {
        try {
          await apiDeleteProduct(id)
        } catch {
          /* outbox still carries the delete */
        }
      }
    },
    [dishes],
  )

  const resetMasters = useCallback(async () => {
    await mastersRepo.reset()
    setCategories([])
    setDishes([])
  }, [])

  const activeDishes = useMemo(
    () =>
      dishes.filter(
        (d) => d.active && categories.some((c) => c.id === d.categoryId && c.active),
      ),
    [dishes, categories],
  )

  const value = useMemo(
    () => ({
      categories: [...categories].sort((a, b) => a.sort - b.sort),
      dishes,
      activeDishes,
      ready,
      saveCategory: (cat: MenuCategory) => {
        void saveCategory(cat)
      },
      deleteCategory: (id: string) => deleteCategory(id),
      saveDish: (dish: MasterDish) => saveDish(dish),
      saveDishes: (rows: MasterDish[]) => saveDishes(rows),
      deleteDish: (id: string) => deleteDish(id),
      resetMasters: () => {
        void resetMasters()
      },
    }),
    [
      categories,
      dishes,
      activeDishes,
      ready,
      saveCategory,
      deleteCategory,
      saveDish,
      saveDishes,
      deleteDish,
      resetMasters,
    ],
  )

  return <MastersContext.Provider value={value}>{children}</MastersContext.Provider>
}

export function useMasters() {
  const ctx = useContext(MastersContext)
  if (!ctx) throw new Error('useMasters must be used inside MastersProvider')
  return ctx
}

export type { ItemCustomizer, MasterDish, MenuCategory, MenuItem }
