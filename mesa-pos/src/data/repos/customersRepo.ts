import type { CrmCustomer } from '../../state/CrmContext'
import { getActiveBranchId } from '../company'
import { mesaDb, tenantGetItem, tenantSetItem } from './db'

const LOCAL_COMPANY = 'co-mesa'
const DEMO_IDS = new Set(['c1', 'c2'])
const DEMO_PHONES = new Set(['+966501117788', '+966552228899'])

function belongsTo(row: CrmCustomer, companyId: string) {
  return (row.companyId ?? LOCAL_COMPANY) === companyId
}

function inBranch(row: CrmCustomer, branchId: string) {
  return row.branchId === branchId
}

export function isDemoGuest(row: { id: string; phone?: string }) {
  const phone = (row.phone ?? '').replace(/\s/g, '')
  return DEMO_IDS.has(row.id) || DEMO_PHONES.has(phone)
}

function scrubLocalCustomerCache(companyId: string) {
  for (const key of ['mesa-crm-customers', `mesa-crm-customers:${companyId}`]) {
    try {
      const raw = tenantGetItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as CrmCustomer[]
      if (!Array.isArray(parsed)) continue
      tenantSetItem(key, JSON.stringify(parsed.filter((c) => !isDemoGuest(c))))
    } catch {
      /* ignore */
    }
  }
  try {
    const raw = tenantGetItem('mesa-outbox')
    if (!raw) return
    const ops = JSON.parse(raw) as { type?: string; entityId?: string }[]
    if (!Array.isArray(ops)) return
    tenantSetItem(
      'mesa-outbox',
      JSON.stringify(
        ops.filter((op) => op.type !== 'customer.upsert' || !DEMO_IDS.has(op.entityId ?? '')),
      ),
    )
  } catch {
    /* ignore */
  }
}

export const customersRepo = {
  async list(companyId: string, branchId = getActiveBranchId()): Promise<CrmCustomer[]> {
    const rows = await mesaDb.customers.toArray()
    return rows.filter((c) => belongsTo(c, companyId) && inBranch(c, branchId) && !isDemoGuest(c))
  },

  async purgeDemoGuests(companyId: string) {
    const rows = await mesaDb.customers.toArray()
    const drop = rows.filter(isDemoGuest).map((c) => c.id)
    if (drop.length) await mesaDb.customers.bulkDelete(drop)
    scrubLocalCustomerCache(companyId)
  },

  async saveAll(companyId: string, customers: CrmCustomer[], branchId = getActiveBranchId()) {
    const others = (await mesaDb.customers.toArray()).filter(
      (c) => !belongsTo(c, companyId) || (c.branchId && c.branchId !== branchId),
    )
    const scoped = customers
      .filter((c) => !isDemoGuest(c))
      .map((c) => ({ ...c, companyId, branchId: c.branchId ?? branchId }))
    await mesaDb.customers.clear()
    await mesaDb.customers.bulkPut([...others, ...scoped])
    tenantSetItem(`mesa-crm-customers:${companyId}:${branchId}`, JSON.stringify(scoped))
  },

  async upsert(companyId: string, customer: CrmCustomer, branchId = getActiveBranchId()) {
    if (isDemoGuest(customer)) return this.list(companyId, branchId)
    await mesaDb.customers.put({ ...customer, companyId, branchId: customer.branchId ?? branchId })
    return this.list(companyId, branchId)
  },
}
