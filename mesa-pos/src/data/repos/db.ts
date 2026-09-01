import Dexie, { type EntityTable } from 'dexie'
import type { OutboxOp } from '../../sync/outbox'
import type { CrmCustomer } from '../../state/CrmContext'
import { isDemoCategory, isDemoDish, type MasterDish, type MenuCategory } from '../masters'
import type { KitchenTicket, OpenTicket, StockItem, Table } from '../mock'

export type KvRow = { key: string; value: unknown; updatedAt: string }
export type MesaMeta = { key: string; value: string }
export type FloorTableRow = Table & { branchId?: string }

const LEGACY_DB_NAME = 'mesa-pos'
const BOUND_DB_COMPANY_KEY = 'mesa-bound-db-company'

function sanitizeCompanyId(companyId: string) {
  return String(companyId || 'unbound').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

export function mesaDbNameFor(companyId: string) {
  return `${LEGACY_DB_NAME}__${sanitizeCompanyId(companyId)}`
}

class MesaDatabase extends Dexie {
  categories!: EntityTable<MenuCategory, 'id'>
  dishes!: EntityTable<MasterDish, 'id'>
  customers!: EntityTable<CrmCustomer, 'id'>
  stock!: EntityTable<StockItem, 'id'>
  tickets!: EntityTable<OpenTicket, 'id'>
  outbox!: EntityTable<OutboxOp, 'id'>
  kv!: EntityTable<KvRow, 'key'>
  meta!: EntityTable<MesaMeta, 'key'>
  kitchen!: EntityTable<KitchenTicket, 'id'>
  floorTables!: EntityTable<FloorTableRow, 'id'>

  constructor(companyId: string) {
    super(mesaDbNameFor(companyId))
    this.version(1).stores({
      categories: 'id, parentId, active, sort',
      dishes: 'id, categoryId, code, active',
      customers: 'id, phone, name',
      stock: 'id, name',
      tickets: 'id, type, openedAt',
      outbox: 'id, status, createdAt, type',
      kv: 'key, updatedAt',
      meta: 'key',
    })
    this.version(2).stores({
      categories: 'id, parentId, active, sort',
      dishes: 'id, categoryId, code, active',
      customers: 'id, phone, name',
      stock: 'id, name',
      tickets: 'id, type, openedAt, branchId',
      outbox: 'id, status, createdAt, type, branchId',
      kv: 'key, updatedAt',
      meta: 'key',
    })
    this.version(3).stores({
      categories: 'id, parentId, active, sort',
      dishes: 'id, categoryId, code, active',
      customers: 'id, phone, name, companyId',
      stock: 'id, name',
      tickets: 'id, type, openedAt, branchId',
      outbox: 'id, status, createdAt, type, branchId',
      kv: 'key, updatedAt',
      meta: 'key',
    })
    this.version(4).stores({
      categories: 'id, parentId, active, sort',
      dishes: 'id, categoryId, code, active',
      customers: 'id, phone, name, companyId',
      stock: 'id, name',
      tickets: 'id, type, openedAt, branchId, tableId',
      outbox: 'id, status, createdAt, type, branchId',
      kv: 'key, updatedAt',
      meta: 'key',
      kitchen: 'id, status, createdAt',
      floorTables: 'id, area, branchId',
    })
    this.version(5).stores({
      categories: 'id, parentId, active, sort',
      dishes: 'id, categoryId, code, active',
      customers: 'id, phone, name, companyId, branchId',
      stock: 'id, name',
      tickets: 'id, type, openedAt, branchId, tableId',
      outbox: 'id, status, createdAt, type, branchId',
      kv: 'key, updatedAt',
      meta: 'key',
      kitchen: 'id, status, createdAt',
      floorTables: 'id, area, branchId',
    })
    this.version(6).stores({
      categories: 'id, parentId, active, sort',
      dishes: 'id, categoryId, code, active',
      customers: 'id, phone, name, companyId, branchId',
      stock: 'id, name',
      tickets: 'id, type, openedAt, branchId, tableId',
      outbox: 'id, status, createdAt, type, branchId',
      kv: 'key, updatedAt',
      meta: 'key',
      kitchen: 'id, status, createdAt, branchId',
      floorTables: 'id, area, branchId',
    })
  }
}

function readBootCompanyId(): string {
  try {
    const raw = localStorage.getItem('mesa-terminal-company')
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string }
      if (parsed?.id) return parsed.id
    }
  } catch {
    /* ignore */
  }
  return localStorage.getItem(BOUND_DB_COMPANY_KEY) || 'co-mesa'
}

