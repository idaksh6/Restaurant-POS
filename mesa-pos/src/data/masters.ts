export type MenuCategory = {
  id: string
  name: string
  sort: number
  active: boolean
  branchId?: string
  parentId?: string // if set → this is a sub-category under a main category
  /** Department list extras (ZKPOS-style) */
  alias?: string
  isBar?: boolean
  buttonColor?: string
  buttonHeight?: number
  buttonFontSize?: number
  productButtonColor?: string
  productButtonHeight?: number
  productButtonFontSize?: number
  deptFontColor?: string
  productFontColor?: string
  imageDataUrl?: string
}

export type VariationOption = {
  id: string
  name: string
  price: number
}

export type AddonOption = {
  id: string
  name: string
  price: number
  /** Override price per variation id. Falls back to price if not set. */
  variationPrices?: Record<string, number>
}

/** One section in the customizer (e.g. Pizza Addons, Choices, Cheese) */
export type AddonGroup = {
  id: string
  name: string
  /** Append size name → "Pizza Addons Medium" */
  appendVariationName?: boolean
  min: number
  max: number
  addons: AddonOption[]
}

export type ItemCustomizer = {
  title: string
  variationLabel: string
  variations: VariationOption[]
  addonGroups: AddonGroup[]
  /** @deprecated kept for older saved masters */
  addonGroupLabel?: string
  maxAddons?: number
  addons?: AddonOption[]
}

/** Normalize legacy flat addons → groups */
export function getAddonGroups(c: ItemCustomizer): AddonGroup[] {
  if (c.addonGroups?.length) return c.addonGroups
  return [
    {
      id: 'legacy',
      name: c.addonGroupLabel ?? 'Addons',
      appendVariationName: true,
      min: 0,
      max: c.maxAddons ?? 99,
      addons: c.addons ?? [],
    },
  ]
}

export type RecipeLine = {
  ingredientId?: string
  qty: number
  /** @deprecated use ingredientId — kept for older saved recipes */
  stockId?: string
}

/** Resolve ingredient id from a recipe line (legacy stockId supported). */
export function recipeLineIngredientId(line: {
  ingredientId?: string
  stockId?: string
}): string {
  return String(line.ingredientId || line.stockId || '')
}

export function normalizeRecipeLine(line: RecipeLine): RecipeLine {
  return { ingredientId: recipeLineIngredientId(line), qty: Number(line.qty) || 0 }
}

export type MasterDish = {
  id: string
  name: string
  categoryId: string
  category: string
  branchId?: string
  price: number
  code: string
  popular?: boolean
  active: boolean
  customizer?: ItemCustomizer
  recipe?: RecipeLine[]
  /** Product list extras (ZKPOS-style) */
  alias?: string
  unitId?: string
  cost?: number
  vendorId?: string
  hsn?: string
  details?: string
  productType?: 'single' | 'combo'
  /** Tax rate ids from tax master */
  taxIds?: string[]
  /** Allowed discount rate ids from discount master (empty = all active) */
  discountIds?: string[]
  /** Product photo (data URL) shown on the POS menu */
  imageDataUrl?: string
}

/** Normalize PLU / dish code for uniqueness checks. */
export function normalizeDishCode(code: string) {
  return code.trim().toLowerCase()
}

/** True when another dish already uses this code (same branch list). */
export function isDishCodeTaken(
  dishes: MasterDish[],
  code: string,
  excludeId?: string,
): boolean {
  const key = normalizeDishCode(code)
  if (!key) return false
  return dishes.some(
    (d) => d.id !== excludeId && normalizeDishCode(d.code) === key,
  )
}

/** Next unused numeric code (auto-suggest; user may still override manually). */
export function nextUniqueDishCode(dishes: MasterDish[], floor = 100): string {
  const used = new Set(
    dishes.map((d) => normalizeDishCode(d.code)).filter(Boolean),
  )
  let n = Math.max(floor, ...dishes.map((d) => Number(d.code) || 0)) + 1
  if (!Number.isFinite(n) || n < floor + 1) n = floor + 1
  while (used.has(String(n))) n += 1
  return String(n)
}

