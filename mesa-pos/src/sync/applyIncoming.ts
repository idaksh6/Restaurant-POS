import {
  lineTotal,
  type KitchenTicket,
  type OpenTicket,
  type OrderLine,
  type OrderType,
  type StockItem,
  type Table,
} from '../data/mock'
import { migrateStockItem } from '../data/stockLocations'
import { customersRepo } from '../data/repos/customersRepo'
import { floorRepo } from '../data/repos/floorRepo'
import { mastersRepo } from '../data/repos/mastersRepo'
import { notifyTicketsSynced, ticketsRepo } from '../data/repos/ticketsRepo'
import { mesaDb, tenantGetItem, tenantSetItem } from '../data/repos/db'
import {
  COMPANY_SESSION_EVENT,
  getActiveBranchId,
  hydrateCompanySession,
  loadBranches,
  saveBranches,
  saveCompanyProfile,
  setActiveBranchId,
  type Branch,
  type CompanyProfile,
} from '../data/company'
import {
  isDemoFoodVoucher,
  loadBatches,
  loadCodes,
  saveBatches,
  saveCodes,
  type FoodVoucherBatch,
  type FoodVoucherCode,
} from '../data/foodVouchers'
import { fromApiGiftCard, isDemoGiftCard, loadGiftCards, saveGiftCards } from '../data/giftCards'
import {
  fromApiLedgerEntry,
  loadAllLedger,
  mergeRemoteLedger,
  saveDayClosed,
  saveLedger,
  todayKey,
  type LedgerEntry,
} from '../data/ledger'
import {
  fromApiShift,
  loadAllShifts,
  mergeRemoteShifts,
  saveAllShifts,
  type ShiftRecord,
} from '../data/shifts'
import {
  fromApiReceipt,
  loadAllReceipts,
  mergeRemoteReceipts,
  saveAllReceipts,
  type StockReceipt,
} from '../data/stockReceiving'
import {
  fromApiPO,
  loadAllPOs,
  mergeRemotePOs,
  saveAllPOs,
  type PurchaseOrder,
} from '../data/purchasing'
import {
  fromApiTransfer,
  loadAllTransfers,
  mergeRemoteTransfers,
  saveAllTransfers,
  type StockTransfer,
} from '../data/stockTransfers'
import { fromApiTimetable, isDemoTimetable, loadTimetables, saveTimetables } from '../data/menuTimetable'
import {
  fromApiAudit,
  loadAllAudit,
  mergeRemoteAudit,
  saveAuditLog,
  type AuditEntry,
} from '../hardware/audit'
import {
  fromApiExpenseDetail,
  fromApiExpenseType,
  fromApiPaymentType,
  isDemoExpenseDetail,
  isDemoExpenseType,
  isDemoPaymentType,
  loadExpenseDetails,
  loadExpenseTypes,
  loadPaymentTypes,
  saveExpenseDetails,
  saveExpenseTypes,
  savePaymentTypes,
} from '../data/paymentTypes'
import { fromApiTax, isDemoTax, loadTaxes, saveTaxes } from '../data/tax'
import { fromApiDiscount, loadDiscounts, saveDiscounts } from '../data/discount'
import { fromApiUnit, isDemoUnit, loadUnits, saveUnits } from '../data/units'
import {
  fromApiCharge,
  isDemoCharge,
  loadAllCharges,
  saveAllCharges,
} from '../data/charges'
import { fromApiRider, isDemoRider, loadAllRiders, saveAllRiders } from '../data/deliveryRiders'
import { fromApiPrinter, loadAllPrinters, saveAllPrinters } from '../data/printers'
import type { ItemCustomizer, MasterDish, MenuCategory } from '../data/masters'
import { recipeLineIngredientId } from '../data/masters'
import type { CrmCustomer } from '../state/CrmContext'
import { getDeviceId } from './deviceId'
import { accessOutboxOverlay } from './accessOutbox'
import { companyOutboxOverlay } from './companyOutbox'
import {
  activeCompanyId,
  fromApiRole,
  loadManagedRoles,
  mergeRemoteRoles,
  saveManagedRoles,
} from '../auth/roles'
import {
  fromApiUser,
  loadManagedUsers,
  mergeRemoteUsers,
  saveManagedUsers,
} from '../data/staffUsers'
import { applySeq, fromApiSeq, hydrateSequences } from '../data/sequences'
import { enqueueOutbox, dropPendingUpsertsFor, loadOutbox, type OutboxOpType } from './outbox'
import { toCompanyProfile } from '../lib/apiMasters'
import { mapApiBranches } from '../lib/branding'