let activeCompanyId = typeof window !== 'undefined' ? readBootCompanyId() : 'co-mesa'
let impl: MesaDatabase = new MesaDatabase(activeCompanyId)

/** Live Dexie handle — always points at the active company's database. */
export const mesaDb: MesaDatabase = new Proxy({} as MesaDatabase, {
  get(_target, prop, receiver) {
    const value = Reflect.get(impl, prop, receiver)
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(impl) : value
  },
  set(_target, prop, value) {
    return Reflect.set(impl, prop, value)
  },
}) as MesaDatabase

export function activeMesaDbCompanyId() {
  return activeCompanyId
}

async function copyDexie(from: {
  categories: EntityTable<MenuCategory, 'id'>
  dishes: EntityTable<MasterDish, 'id'>
  customers: EntityTable<CrmCustomer, 'id'>
  stock: EntityTable<StockItem, 'id'>
  tickets: EntityTable<OpenTicket, 'id'>
  outbox: EntityTable<OutboxOp, 'id'>
  kitchen: EntityTable<KitchenTicket, 'id'>
  floorTables: EntityTable<FloorTableRow, 'id'>
  kv: EntityTable<KvRow, 'key'>
  meta: EntityTable<MesaMeta, 'key'>
}, to: MesaDatabase) {
  const [
    categories,
    dishes,
    customers,
    stock,
    tickets,
    outbox,
    kitchen,
    floorTables,
    kv,
    meta,
  ] = await Promise.all([
    from.categories.toArray(),
    from.dishes.toArray(),
    from.customers.toArray(),
    from.stock.toArray(),
    from.tickets.toArray(),
    from.outbox.toArray(),
    from.kitchen.toArray(),
    from.floorTables.toArray(),
    from.kv.toArray(),
    from.meta.toArray(),
  ])
  if (categories.length) await to.categories.bulkPut(categories)
  if (dishes.length) await to.dishes.bulkPut(dishes)
  if (customers.length) await to.customers.bulkPut(customers)
  if (stock.length) await to.stock.bulkPut(stock)
  if (tickets.length) await to.tickets.bulkPut(tickets)
  if (outbox.length) await to.outbox.bulkPut(outbox)
  if (kitchen.length) await to.kitchen.bulkPut(kitchen)
  if (floorTables.length) await to.floorTables.bulkPut(floorTables)
  if (kv.length) await to.kv.bulkPut(kv)
  if (meta.length) await to.meta.bulkPut(meta)
}

/** One-time: move legacy shared `mesa-pos` into this company's DB if empty. */
async function migrateLegacySharedDb(companyId: string, target: MesaDatabase) {
  const migratedFlag = `mesa-legacy-db-migrated::${sanitizeCompanyId(companyId)}`
  if (localStorage.getItem(migratedFlag) === '1') return
  const empty =
    (await target.tickets.count()) === 0 &&
    (await target.categories.count()) === 0 &&
    (await target.dishes.count()) === 0
  if (!empty) {
    localStorage.setItem(migratedFlag, '1')
    return
  }
  try {
    const names = await Dexie.getDatabaseNames()
    if (!names.includes(LEGACY_DB_NAME)) {
      localStorage.setItem(migratedFlag, '1')
      return
    }
    const legacyDb = new Dexie(LEGACY_DB_NAME)
    legacyDb.version(6).stores({
      categories: 'id, parentId, active, sort',
      dishes: 'id, categoryId, code, active',
      customers: 'id, phone, name, companyId, branchId',
      stock: 'id, name',
      tickets: 'id, type, openedAt, branchId, tableId',
      outbox: 'id, status, createdAt, type, branchId',
      kv: 'key, updatedAt',
      meta: 'key',
      kitchen: 'id, status, createdAt, branchId',
      floorTables: 'id, area, branchId',
    })
    await legacyDb.open()
    await copyDexie(
      {
        categories: legacyDb.table('categories'),
        dishes: legacyDb.table('dishes'),
        customers: legacyDb.table('customers'),
        stock: legacyDb.table('stock'),
        tickets: legacyDb.table('tickets'),
        outbox: legacyDb.table('outbox'),
        kitchen: legacyDb.table('kitchen'),
        floorTables: legacyDb.table('floorTables'),
        kv: legacyDb.table('kv'),
        meta: legacyDb.table('meta'),
      },
      target,
    )
    await legacyDb.close()
  } catch {
    /* legacy missing or unreadable */
  }
  localStorage.setItem(migratedFlag, '1')
}