export const seedCategories: MenuCategory[] = [
  // ── Main categories ──────────────────────────────────────
  { id: 'main-food',      name: 'Food',       sort: 1, active: true },
  { id: 'main-pizza',     name: 'Pizza',      sort: 2, active: true },
  { id: 'main-beverages', name: 'Beverages',  sort: 3, active: true },
  { id: 'main-desserts',  name: 'Desserts',   sort: 4, active: true },

  // ── Sub-categories under Food ─────────────────────────────
  { id: 'cat-fav',      name: 'Favorite Items', sort: 1, active: true, parentId: 'main-food' },
  { id: 'cat-starters', name: 'Starters',       sort: 2, active: true, parentId: 'main-food' },
  { id: 'cat-mains',    name: 'Mains',          sort: 3, active: true, parentId: 'main-food' },
  { id: 'cat-grill',    name: 'Grill',          sort: 4, active: true, parentId: 'main-food' },
  { id: 'cat-sides',    name: 'Sides',          sort: 5, active: true, parentId: 'main-food' },
  { id: 'cat-kids',     name: 'Kids',           sort: 6, active: true, parentId: 'main-food' },

  // ── Sub-categories under Pizza ────────────────────────────
  { id: 'cat-pizza-fav',    name: 'Favorite Items',    sort: 1, active: true, parentId: 'main-pizza' },
  { id: 'cat-pizza-custom', name: 'Build Your Own',    sort: 2, active: true, parentId: 'main-pizza' },
  { id: 'cat-pizza-classic',name: 'Classic Pizzas',    sort: 3, active: true, parentId: 'main-pizza' },

  // ── Sub-categories under Beverages ────────────────────────
  { id: 'cat-drinks',     name: 'Cold Drinks',  sort: 1, active: true, parentId: 'main-beverages' },
  { id: 'cat-hot',        name: 'Hot Drinks',   sort: 2, active: true, parentId: 'main-beverages' },

  // ── Sub-categories under Desserts ─────────────────────────
  { id: 'cat-dessert',    name: 'Desserts',     sort: 1, active: true, parentId: 'main-desserts' },
]

export const DEMO_CATEGORY_IDS = new Set(seedCategories.map((c) => c.id))

export function isDemoCategory(id: string) {
  return DEMO_CATEGORY_IDS.has(id)
}

const pizzaVariations = [
  { id: 'v-s', name: 'Small', price: 29 },
  { id: 'v-m', name: 'Medium', price: 49 },
  { id: 'v-l', name: 'Large', price: 69 },
]

/** Build Your Own Taste — Petpooja-style multi-group customizer */
const pizzaCustomizer: ItemCustomizer = {
  title: 'Choose Four Toppings',
  variationLabel: 'Variation',
  variations: pizzaVariations,
  addonGroups: [
    {
      id: 'grp-addons',
      name: 'Pizza Addons',
      appendVariationName: true,
      min: 0,
      max: 5,
      addons: [
        { id: 'a1', name: 'Extra Cheese', price: 6, variationPrices: { 'v-s': 6, 'v-m': 10, 'v-l': 14 } },
        { id: 'a2', name: 'Thin Crust', price: 4, variationPrices: { 'v-s': 4, 'v-m': 6, 'v-l': 8 } },
        { id: 'a3', name: 'Pan Base', price: 4, variationPrices: { 'v-s': 4, 'v-m': 6, 'v-l': 8 } },
        { id: 'a4', name: 'Extra Toppings', price: 4, variationPrices: { 'v-s': 4, 'v-m': 6, 'v-l': 8 } },
        { id: 'a5', name: 'Cheese Burst', price: 12, variationPrices: { 'v-s': 12, 'v-m': 18, 'v-l': 24 } },
      ],
    },
    {
      id: 'grp-choices',
      name: 'Choose Your Pizza Choices',
      min: 4,
      max: 4,
      addons: [
        { id: 'c1', name: 'Onion', price: 0 },
        { id: 'c2', name: 'Tomato', price: 0 },
        { id: 'c3', name: 'Capsicum', price: 0 },
        { id: 'c4', name: 'Mushroom', price: 0 },
        { id: 'c5', name: 'Jalapeno', price: 0 },
        { id: 'c6', name: 'Red Paprika', price: 0 },
        { id: 'c7', name: 'Paneer', price: 0 },
        { id: 'c8', name: 'Sweet Corn', price: 0 },
        { id: 'c9', name: 'Soyabean', price: 0 },
        { id: 'c10', name: 'Pineapple', price: 0 },
        { id: 'c11', name: 'Green Beans', price: 0 },
        { id: 'c12', name: 'Black Olive', price: 0 },
      ],
    },
    {
      id: 'grp-cheese',
      name: 'Choose Your Pizza Cheese',
      min: 1,
      max: 1,
      addons: [
        { id: 'ch1', name: 'Mozzarella Cheese', price: 0 },
        { id: 'ch2', name: 'Creamy Cheese', price: 0 },
      ],
    },
  ],
}