export type SyncEntity = {
  id?: string
  deviceId?: string
  type?: string
  entityId?: string
  payload?: unknown
  branchId?: string | null
  createdAt?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function upsertById<T extends { id: string }>(rows: T[], row: T) {
  const idx = rows.findIndex((r) => r.id === row.id)
  if (idx >= 0) {
    const next = [...rows]
    next[idx] = row
    return next
  }
  return [...rows, row]
}

function pick(row: Record<string, unknown>, nested: Record<string, unknown>, key: string) {
  return row[key] !== undefined && row[key] !== null ? row[key] : nested[key]
}

function stampFrom(row: Record<string, unknown>, nested: Record<string, unknown>): number {
  const raw = nested.updatedAt ?? row.updatedAt
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const asNum = Number(raw)
    if (Number.isFinite(asNum) && asNum > 1e11) return asNum
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export function ticketFromServer(row: Record<string, unknown>): OpenTicket | null {
  if (!row?.id) return null
  const nested = asRecord(row.payload)
  const type = String(pick(row, nested, 'type') ?? 'takeaway') as OrderType
  const status = String(pick(row, nested, 'checkStatus') ?? row.status ?? nested.checkStatus ?? 'open')
  if (status === 'settled') return null
  const linesRaw = pick(row, nested, 'lines')
  const lines = (Array.isArray(linesRaw) ? linesRaw : []) as OrderLine[]
  const kitchen = asRecord(pick(row, nested, 'kitchen'))
  const tableId = pick(row, nested, 'tableId')
  const phone = pick(row, nested, 'phone')
  const address = pick(row, nested, 'address')
  const deliveryBoyId = pick(row, nested, 'deliveryBoyId')
  const deliveryFee = pick(row, nested, 'deliveryFee')
  const deliveryStatus = pick(row, nested, 'deliveryStatus')
  const dispatchedAt = pick(row, nested, 'dispatchedAt')
  const deliveredAt = pick(row, nested, 'deliveredAt')
  const deliveryOtp = pick(row, nested, 'deliveryOtp')
  const externalOrderId = pick(row, nested, 'externalOrderId')
  const channelAcceptStatus = pick(row, nested, 'channelAcceptStatus')
  const channel = pick(row, nested, 'channel')
  const branchId = pick(row, nested, 'branchId') ?? (String(row.id).startsWith('dine:') ? String(row.id).split(':')[1] : undefined)
  const guests = pick(row, nested, 'guests')
  const kitchenStatus = pick(row, nested, 'kitchenStatus') ?? kitchen.status
  const kitchenPriority = pick(row, nested, 'kitchenPriority') ?? kitchen.priority
  const kitchenDismissed = pick(row, nested, 'kitchenDismissed')
  const held = pick(row, nested, 'held')
  const heldAt = pick(row, nested, 'heldAt')
  const discountPct = pick(row, nested, 'discountPct')
  const chargeIds = pick(row, nested, 'chargeIds')
  const amount = pick(row, nested, 'amount')
  const dineTable = tableId
    ? String(tableId)
    : type === 'dine-in' && String(row.id).startsWith('dine:')
      ? String(row.id).split(':').slice(2).join(':')
      : undefined
  const statusVal = deliveryStatus ? String(deliveryStatus) : undefined
  const allowedStatus = ['new', 'preparing', 'ready', 'dispatched', 'delivered'] as const
  const parsedDeliveryStatus = allowedStatus.includes(statusVal as (typeof allowedStatus)[number])
    ? (statusVal as OpenTicket['deliveryStatus'])
    : undefined
  return {
    id: String(row.id),
    type,
    customer: String(pick(row, nested, 'customer') ?? 'Guest'),
    phone: phone ? String(phone) : undefined,
    address: address ? String(address) : undefined,
    deliveryBoyId: deliveryBoyId ? String(deliveryBoyId) : undefined,
    deliveryFee: deliveryFee != null ? Number(deliveryFee) : undefined,
    deliveryStatus: parsedDeliveryStatus,
    dispatchedAt: dispatchedAt ? String(dispatchedAt) : undefined,
    deliveredAt: deliveredAt ? String(deliveredAt) : undefined,
    deliveryOtp: deliveryOtp ? String(deliveryOtp) : undefined,
    externalOrderId: externalOrderId ? String(externalOrderId) : undefined,
    channelAcceptStatus: channelAcceptStatus
      ? (String(channelAcceptStatus) as OpenTicket['channelAcceptStatus'])
      : undefined,
    openedAt: String(pick(row, nested, 'openedAt') ?? ''),
    lines,
    channel: channel ? String(channel) : undefined,
    branchId: branchId ? String(branchId) : undefined,
    tableId: dineTable,
    guests: guests != null ? Number(guests) : undefined,
    checkStatus: status === 'billing' ? 'billing' : 'open',
    kitchenStatus: kitchenStatus ? (String(kitchenStatus) as OpenTicket['kitchenStatus']) : undefined,
    kitchenPriority: kitchenPriority
      ? (kitchenPriority as OpenTicket['kitchenPriority'])
      : undefined,
    ...(kitchenDismissed != null
      ? { kitchenDismissed: kitchenDismissed === true || kitchenDismissed === 'true' }
      : {}),
    ...(held != null ? { held: held === true || held === 'true' } : {}),
    heldAt: heldAt ? String(heldAt) : undefined,
    discountPct: discountPct != null ? Number(discountPct) : undefined,
    chargeIds: Array.isArray(chargeIds) ? chargeIds.map(String) : undefined,
    amount: amount != null ? Number(amount) : undefined,
    updatedAt:
      stampFrom(row, nested) ||
      (row.updatedAt != null ? new Date(String(row.updatedAt)).getTime() : 0) ||
      undefined,
  }
}

export function kitchenFromTicket(ticket: OpenTicket): KitchenTicket | null {
  const sent = ticket.lines.filter((l) => l.sent)
  // Only show on KOT when items were actually sent — kitchenStatus alone is not enough
  if (!sent.length) return null
  // Staff cleared this ticket from the board with Done
  if (ticket.kitchenDismissed) return null
  return {
    id: `kot-${ticket.id}`,
    source:
      ticket.type === 'dine-in'
        ? `Table ${ticket.customer.replace(/^Table\s+/i, '')}`
        : `${ticket.type} · ${ticket.customer}`,
    priority: ticket.kitchenPriority ?? 'normal',
    status: ticket.kitchenStatus ?? 'queued',
    createdAt: ticket.openedAt,
    lines: sent.map((l) => ({ name: l.name, qty: l.qty, itemId: l.itemId })),
    branchId: ticket.branchId,
  }
}

async function applyCatalog(kind: string, row: Record<string, unknown>, remove = false) {
  const id = String(row.id ?? '')
  if (!id) return
  if (kind === 'giftCard') {
    const mapped = fromApiGiftCard(row)
    if (isDemoGiftCard(mapped.id)) return
    const next = remove
      ? loadGiftCards().filter((g) => g.id !== id)
      : upsertById(loadGiftCards(), mapped)
    saveGiftCards(next)
  } else if (kind === 'tax') {
    const mapped = fromApiTax(row)
    if (isDemoTax(mapped.id)) return
    let next = remove
      ? loadTaxes().filter((t) => t.id !== id)
      : upsertById(loadTaxes(), mapped)
    if (!remove && mapped.isDefault) {
      next = next.map((t) => ({ ...t, isDefault: t.id === mapped.id }))
    }
    saveTaxes(next)
  } else if (kind === 'discount') {
    const mapped = fromApiDiscount(row)
    let next = remove
      ? loadDiscounts().filter((d) => d.id !== id)
      : upsertById(loadDiscounts(), mapped)
    if (!remove && mapped.isDefault) {
      next = next.map((d) => ({ ...d, isDefault: d.id === mapped.id }))
    }
    saveDiscounts(next)
  } else if (kind === 'unit') {
    const mapped = fromApiUnit(row)
    if (isDemoUnit(mapped.id)) return
    saveUnits(remove ? loadUnits().filter((u) => u.id !== id) : upsertById(loadUnits(), mapped))
  } else if (kind === 'paymentType') {
    const mapped = fromApiPaymentType(row)
    if (isDemoPaymentType(mapped.id)) return
    savePaymentTypes(
      remove ? loadPaymentTypes().filter((p) => p.id !== id) : upsertById(loadPaymentTypes(), mapped),
    )
  } else if (kind === 'expenseType') {
    const mapped = fromApiExpenseType(row)
    if (isDemoExpenseType(mapped.id)) return
    saveExpenseTypes(
      remove ? loadExpenseTypes().filter((e) => e.id !== id) : upsertById(loadExpenseTypes(), mapped),
    )
  } else if (kind === 'expenseDetail') {
    const mapped = fromApiExpenseDetail(row)
    if (isDemoExpenseDetail(mapped.id) || isDemoExpenseType(mapped.expenseTypeId)) return
    saveExpenseDetails(
      remove
        ? loadExpenseDetails().filter((e) => e.id !== id)
        : upsertById(loadExpenseDetails(), mapped),
    )
  } else if (kind === 'timetable') {
    const mapped = fromApiTimetable(row)
    if (isDemoTimetable(mapped.id)) return
    saveTimetables(
      remove ? loadTimetables().filter((t) => t.id !== id) : upsertById(loadTimetables(), mapped),
    )
  } else if (kind === 'extraCharge') {
    const mapped = fromApiCharge(row)
    if (isDemoCharge(mapped.id)) return
    saveAllCharges(
      remove ? loadAllCharges().filter((c) => c.id !== id) : upsertById(loadAllCharges(), mapped),
    )
  } else if (kind === 'deliveryRider') {
    const mapped = fromApiRider(row)
    if (isDemoRider(mapped.id)) return
    saveAllRiders(
      remove ? loadAllRiders().filter((r) => r.id !== id) : upsertById(loadAllRiders(), mapped),
    )
  } else if (kind === 'printStation') {
    const mapped = fromApiPrinter(row)
    saveAllPrinters(
      remove
        ? loadAllPrinters().filter((p) => p.id !== id)
        : upsertById(loadAllPrinters(), mapped),
    )
  }
}

function opBranch(entity: SyncEntity, payload: Record<string, unknown>) {
  const value = entity.branchId ?? payload.branchId
  return value ? String(value) : ''
}

function isOtherBranch(entity: SyncEntity, payload: Record<string, unknown>) {
  const br = opBranch(entity, payload)
  return Boolean(br && br !== getActiveBranchId())
}

export async function applyIncoming(entities: SyncEntity[], localDeviceId = getDeviceId()) {
  let applied = 0
  let ticketsTouched = false
  for (const entity of entities) {
    if (entity.deviceId && entity.deviceId === localDeviceId) continue
    const type = entity.type as OutboxOpType | undefined
    if (!type) continue
    const payload = asRecord(entity.payload)
    const entityId = String(entity.entityId ?? payload.id ?? '')
    try {
      switch (type) {
        case 'masters.upsert':
          if (payload.kind === 'category' && payload.cat) {
            await mastersRepo.saveCategory(payload.cat as MenuCategory)
          } else if (payload.kind === 'dish' && payload.dish) {
            await mastersRepo.saveDish(payload.dish as MasterDish)
          }
          break
        case 'masters.delete':
          if (payload.kind === 'category') {
            dropPendingUpsertsFor(entityId, 'masters.upsert')
            await mastersRepo.deleteCategory(entityId)
          } else if (payload.kind === 'dish') {
            dropPendingUpsertsFor(entityId, 'masters.upsert')
            await mastersRepo.deleteDish(entityId)
          }
          break
        case 'customer.upsert':
          await customersRepo.upsert(
            String(payload.companyId ?? 'co-mesa'),
            payload as unknown as CrmCustomer,
            opBranch(entity, payload) || getActiveBranchId(),
          )
          break
        case 'ticket.create':
        case 'ticket.update': {
          const incoming = ticketFromServer({ ...payload, id: entityId, branchId: entity.branchId ?? payload.branchId })
          if (incoming) {
            await ticketsRepo.put(incoming, incoming.branchId ?? getActiveBranchId())
            ticketsTouched = true
          }
          break
        }
        case 'ticket.settle':
          await ticketsRepo.remove(entityId)
          await mesaDb.kitchen.delete(`kot-${entityId}`).catch(() => undefined)
          ticketsTouched = true
          break
        case 'ticket.line.upsert': {
          const ticketId = String(payload.ticketId ?? entityId)
          const current = await mesaDb.tickets.get(ticketId)
          if (current) {
            const line = asRecord(payload.line)
            const lines = [...current.lines]
            const idx = lines.findIndex((l) => l.id === String(line.id))
            if (idx >= 0) lines[idx] = { ...lines[idx], ...(line as unknown as OrderLine) }
            else lines.push(line as unknown as OrderLine)
            await ticketsRepo.put({
              ...current,
              lines,
              amount: lineTotal(lines),
              updatedAt: Date.now(),
            })
            ticketsTouched = true
          }
          break
        }
        case 'ticket.line.void': {
          const ticketId = String(payload.ticketId ?? entityId)
          const current = await mesaDb.tickets.get(ticketId)
          if (current) {
            const lines = current.lines.filter((l) => l.id !== String(payload.lineId ?? payload.id))
            await ticketsRepo.put({
              ...current,
              lines,
              amount: lineTotal(lines),
              updatedAt: Date.now(),
            })
            ticketsTouched = true
          }
          break
        }
        case 'kot.send':
        case 'kot.status': {
          if (isOtherBranch(entity, payload)) break
          const ticketId = String(payload.ticketId ?? entityId)
          const current = await mesaDb.tickets.get(ticketId)
          // Never keep a KOT for a ticket that is already gone (settled / cancelled)
          if (!current || current.checkStatus === 'settled') {
            await mesaDb.kitchen.delete(`kot-${ticketId}`).catch(() => undefined)
            break
          }
          const existingKot = await mesaDb.kitchen.get(`kot-${ticketId}`)
          const kot: KitchenTicket = {
            id: `kot-${ticketId}`,
            source: String(payload.source ?? existingKot?.source ?? ticketId),
            priority: (payload.priority as KitchenTicket['priority']) ?? existingKot?.priority ?? 'normal',
            status: (payload.status as KitchenTicket['status']) ?? existingKot?.status ?? 'queued',
            createdAt: String(payload.createdAt ?? existingKot?.createdAt ?? new Date().toISOString()),
            lines:
              Array.isArray(payload.lines) && payload.lines.length
                ? (payload.lines as KitchenTicket['lines'])
                : existingKot?.lines ?? [],
            branchId: opBranch(entity, payload) || existingKot?.branchId || getActiveBranchId(),
          }
          if (!kot.lines.length) {
            await mesaDb.kitchen.delete(`kot-${ticketId}`).catch(() => undefined)
            break
          }
          await mesaDb.kitchen.put(kot)
          ticketsTouched = true
          await ticketsRepo.put({
            ...current,
            lines: type === 'kot.send' ? current.lines.map((l) => ({ ...l, sent: true })) : current.lines,
            kitchenStatus: kot.status,
            kitchenPriority: kot.priority,
          })
          break
        }
        case 'catalog.upsert':
          await applyCatalog(String(payload.kind ?? ''), asRecord(payload.row))
          break
        case 'catalog.delete':
          dropPendingUpsertsFor(entityId, 'catalog.upsert')
          await applyCatalog(String(payload.kind ?? ''), { id: entityId }, true)
          break
        case 'giftCard.redeem': {
          const take = Number(payload.amount ?? 0)
          saveGiftCards(
            loadGiftCards().map((g) =>
              g.id === entityId ? { ...g, usedAmount: g.usedAmount + take } : g,
            ),
          )
          break
        }
        case 'foodVoucher.upsert': {
          const batch = payload.batch as FoodVoucherBatch | undefined
          if (batch && !isDemoFoodVoucher(batch.id)) {
            saveBatches(upsertById(loadBatches(), batch))
          }
          const codes = payload.codes as FoodVoucherCode[] | undefined
          if (Array.isArray(codes)) {
            let next = loadCodes()
            for (const code of codes) {
              if (!isDemoFoodVoucher(code.id)) next = upsertById(next, code)
            }
            saveCodes(next)
          }
          break
        }
        case 'foodVoucher.delete':
          saveBatches(loadBatches().filter((b) => b.id !== entityId))
          saveCodes(loadCodes().filter((c) => c.batchId !== entityId))
          break
        case 'foodVoucher.redeem':
          saveCodes(
            loadCodes().map((c) =>
              c.id === entityId ? { ...c, status: 'used', usedAt: new Date().toISOString() } : c,
            ),
          )
          break
        case 'vendor.upsert': {
          const raw = tenantGetItem('mesa-suppliers')
          const rows = raw ? (JSON.parse(raw) as { id: string }[]) : []
          tenantSetItem(
            'mesa-suppliers',
            JSON.stringify(upsertById(Array.isArray(rows) ? rows : [], payload as { id: string })),
          )
          break
        }
        case 'vendor.delete': {
          const raw = tenantGetItem('mesa-suppliers')
          const rows = raw ? (JSON.parse(raw) as { id: string }[]) : []
          tenantSetItem(
            'mesa-suppliers',
            JSON.stringify((Array.isArray(rows) ? rows : []).filter((s) => s.id !== entityId)),
          )
          break
        }
        case 'vendorLedger.upsert': {
          const raw = tenantGetItem('mesa-vendor-ledger')
          const rows = raw ? (JSON.parse(raw) as { id: string }[]) : []
          tenantSetItem(
            'mesa-vendor-ledger',
            JSON.stringify(upsertById(Array.isArray(rows) ? rows : [], payload as { id: string })),
          )
          break
        }
        case 'stock.adjust': {
          const existing = await mesaDb.stock.get(entityId)
          const statedOnHand =
            payload.onHand != null && Number.isFinite(Number(payload.onHand))
              ? Number(payload.onHand)
              : null
          const delta =
            payload.delta != null && Number.isFinite(Number(payload.delta))
              ? Number(payload.delta)
              : null
          let onHand = statedOnHand ?? existing?.onHand ?? 0
          if (statedOnHand == null && delta != null) {
            onHand = Math.max(0, Math.round(((existing?.onHand ?? 0) + delta) * 100) / 100)
          }
          const item = {
            id: entityId,
            name: String(payload.name ?? existing?.name ?? 'Item'),
            sku: String(payload.sku ?? existing?.sku ?? ''),
            category: String(payload.category ?? existing?.category ?? ''),
            unit: String(payload.unit ?? existing?.unit ?? 'pcs'),
            onHand,
            reorderAt: Number(payload.reorderAt ?? existing?.reorderAt ?? 0),
            cost: Number(payload.cost ?? existing?.cost ?? 0),
            vendorId:
              payload.vendorId != null
                ? String(payload.vendorId)
                : existing?.vendorId,
            vendor:
              payload.vendor != null
                ? String(payload.vendor)
                : existing?.vendor,
            ingredientId:
              payload.ingredientId != null
                ? String(payload.ingredientId)
                : existing?.ingredientId,
            locationBalances:
              payload.locationBalances && typeof payload.locationBalances === 'object'
                ? (payload.locationBalances as StockItem['locationBalances'])
                : existing?.locationBalances,
            branchId: opBranch(entity, payload) || getActiveBranchId(),
          } satisfies StockItem
          const migrated = migrateStockItem(item)
          await mesaDb.stock.put(migrated)
          const all = await mesaDb.stock.toArray()
          tenantSetItem('mesa-stock', JSON.stringify(all))
          break
        }
        case 'floor.upsert': {
          const br = opBranch(entity, payload) || getActiveBranchId()
          const table: Table = {
            id: entityId,
            label: String(payload.label ?? ''),
            seats: Number(payload.seats ?? 2),
            area: String(payload.area ?? 'Main Hall'),
            status: 'free',
          }
          await floorRepo.put({ ...table, branchId: br }, br)
          break
        }
        case 'day.close':
          if (isOtherBranch(entity, payload)) break
          saveDayClosed(String(payload.dayKey ?? todayKey()), opBranch(entity, payload) || getActiveBranchId())
          break
        case 'day.reopen':
          if (isOtherBranch(entity, payload)) break
          saveDayClosed(null, opBranch(entity, payload) || getActiveBranchId())
          break
        case 'shift.upsert': {
          if (isOtherBranch(entity, payload)) break
          const row: ShiftRecord = {
            id: entityId || String(payload.id ?? ''),
            branchId: opBranch(entity, payload) || getActiveBranchId(),
            userId: String(payload.userId ?? ''),
            userName: String(payload.userName ?? ''),
            openedAt: String(payload.openedAt ?? new Date().toISOString()),
            closedAt: payload.closedAt ? String(payload.closedAt) : undefined,
            floatAmount: Number(payload.floatAmount ?? 0),
            cashIn: Number(payload.cashIn ?? 0),
            countedCash: payload.countedCash != null ? Number(payload.countedCash) : undefined,
            variance: payload.variance != null ? Number(payload.variance) : undefined,
            open: payload.open !== false,
          }
          saveAllShifts(upsertById(loadAllShifts(), row))
          break
        }
        case 'receipt.upsert': {
          if (isOtherBranch(entity, payload)) break
          const receipt = fromApiReceipt({
            ...payload,
            id: entityId || payload.id,
            branchId: opBranch(entity, payload) || getActiveBranchId(),
          })
          saveAllReceipts(upsertById(loadAllReceipts(), receipt))
          break
        }
        case 'po.upsert': {
          if (isOtherBranch(entity, payload)) break
          const po = fromApiPO({
            ...payload,
            id: entityId || payload.id,
            branchId: opBranch(entity, payload) || getActiveBranchId(),
          })
          saveAllPOs(upsertById(loadAllPOs(), po))
          break
        }
        case 'stockTransfer.upsert': {
          if (isOtherBranch(entity, payload)) break
          const row = fromApiTransfer({
            ...payload,
            id: entityId || payload.id,
            branchId: opBranch(entity, payload) || getActiveBranchId(),
          })
          saveAllTransfers(upsertById(loadAllTransfers(), row))
          break
        }
        case 'ledger.upsert': {
          if (isOtherBranch(entity, payload)) break
          const entry = fromApiLedgerEntry({
            ...payload,
            id: entityId || payload.id,
            branchId: opBranch(entity, payload) || getActiveBranchId(),
          })
          saveLedger(upsertById(loadAllLedger(), entry))
          break
        }
        case 'audit.upsert': {
          if (isOtherBranch(entity, payload)) break
          const row = fromApiAudit({
            ...payload,
            id: entityId || payload.id,
            branchId: opBranch(entity, payload) || getActiveBranchId(),
          })
          saveAuditLog(upsertById(loadAllAudit(), row))
          break
        }
        case 'seq.upsert': {
          if (isOtherBranch(entity, payload)) break
          const row = fromApiSeq({
            ...payload,
            branchId: opBranch(entity, payload) || getActiveBranchId(),
          })
          if (row) applySeq(row)
          break
        }
        case 'company.upsert': {
          const row = {
            ...payload,
            id: entityId || payload.id,
          } as unknown as CompanyProfile
          if (!row.id || !row.companyName) break
          saveCompanyProfile(row)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(COMPANY_SESSION_EVENT))
          }
          break
        }
        case 'branch.upsert': {
          const row = {
            ...payload,
            id: entityId || payload.id,
          } as unknown as Branch
          if (!row.id) break
          saveBranches(upsertById(loadBranches(), { ...row, companyId: String(row.companyId ?? payload.companyId ?? '') }))
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(COMPANY_SESSION_EVENT))
          }
          break
        }
        case 'branch.delete': {
          const next = loadBranches().filter((b) => b.id !== entityId)
          if (next.length) {
            saveBranches(next)
            if (getActiveBranchId() === entityId) setActiveBranchId(next[0].id)
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event(COMPANY_SESSION_EVENT))
            }
          }
          break
        }
        case 'role.upsert': {
          const cid = activeCompanyId()
          const row = fromApiRole({ ...payload, id: entityId || payload.id })
          if (!row.id || !row.key) break
          // pending upsert into existing local list (do not pass [row] as full remote)
          saveManagedRoles(
            mergeRemoteRoles(loadManagedRoles(cid), [], [row], []),
            cid,
          )
          break
        }
        case 'role.delete': {
          const cid = activeCompanyId()
          saveManagedRoles(
            mergeRemoteRoles(loadManagedRoles(cid), [], [], [entityId]),
            cid,
          )
          break
        }
        case 'user.upsert': {
          const cid = String(payload.companyId ?? activeCompanyId())
          const existing = loadManagedUsers(cid)
          const prev = existing.find(
            (u) => u.id === entityId || u.username === String(payload.username ?? ''),
          )
          const row = fromApiUser(
            { ...payload, id: entityId || payload.id },
            cid,
            payload.pin ? String(payload.pin) : prev?.pin,
          )
          if (!row.id || !row.username) break
          saveManagedUsers(cid, mergeRemoteUsers(existing, [], [row]))
          break
        }
        default:
          break
      }
      applied += 1
    } catch {
      /* keep applying the rest */
    }
  }
  if (ticketsTouched) notifyTicketsSynced()
  return applied
}