/**
 * Open / switch the offline Dexie database for a company.
 * Each company gets its own IndexedDB: mesa-pos__{companyId}
 */
export async function openMesaDbForCompany(companyId: string) {
  const id = String(companyId || '').trim() || 'co-mesa'
  if (id === activeCompanyId && impl.isOpen()) {
    localStorage.setItem(BOUND_DB_COMPANY_KEY, id)
    return impl
  }
  const next = new MesaDatabase(id)
  await next.open()
  await migrateLegacySharedDb(id, next)
  try {
    await impl.close()
  } catch {
    /* ignore */
  }
  impl = next
  activeCompanyId = id
  localStorage.setItem(BOUND_DB_COMPANY_KEY, id)
  return impl
}

type DexieDump = {
  categories?: MenuCategory[]
  dishes?: MasterDish[]
  customers?: CrmCustomer[]
  stock?: StockItem[]
  tickets?: OpenTicket[]
  outbox?: OutboxOp[]
  kitchen?: KitchenTicket[]
  floorTables?: FloorTableRow[]
}

function mesaDisk() {
  return typeof window !== 'undefined' ? window.mesaDisk : undefined
}

async function collectDexieDump(): Promise<DexieDump> {
  return {
    categories: await mesaDb.categories.toArray(),
    dishes: await mesaDb.dishes.toArray(),
    customers: await mesaDb.customers.toArray(),
    stock: await mesaDb.stock.toArray(),
    tickets: await mesaDb.tickets.toArray(),
    outbox: await mesaDb.outbox.toArray(),
    kitchen: await mesaDb.kitchen.toArray(),
    floorTables: await mesaDb.floorTables.toArray(),
  }
}

export async function snapshotDexieToLocalStorage() {
  try {
    const dump = await collectDexieDump()
    const disk = mesaDisk()
    if (disk?.saveDexie) {
      const keyed = disk as { saveDexie: (dump: unknown, companyId?: string) => void }
      keyed.saveDexie(dump, activeCompanyId)
    }
  } catch {
    /* ignore */
  }
}

async function restoreDexieDump() {
  try {
    const disk = mesaDisk()
    if (!disk?.loadDexie) return
    const keyed = disk as { loadDexie: (companyId?: string) => unknown }
    const dump = keyed.loadDexie(activeCompanyId) as DexieDump | null | undefined
    if (!dump) return
    if (dump.categories?.length) await mesaDb.categories.bulkPut(dump.categories)
    if (dump.dishes?.length) await mesaDb.dishes.bulkPut(dump.dishes)
    if (dump.customers?.length) await mesaDb.customers.bulkPut(dump.customers)
    if (dump.stock?.length) await mesaDb.stock.bulkPut(dump.stock)
    if (dump.tickets?.length) await mesaDb.tickets.bulkPut(dump.tickets)
    if (dump.outbox?.length) await mesaDb.outbox.bulkPut(dump.outbox)
    if (dump.kitchen?.length) await mesaDb.kitchen.bulkPut(dump.kitchen)
    if (dump.floorTables?.length) await mesaDb.floorTables.bulkPut(dump.floorTables)
  } catch {
    /* ignore */
  }
}