const margheritaCustomizer: ItemCustomizer = {
  title: 'Customize Margherita',
  variationLabel: 'Variation',
  variations: [
    { id: 'vm-s', name: 'Small', price: 32 },
    { id: 'vm-m', name: 'Medium', price: 42 },
    { id: 'vm-l', name: 'Large', price: 55 },
  ],
  addonGroups: [
    {
      id: 'grp-marg-addons',
      name: 'Pizza Addons',
      appendVariationName: true,
      min: 0,
      max: 3,
      addons: [
        { id: 'ma1', name: 'Extra Cheese', price: 6, variationPrices: { 'vm-s': 6, 'vm-m': 10, 'vm-l': 14 } },
        { id: 'ma2', name: 'Thin Crust', price: 4, variationPrices: { 'vm-s': 4, 'vm-m': 6, 'vm-l': 8 } },
        { id: 'ma3', name: 'Basil', price: 0 },
        { id: 'ma4', name: 'Oregano', price: 0 },
      ],
    },
  ],
}

export const seedDishes: MasterDish[] = [
  // Food › Starters
  { id: 'm1',  code: '101', name: 'Tomato Bisque',      categoryId: 'cat-starters', category: 'Starters',      price: 28.12, popular: true,  active: true, recipe: [{ stockId: 's4', qty: 0.2 }] },
  { id: 'm2',  code: '102', name: 'Burrata & Peach',    categoryId: 'cat-starters', category: 'Starters',      price: 41.25,               active: true, recipe: [{ stockId: 's5', qty: 1 }] },
  { id: 'm3',  code: '103', name: 'Crispy Calamari',    categoryId: 'cat-starters', category: 'Starters',      price: 35.62, popular: true,  active: true },
  // Food › Mains
  { id: 'm4',  code: '201', name: 'Herb Roast Chicken', categoryId: 'cat-mains',    category: 'Mains',         price: 69.38, popular: true,  active: true, recipe: [{ stockId: 's2', qty: 0.35 }] },
  { id: 'm5',  code: '202', name: 'Mushroom Risotto',   categoryId: 'cat-mains',    category: 'Mains',         price: 60,                    active: true, recipe: [{ stockId: 's3', qty: 0.15 }] },
  { id: 'm6',  code: '203', name: 'Catch of the Day',   categoryId: 'cat-mains',    category: 'Mains',         price: 82.5,                  active: true, recipe: [{ stockId: 's10', qty: 0.3 }] },
  // Food › Grill
  { id: 'm7',  code: '301', name: 'Ribeye 300g',        categoryId: 'cat-grill',    category: 'Grill',         price: 127.5, popular: true,  active: true, recipe: [{ stockId: 's1', qty: 0.3 }] },
  { id: 'm8',  code: '302', name: 'Lamb Chops',         categoryId: 'cat-grill',    category: 'Grill',         price: 106.88,               active: true },
  // Food › Sides
  { id: 'm34', code: '601', name: 'Fries',              categoryId: 'cat-sides',    category: 'Sides',         price: 15,    popular: true,  active: true },
  { id: 'm35', code: '602', name: 'Garlic Bread',       categoryId: 'cat-sides',    category: 'Sides',         price: 12,                    active: true },
  // Food › Kids
  { id: 'm39', code: '702', name: 'Kids Nuggets',       categoryId: 'cat-kids',     category: 'Kids',          price: 30,    popular: true,  active: true },
  { id: 'm40', code: '703', name: 'Kids Pasta',         categoryId: 'cat-kids',     category: 'Kids',          price: 25,                    active: true },
  // Pizza › Build Your Own
  {
    id: 'm-pizza', code: '801', name: 'Build Your Own Taste',
    categoryId: 'cat-pizza-custom', category: 'Build Your Own',
    price: 49, popular: true, active: true, customizer: pizzaCustomizer,
    recipe: [{ stockId: 's4', qty: 0.2 }, { stockId: 's5', qty: 0.5 }],
  },
  // Pizza › Classic Pizzas
  {
    id: 'm-pizza-marg', code: '802', name: 'Margherita',
    categoryId: 'cat-pizza-classic', category: 'Classic Pizzas',
    price: 39, popular: true, active: true,
    customizer: margheritaCustomizer,
    recipe: [{ stockId: 's4', qty: 0.15 }, { stockId: 's5', qty: 0.4 }],
  },
  { id: 'm-pizza-pep', code: '803', name: 'Pepperoni',          categoryId: 'cat-pizza-classic', category: 'Classic Pizzas', price: 45, active: true, recipe: [{ stockId: 's4', qty: 0.15 }, { stockId: 's2', qty: 0.1 }] },
  { id: 'm-pizza-bbq', code: '804', name: 'BBQ Chicken',        categoryId: 'cat-pizza-classic', category: 'Classic Pizzas', price: 48, active: true, recipe: [{ stockId: 's2', qty: 0.2 }, { stockId: 's4', qty: 0.1 }] },
  // Pizza › Favorite Items
  { id: 'm-pizza-fav1', code: '805', name: 'Four Cheese',       categoryId: 'cat-pizza-fav',     category: 'Favorite Items', price: 52, popular: true, active: true, recipe: [{ stockId: 's5', qty: 0.8 }] },
  // Beverages › Cold Drinks
  { id: 'm9',  code: '401', name: 'House Lemonade',    categoryId: 'cat-drinks', category: 'Cold Drinks',  price: 16.88, popular: true, active: true },
  { id: 'm11', code: '403', name: 'Sparkling Water',   categoryId: 'cat-drinks', category: 'Cold Drinks',  price: 13.12,               active: true },
  { id: 'm42', code: '404', name: 'Fresh Orange Juice',categoryId: 'cat-drinks', category: 'Cold Drinks',  price: 18,    popular: true, active: true },
  // Beverages › Hot Drinks
  { id: 'm10', code: '402', name: 'Espresso',          categoryId: 'cat-hot',    category: 'Hot Drinks',   price: 11.25,               active: true },
  { id: 'm43', code: '405', name: 'Cappuccino',        categoryId: 'cat-hot',    category: 'Hot Drinks',   price: 14,    popular: true, active: true },
  { id: 'm44', code: '406', name: 'Arabic Qahwa',      categoryId: 'cat-hot',    category: 'Hot Drinks',   price: 12,                  active: true },
  // Desserts
  { id: 'm12', code: '501', name: 'Chocolate Fondant', categoryId: 'cat-dessert', category: 'Desserts',    price: 31.88, popular: true, active: true },
  { id: 'm13', code: '502', name: 'Citrus Panna Cotta',categoryId: 'cat-dessert', category: 'Desserts',    price: 28.12,               active: true },
  { id: 'm14', code: '503', name: 'Umm Ali',           categoryId: 'cat-dessert', category: 'Desserts',    price: 22,    popular: true, active: true },
]