export type BootstrapPayload = {
  cursor?: string
  masters?: { categories?: Record<string, unknown>[]; products?: Record<string, unknown>[] }
  tickets?: Record<string, unknown>[]
  customers?: CrmCustomer[]
  floorTables?: Record<string, unknown>[]
  stockItems?: StockItem[]
  dayClose?: { dayKey?: string; closedAt?: string } | null
  shifts?: Record<string, unknown>[]
  receipts?: Record<string, unknown>[]
  purchaseOrders?: Record<string, unknown>[]
  stockTransfers?: Record<string, unknown>[]
  ledger?: Record<string, unknown>[]
  audit?: Record<string, unknown>[]
  sequences?: Record<string, unknown>[]
  company?: Record<string, unknown> | null
  branches?: Record<string, unknown>[]
  roles?: Record<string, unknown>[]
  users?: Record<string, unknown>[]
}

function mapApiCategory(row: Record<string, unknown>): MenuCategory {
  const meta = asRecord(row.meta)
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    alias: String(row.alias ?? ''),
    sort: Number(row.sort ?? 0),
    active: row.active !== false,
    parentId: row.parentId ? String(row.parentId) : undefined,
    branchId: row.branchId ? String(row.branchId) : undefined,
    isBar: meta.isBar === true,
    buttonColor: meta.buttonColor ? String(meta.buttonColor) : undefined,
    buttonHeight: meta.buttonHeight != null ? Number(meta.buttonHeight) : undefined,
    buttonFontSize: meta.buttonFontSize != null ? Number(meta.buttonFontSize) : undefined,
    productButtonColor: meta.productButtonColor ? String(meta.productButtonColor) : undefined,
    productButtonHeight: meta.productButtonHeight != null ? Number(meta.productButtonHeight) : undefined,
    productButtonFontSize: meta.productButtonFontSize != null ? Number(meta.productButtonFontSize) : undefined,
    deptFontColor: meta.deptFontColor ? String(meta.deptFontColor) : undefined,
    productFontColor: meta.productFontColor ? String(meta.productFontColor) : undefined,
    imageDataUrl: meta.imageDataUrl ? String(meta.imageDataUrl) : undefined,
  }
}