/** Restore file-backed localStorage / Dexie snapshots, then fill any remaining gaps. */
export async function migrateLocalStorageToDexie() {
  await openMesaDbForCompany(activeCompanyId)
  await restoreDexieDump()
  const existingCats = await mesaDb.categories.toArray()
  try {
    const raw = tenantGetItem('mesa-master-categories')
    if (raw) {
      const parsed = (JSON.parse(raw) as MenuCategory[]).filter((c) => !isDemoCategory(c.id))
      const have = new Set(existingCats.map((c) => c.id))
      const missing = parsed.filter((c) => !have.has(c.id))
      if (missing.length) await mesaDb.categories.bulkPut(missing)
    }
  } catch {
    /* ignore */
  }

  const existingDishes = await mesaDb.dishes.toArray()
  try {
    const raw = tenantGetItem('mesa-master-dishes')
    if (raw) {
      const parsed = (JSON.parse(raw) as MasterDish[]).filter(
        (d) => !isDemoDish(d.id) && !isDemoCategory(d.categoryId),
      )
      const have = new Set(existingDishes.map((d) => d.id))
      const missing = parsed.filter((d) => !have.has(d.id))
      if (missing.length) await mesaDb.dishes.bulkPut(missing)
    }
  } catch {
    /* ignore */
  }

  const ticketCount = await mesaDb.tickets.count()
  if (ticketCount === 0) {
    try {
      const raw = tenantGetItem('mesa-open-tickets')
      if (raw) {
        const parsed = JSON.parse(raw) as OpenTicket[]
        if (parsed.length) await mesaDb.tickets.bulkPut(parsed)
      }
    } catch {
      /* ignore */
    }
  }

  const outboxCount = await mesaDb.outbox.count()
  if (outboxCount === 0) {
    try {
      const raw = tenantGetItem('mesa-outbox')
      if (raw) {
        const parsed = JSON.parse(raw) as OutboxOp[]
        if (parsed.length) await mesaDb.outbox.bulkPut(parsed)
      }
    } catch {
      /* ignore */
    }
  }

  const kotCount = await mesaDb.kitchen.count()
  if (kotCount === 0) {
    try {
      const raw = tenantGetItem('mesa-kitchen')
      if (raw) {
        const parsed = JSON.parse(raw) as KitchenTicket[]
        if (Array.isArray(parsed) && parsed.length) await mesaDb.kitchen.bulkPut(parsed)
      }
    } catch {
      /* ignore */
    }
  }
  await snapshotDexieToLocalStorage()
}

/** localStorage key scoped to the active company (shared keys stay global). */
const GLOBAL_STORAGE_KEYS = new Set([
  'mesa-terminal-company',
  'mesa-device-id',
  'mesa-lang',
  BOUND_DB_COMPANY_KEY,
])

export function tenantStorageKey(baseKey: string, companyId = activeCompanyId) {
  if (GLOBAL_STORAGE_KEYS.has(baseKey)) return baseKey
  if (!companyId) return baseKey
  return `${baseKey}::${sanitizeCompanyId(companyId)}`
}

export function tenantGetItem(baseKey: string) {
  const scoped = tenantStorageKey(baseKey)
  const direct = localStorage.getItem(scoped)
  if (direct != null) return direct
  if (scoped !== baseKey) {
    const legacy = localStorage.getItem(baseKey)
    if (legacy != null) {
      localStorage.setItem(scoped, legacy)
      return legacy
    }
  }
  return null
}

export function tenantSetItem(baseKey: string, value: string) {
  localStorage.setItem(tenantStorageKey(baseKey), value)
}

export function tenantRemoveItem(baseKey: string) {
  localStorage.removeItem(tenantStorageKey(baseKey))
  if (tenantStorageKey(baseKey) !== baseKey) localStorage.removeItem(baseKey)
}

if (typeof window !== 'undefined') {
  window.__mesaFlushDexie = snapshotDexieToLocalStorage
  if (window.mesaDisk) {
    window.setInterval(() => {
      void snapshotDexieToLocalStorage()
    }, 2000)
  }
}