export const DEMO_DISH_IDS = new Set(seedDishes.map((d) => d.id))

export function isDemoDish(id: string) {
  return DEMO_DISH_IDS.has(id)
}

const STARTER_CATEGORY_BASE: Array<Omit<MenuCategory, 'branchId'>> = [
  { id: 'dept-food', name: 'Food', alias: 'الطعام', sort: 1, active: true },
  { id: 'dept-pizza', name: 'Pizza', alias: 'البيتزا', sort: 2, active: true },
  { id: 'dept-beverages', name: 'Beverages', alias: 'المشروبات', sort: 3, active: true },
  { id: 'dept-desserts', name: 'Desserts', alias: 'الحلويات', sort: 4, active: true },
  { id: 'sub-starters', name: 'Starters', alias: 'المقبلات', sort: 1, active: true, parentId: 'dept-food' },
  { id: 'sub-mains', name: 'Mains', alias: 'الأطباق الرئيسية', sort: 2, active: true, parentId: 'dept-food' },
  { id: 'sub-grill', name: 'Grill', alias: 'المشويات', sort: 3, active: true, parentId: 'dept-food' },
  { id: 'sub-sides', name: 'Sides', alias: 'الجانبية', sort: 4, active: true, parentId: 'dept-food' },
  { id: 'sub-pizza-classic', name: 'Classic', alias: 'كلاسيك', sort: 1, active: true, parentId: 'dept-pizza' },
  { id: 'sub-cold', name: 'Cold Drinks', alias: 'باردة', sort: 1, active: true, parentId: 'dept-beverages' },
  { id: 'sub-hot', name: 'Hot Drinks', alias: 'ساخنة', sort: 2, active: true, parentId: 'dept-beverages' },
  { id: 'sub-sweets', name: 'Sweets', alias: 'حلويات', sort: 1, active: true, parentId: 'dept-desserts' },
]