function mapApiProduct(row: Record<string, unknown>): MasterDish {
  const meta = asRecord(row.meta)
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    alias: String(row.alias ?? ''),
    categoryId: String(row.categoryId ?? ''),
    category: String(row.category ?? ''),
    branchId: row.branchId ? String(row.branchId) : undefined,
    price: Number(row.price ?? 0),
    cost: Number(row.cost ?? 0),
    code: String(row.code ?? ''),
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
    taxIds: Array.isArray(meta.taxIds) ? meta.taxIds.map((x) => String(x)) : undefined,
    discountIds: Array.isArray(meta.discountIds)
      ? meta.discountIds.map((x) => String(x))
      : undefined,
    imageDataUrl: meta.imageDataUrl ? String(meta.imageDataUrl) : undefined,
  }
}

export async function applyBootstrap(data: BootstrapPayload) {
  if (data.company && data.company.id && data.company.companyName) {
    const remoteCompany = toCompanyProfile({
      id: String(data.company.id),
      companyName: String(data.company.companyName),
      aliasName: data.company.aliasName as string | null | undefined,
      taxId: data.company.taxId as string | null | undefined,
      enableTax: data.company.enableTax as boolean | undefined,
      zatcaEnabled: data.company.zatcaEnabled as boolean | undefined,
      currency: data.company.currency as string | undefined,
      hqPhone: data.company.hqPhone as string | null | undefined,
      logoDataUrl: data.company.logoDataUrl as string | null | undefined,
    })
    const remoteBranches = mapApiBranches(
      remoteCompany.id,
      Array.isArray(data.branches) ? (data.branches as Parameters<typeof mapApiBranches>[1]) : undefined,
    )
    hydrateCompanySession(remoteCompany, remoteBranches, companyOutboxOverlay())
  }
  if (data.roles?.length) {
    const cid = activeCompanyId()
    const overlay = accessOutboxOverlay()
    saveManagedRoles(
      mergeRemoteRoles(
        loadManagedRoles(cid),
        data.roles.map(fromApiRole),
        overlay.pendingRoles,
        overlay.pendingRoleDeletes,
      ),
      cid,
    )
  }
  if (data.users?.length) {
    const cid = activeCompanyId()
    const overlay = accessOutboxOverlay()
    const remote = data.users.map((row) => fromApiUser(row, cid))
    saveManagedUsers(cid, mergeRemoteUsers(loadManagedUsers(cid), remote, overlay.pendingUsers))
  }
  if (data.masters?.categories?.length) {
    await mastersRepo.replaceCategories(data.masters.categories.map(mapApiCategory))
  }
  if (data.masters?.products?.length) {
    await mastersRepo.replaceDishes(data.masters.products.map(mapApiProduct), getActiveBranchId())
  }
  if (data.customers?.length) {
    const cid = String(data.customers[0]?.companyId ?? 'co-mesa')
    await customersRepo.saveAll(cid, data.customers, getActiveBranchId())
  }
  if (data.tickets?.length) {
    const mapped = data.tickets.map(ticketFromServer).filter(Boolean) as OpenTicket[]
    await ticketsRepo.saveAll(mapped)
    const branchId = getActiveBranchId()
    const kots = mapped.map(kitchenFromTicket).filter(Boolean) as KitchenTicket[]
    const existing = await mesaDb.kitchen.toArray()
    const keep = new Set(kots.map((k) => k.id))
    const drop = existing
      .filter((k) => (!k.branchId || k.branchId === branchId) && !keep.has(k.id))
      .map((k) => k.id)
    if (drop.length) await mesaDb.kitchen.bulkDelete(drop)
    if (kots.length) await mesaDb.kitchen.bulkPut(kots)
  } else if (data.tickets) {
    // Empty open list from server — clear branch KOTs
    const branchId = getActiveBranchId()
    const existing = await mesaDb.kitchen.toArray()
    const drop = existing.filter((k) => !k.branchId || k.branchId === branchId).map((k) => k.id)
    if (drop.length) await mesaDb.kitchen.bulkDelete(drop)
  }
  if (data.floorTables?.length) {
    const branchId = getActiveBranchId()
    await floorRepo.replace(
      data.floorTables.map((row) => ({
        id: String(row.id),
        label: String(row.label ?? ''),
        seats: Number(row.seats ?? 2),
        area: String(row.area ?? 'Main Hall'),
        status: 'free' as const,
        branchId: String(row.branchId ?? branchId),
      })),
      branchId,
    )
  }
  if (data.stockItems?.length) {
    const branchId = getActiveBranchId()
    const incoming = data.stockItems.map((s) => migrateStockItem({ ...s, branchId: s.branchId ?? branchId }))
    const others = (await mesaDb.stock.toArray()).filter((s) => s.branchId && s.branchId !== branchId)
    await mesaDb.stock.clear()
    await mesaDb.stock.bulkPut([...others, ...incoming])
    tenantSetItem('mesa-stock', JSON.stringify(incoming))
  }
  if (data.dayClose?.dayKey) {
    saveDayClosed(data.dayClose.dayKey, getActiveBranchId())
  }
  if (data.shifts?.length) {
    const branchId = getActiveBranchId()
    const pending = loadOutbox()
      .filter((o) => o.type === 'shift.upsert' && (o.status === 'pending' || o.status === 'syncing'))
      .map((o) => o.payload as ShiftRecord)
    saveAllShifts(mergeRemoteShifts(loadAllShifts(), data.shifts.map(fromApiShift), branchId, pending))
  }
  if (data.receipts?.length) {
    const branchId = getActiveBranchId()
    const pending = loadOutbox()
      .filter((o) => o.type === 'receipt.upsert' && (o.status === 'pending' || o.status === 'syncing'))
      .map((o) => o.payload as StockReceipt)
    saveAllReceipts(
      mergeRemoteReceipts(loadAllReceipts(), data.receipts.map(fromApiReceipt), branchId, pending),
    )
  }
  if (data.purchaseOrders?.length) {
    const branchId = getActiveBranchId()
    const pending = loadOutbox()
      .filter((o) => o.type === 'po.upsert' && (o.status === 'pending' || o.status === 'syncing'))
      .map((o) => o.payload as PurchaseOrder)
    saveAllPOs(mergeRemotePOs(loadAllPOs(), data.purchaseOrders.map(fromApiPO), branchId, pending))
  }
  if (data.stockTransfers?.length) {
    const branchId = getActiveBranchId()
    const pending = loadOutbox()
      .filter((o) => o.type === 'stockTransfer.upsert' && (o.status === 'pending' || o.status === 'syncing'))
      .map((o) => o.payload as StockTransfer)
    saveAllTransfers(
      mergeRemoteTransfers(loadAllTransfers(), data.stockTransfers.map(fromApiTransfer), branchId, pending),
    )
  }
  if (data.ledger?.length) {
    const branchId = getActiveBranchId()
    const pending = loadOutbox()
      .filter((o) => o.type === 'ledger.upsert' && (o.status === 'pending' || o.status === 'syncing'))
      .map((o) => o.payload as LedgerEntry)
    saveLedger(mergeRemoteLedger(loadAllLedger(), data.ledger.map(fromApiLedgerEntry), branchId, pending))
  }
  if (Array.isArray(data.audit)) {
    const branchId = getActiveBranchId()
    const pending = loadOutbox()
      .filter((o) => o.type === 'audit.upsert' && (o.status === 'pending' || o.status === 'syncing'))
      .map((o) => o.payload as AuditEntry)
    const merged = mergeRemoteAudit(loadAllAudit(), data.audit.map(fromApiAudit), branchId, pending)
    saveAuditLog(merged)
    const remoteIds = new Set(data.audit.map((r) => String(r.id)))
    const pendingIds = new Set(pending.map((p) => p.id).filter(Boolean))
    for (const row of merged) {
      if (row.branchId && row.branchId !== branchId) continue
      if (!row.id || remoteIds.has(row.id) || pendingIds.has(row.id)) continue
      enqueueOutbox('audit.upsert', row.id, { ...row, branchId }, getDeviceId(), branchId)
    }
  }
  hydrateSequences(data.sequences, getActiveBranchId())
}