const STARTER_DISH_BASE: Array<Omit<MasterDish, 'branchId'>> = [
  { id: 'p-hummus', code: '101', name: 'Hummus', alias: 'حمص', categoryId: 'sub-starters', category: 'Starters', price: 18, cost: 6, popular: true, active: true },
  { id: 'p-mutabbal', code: '102', name: 'Mutabbal', alias: 'متبل', categoryId: 'sub-starters', category: 'Starters', price: 18, cost: 6, active: true },
  { id: 'p-fattoush', code: '103', name: 'Fattoush', alias: 'فتوش', categoryId: 'sub-starters', category: 'Starters', price: 22, cost: 7, popular: true, active: true },
  { id: 'p-kabsa', code: '201', name: 'Chicken Kabsa', alias: 'كبسة دجاج', categoryId: 'sub-mains', category: 'Mains', price: 42, cost: 16, popular: true, active: true },
  { id: 'p-mandi', code: '202', name: 'Lamb Mandi', alias: 'مندي لحم', categoryId: 'sub-mains', category: 'Mains', price: 58, cost: 24, active: true },
  { id: 'p-mixed-grill', code: '301', name: 'Mixed Grill', alias: 'مشويات مشكلة', categoryId: 'sub-grill', category: 'Grill', price: 72, cost: 28, popular: true, active: true },
  { id: 'p-shish', code: '302', name: 'Shish Tawook', alias: 'شيش طاووق', categoryId: 'sub-grill', category: 'Grill', price: 38, cost: 14, active: true },
  { id: 'p-fries', code: '401', name: 'Fries', alias: 'بطاطس', categoryId: 'sub-sides', category: 'Sides', price: 12, cost: 3, popular: true, active: true },
  { id: 'p-bread', code: '402', name: 'Arabic Bread', alias: 'خبز عربي', categoryId: 'sub-sides', category: 'Sides', price: 4, cost: 1, active: true },
  { id: 'p-margherita', code: '501', name: 'Margherita', alias: 'مارغريتا', categoryId: 'sub-pizza-classic', category: 'Classic', price: 39, cost: 12, popular: true, active: true },
  { id: 'p-pepperoni', code: '502', name: 'Pepperoni', alias: 'بيبروني', categoryId: 'sub-pizza-classic', category: 'Classic', price: 45, cost: 15, active: true },
  { id: 'p-lemonade', code: '601', name: 'House Lemonade', alias: 'ليمونادة', categoryId: 'sub-cold', category: 'Cold Drinks', price: 14, cost: 3, popular: true, active: true },
  { id: 'p-orange', code: '602', name: 'Fresh Orange Juice', alias: 'عصير برتقال', categoryId: 'sub-cold', category: 'Cold Drinks', price: 16, cost: 5, active: true },
  { id: 'p-qahwa', code: '701', name: 'Arabic Qahwa', alias: 'قهوة عربية', categoryId: 'sub-hot', category: 'Hot Drinks', price: 12, cost: 3, popular: true, active: true },
  { id: 'p-cappuccino', code: '702', name: 'Cappuccino', alias: 'كابتشينو', categoryId: 'sub-hot', category: 'Hot Drinks', price: 16, cost: 4, active: true },
  { id: 'p-umm-ali', code: '801', name: 'Umm Ali', alias: 'أم علي', categoryId: 'sub-sweets', category: 'Sweets', price: 22, cost: 7, popular: true, active: true },
  { id: 'p-kunafa', code: '802', name: 'Kunafa', alias: 'كنافة', categoryId: 'sub-sweets', category: 'Sweets', price: 28, cost: 9, active: true },
]

export function scopedId(baseId: string, branchId: string) {
  return `${baseId}__${branchId}`
}

export function starterCatalogForBranch(branchId: string) {
  const tag = (id: string) => scopedId(id, branchId)
  const categories: MenuCategory[] = STARTER_CATEGORY_BASE.map((c) => ({
    ...c,
    id: tag(c.id),
    parentId: c.parentId ? tag(c.parentId) : undefined,
    branchId,
  }))
  const dishes: MasterDish[] = STARTER_DISH_BASE.map((d) => ({
    ...d,
    id: tag(d.id),
    categoryId: tag(d.categoryId),
    branchId,
  }))
  return { categories, dishes }
}

export function withStarterCatalog(
  categories: MenuCategory[],
  dishes: MasterDish[],
  branchId: string,
) {
  const cats = categories.filter((c) => !c.branchId || c.branchId === branchId)
  const dsh = dishes.filter((d) => !d.branchId || d.branchId === branchId)
  const starter = starterCatalogForBranch(branchId)
  // Categories and dishes are independent. Passing [] for one side used to
  // replace the other side with the starter catalog and drop user products.
  return {
    categories: cats.length ? cats.sort((a, b) => a.sort - b.sort) : starter.categories,
    dishes: dsh.length ? dsh : starter.dishes,
  }
}

/** Compatibility shape used by ordering screens */
export type MenuItem = MasterDish
