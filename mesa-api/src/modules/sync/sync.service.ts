import { Inject, Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { InjectPrisma, PrismaService } from '../../prisma.service'
import { MastersService } from '../masters/masters.service'
import { OrdersService } from '../orders/orders.service'
import { AccessService } from '../access/access.service'
import { ZatcaService } from '../zatca/zatca.service'
import { assertBranchInCompany } from '../auth/tenant'

type PushOp = {
  id: string
  type: string
  entityId: string
  payload: unknown
  createdAt: string
  branchId?: string
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name)

  constructor(
    @InjectPrisma() private readonly prisma: PrismaService,
    @Inject(MastersService) private readonly masters: MastersService,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(ZatcaService) private readonly zatca: ZatcaService,
  ) {}

  async bootstrap(companyId: string, branchId?: string) {
    if (branchId) await assertBranchInCompany(this.prisma, branchId, companyId)

    const [company, branches] = await Promise.all([
      this.masters.getCompany(companyId),
      this.masters.listBranches(companyId),
    ])
    const branch =
      branches.find((b) => b.id === branchId) ?? branches.find((b) => b.active) ?? branches[0]

    const [categories, products, tickets, customers, cursor, floorTables, stockItems, dayClose, shifts, receipts, purchaseOrders, ledger, roles, users, stockTransfers, audit, sequences] =
      await Promise.all([
      this.masters.listCategories(companyId, branch?.id),
      this.masters.listProducts(companyId, branch?.id),
      this.orders.listOpen(companyId, branch?.id),
      this.masters.listCustomers(companyId, branch?.id),
      this.prisma.syncOp.count({ where: { companyId } }),
      this.masters.listFloorTables(companyId, branch?.id),
      this.masters.listStockItems(companyId, branch?.id),
      this.orders.latestDayClose(companyId, branch?.id),
      this.orders.listShifts(companyId, branch?.id),
      this.masters.listStockReceipts(companyId, branch?.id),
      this.masters.listPurchaseOrders(companyId, branch?.id),
      this.orders.listLedger(companyId, branch?.id),
      this.access.listRoles(companyId),
      this.access.listUsers(companyId),
      this.masters.listStockTransfers(companyId, branch?.id),
      this.orders.listAudit(companyId, branch?.id),
      this.orders.listSequences(companyId, branch?.id),
    ])

    return {
      serverTime: new Date().toISOString(),
      cursor: String(cursor),
      company,
      branches,
      activeBranch: branch,
      masters: { categories, products },
      tickets,
      customers,
      floorTables,
      stockItems,
      dayClose,
      shifts,
      receipts,
      purchaseOrders,
      ledger,
      roles,
      users,
      stockTransfers,
      audit,
      sequences,
    }
  }

  /** Full company snapshot from Postgres (no PIN/password secrets). */
  async exportBackup(companyId: string) {
    const [company, branches, catalog, vendors, foodVouchers, roles, users, syncOpCount] =
      await Promise.all([
        this.masters.getCompany(companyId),
        this.masters.listBranches(companyId),
        this.masters.listCatalog(companyId),
        this.masters.listVendors(companyId),
        this.masters.listFoodVouchers(companyId),
        this.access.listRoles(companyId),
        this.access.listUsers(companyId),
        this.prisma.syncOp.count({ where: { companyId } }),
      ])

    const branchPayloads = []
    for (const branch of branches) {
      const branchId = branch.id
      const [
        categories,
        products,
        tickets,
        customers,
        floorTables,
        stockItems,
        dayClose,
        shifts,
        receipts,
        purchaseOrders,
        ledger,
        stockTransfers,
        audit,
        sequences,
      ] = await Promise.all([
        this.masters.listCategories(companyId, branchId),
        this.masters.listProducts(companyId, branchId),
        this.orders.listOpen(companyId, branchId),
        this.masters.listCustomers(companyId, branchId),
        this.masters.listFloorTables(companyId, branchId),
        this.masters.listStockItems(companyId, branchId),
        this.orders.latestDayClose(companyId, branchId),
        this.orders.listShifts(companyId, branchId),
        this.masters.listStockReceipts(companyId, branchId),
        this.masters.listPurchaseOrders(companyId, branchId),
        this.orders.listLedger(companyId, branchId),
        this.masters.listStockTransfers(companyId, branchId),
        this.orders.listAudit(companyId, branchId),
        this.orders.listSequences(companyId, branchId),
      ])
      branchPayloads.push({
        branchId,
        masters: { categories, products },
        tickets,
        customers,
        floorTables,
        stockItems,
        dayClose,
        shifts,
        receipts,
        purchaseOrders,
        ledger,
        stockTransfers,
        audit,
        sequences,
      })
    }

    return {
      exportedAt: new Date().toISOString(),
      source: 'mesa-api',
      app: 'mesa-pos',
      companyId,
      syncOpCount,
      company,
      branches,
      catalog,
      vendors,
      foodVouchers,
      roles,
      users,
      branchData: branchPayloads,
    }
  }

  async push(companyId: string, deviceId: string, ops: PushOp[]) {
    const accepted: string[] = []
    const rejected: { id: string; reason: string }[] = []

    for (const op of ops) {
      try {
        await this.applyOp(companyId, op)
        await this.prisma.syncOp.upsert({
          where: { id: op.id },
          create: {
            id: op.id,
            deviceId,
            companyId,
            branchId: op.branchId,
            type: op.type,
            entityId: op.entityId,
            payload: (op.payload ?? {}) as Prisma.InputJsonValue,
            createdAt: new Date(op.createdAt || Date.now()),
          },
          update: {},
        })
        accepted.push(op.id)
      } catch (err) {
        const nest =
          err && typeof err === 'object' && 'getResponse' in err
            ? (err as { getResponse: () => unknown }).getResponse()
            : null
        const nestMsg =
          nest && typeof nest === 'object' && nest !== null && 'message' in nest
            ? (nest as { message: string | string[] }).message
            : null
        const reason = Array.isArray(nestMsg)
          ? nestMsg.join(', ')
          : typeof nestMsg === 'string'
            ? nestMsg
            : err instanceof Error
              ? err.message
              : 'apply failed'
        this.logger.warn(`sync reject ${op.type} ${op.id}: ${reason}`)
        rejected.push({
          id: op.id,
          reason,
        })
      }
    }

    const cursor = await this.prisma.syncOp.count({ where: { companyId } })
    this.logger.log(
      `sync push device=${deviceId} accepted=${accepted.length} rejected=${rejected.length}`,
    )
    return { accepted, rejected, idMap: {}, cursor: String(cursor) }
  }

  async pull(companyId: string, since: string, branchId?: string) {
    if (branchId) await assertBranchInCompany(this.prisma, branchId, companyId)
    const iso = since && !/^\d+$/.test(since) ? new Date(since) : null
    const numeric = /^\d+$/.test(since) ? Number(since) : 0
    const entities = await this.prisma.syncOp.findMany({
      where: {
        companyId,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
        ...(iso && !Number.isNaN(iso.getTime()) ? { appliedAt: { gt: iso } } : {}),
      },
      orderBy: { appliedAt: 'asc' },
      ...(iso && !Number.isNaN(iso.getTime()) ? {} : { skip: numeric, take: 500 }),
      take: 500,
    })
    const last = entities[entities.length - 1]
    const cursor = last?.appliedAt?.toISOString?.() ?? since ?? '0'
    return { cursor, entities }
  }

  private async applyOp(companyId: string, op: PushOp) {
    const payload = (op.payload ?? {}) as Record<string, unknown>
    switch (op.type) {
      case 'masters.upsert':
        if (payload.kind === 'category' && payload.cat) {
          const cat = payload.cat as Record<string, unknown>
          await this.masters.upsertCategory(
            { ...cat, branchId: cat.branchId ?? op.branchId },
            companyId,
          )
        } else if (payload.kind === 'dish' && payload.dish) {
          const dish = payload.dish as Record<string, unknown>
          await this.masters.upsertProduct(
            { ...dish, branchId: dish.branchId ?? op.branchId },
            companyId,
          )
        }
        break
      case 'masters.delete':
        if (payload.kind === 'category') await this.masters.deleteCategory(op.entityId, companyId)
        else if (payload.kind === 'dish') await this.masters.deleteProduct(op.entityId, companyId)
        break
      case 'ticket.create':
      case 'ticket.update':
        await this.orders.upsert(
          {
            ...(payload as object),
            id: op.entityId,
            branchId: op.branchId ?? (payload.branchId as string | undefined),
          } as { id: string; branchId?: string } & Record<string, unknown>,
          companyId,
        )
        break
      case 'ticket.settle':
        await this.orders.settle(op.entityId, companyId, payload.meta)
        break
      case 'customer.upsert':
        await this.masters.upsertCustomer(
          {
            ...(payload as object),
            id: op.entityId || (payload.id as string),
            branchId: op.branchId ?? (payload.branchId as string | undefined),
          },
          companyId,
        )
        break
      case 'foodVoucher.upsert':
        await this.masters.upsertFoodVoucherBatch(payload, companyId)
        break
      case 'foodVoucher.delete':
        await this.masters.deleteFoodVoucherBatch(op.entityId, companyId)
        break
      case 'foodVoucher.redeem':
        await this.masters.redeemFoodVoucherCode(
          String(op.entityId || payload.id || ''),
          companyId,
        )
        break
      case 'vendor.upsert':
        await this.masters.upsertVendor(
          { ...(payload as object), id: op.entityId || (payload.id as string) },
          companyId,
        )
        break
      case 'vendor.delete':
        await this.masters.deleteVendor(op.entityId, companyId)
        break
      case 'vendorLedger.upsert':
        await this.masters.upsertVendorLedger(
          { ...(payload as object), id: op.entityId || (payload.id as string) },
          companyId,
        )
        break
      case 'catalog.upsert':
        await this.masters.upsertCatalogRow(
          String(payload.kind ?? ''),
          (payload.row as Record<string, unknown>) ?? payload,
          companyId,
        )
        break
      case 'catalog.delete':
        await this.masters.deleteCatalogRow(String(payload.kind ?? ''), op.entityId, companyId)
        break
      case 'giftCard.redeem':
        await this.masters.redeemGiftCard(
          op.entityId,
          companyId,
          Number(payload.amount ?? 0),
        )
        break
      case 'kot.send': {
        const ticketId = String(payload.ticketId ?? op.entityId)
        const existing = await this.prisma.ticket.findFirst({ where: { id: ticketId, companyId } })
        const current = (existing?.payload as Record<string, unknown>) ?? {}
        const lines = Array.isArray(current.lines)
          ? (current.lines as Record<string, unknown>[]).map((l) => ({ ...l, sent: true }))
          : []
        await this.orders.mergePayload(ticketId, companyId, {
          lines,
          kitchen: {
            status: String(payload.status ?? 'queued'),
            priority: payload.priority ?? 'normal',
            source: payload.source,
            lines: payload.lines ?? lines,
            sentAt: op.createdAt,
          },
        })
        break
      }
      case 'kot.status': {
        const ticketId = String(payload.ticketId ?? op.entityId)
        const existing = await this.prisma.ticket.findFirst({ where: { id: ticketId, companyId } })
        const current = (existing?.payload as Record<string, unknown>) ?? {}
        const kitchen = {
          ...((current.kitchen as object) ?? {}),
          status: String(payload.status ?? 'queued'),
        }
        await this.orders.mergePayload(ticketId, companyId, { kitchen })
        break
      }
      case 'stock.adjust':
        await this.masters.upsertStockItem(
          { ...(payload as object), id: op.entityId || (payload.id as string) },
          companyId,
        )
        break
      case 'ticket.line.upsert':
        await this.orders.upsertLine(
          String(payload.ticketId ?? op.entityId),
          companyId,
          (payload.line as Record<string, unknown>) ?? payload,
        )
        break
      case 'ticket.line.void':
        await this.orders.voidLine(
          String(payload.ticketId ?? op.entityId),
          companyId,
          String(payload.lineId ?? payload.id ?? ''),
        )
        break
      case 'day.close':
        await this.orders.closeDay(
          companyId,
          String(op.branchId ?? payload.branchId ?? ''),
          String(payload.dayKey ?? ''),
          Number(payload.countedCash ?? 0),
          payload.staff ? String(payload.staff) : undefined,
        )
        break
      case 'day.reopen':
        await this.prisma.dayClose.deleteMany({
          where: {
            companyId,
            branchId: String(op.branchId ?? payload.branchId ?? ''),
            dayKey: String(payload.dayKey ?? ''),
          },
        })
        break
      case 'shift.upsert':
        await this.orders.upsertShift(
          {
            ...payload,
            id: op.entityId || payload.id,
            branchId: op.branchId ?? payload.branchId,
          },
          companyId,
        )
        break
      case 'receipt.upsert':
        await this.masters.upsertStockReceipt(
          {
            ...payload,
            id: op.entityId || payload.id,
            branchId: op.branchId ?? payload.branchId,
          },
          companyId,
        )
        break
      case 'po.upsert':
        await this.masters.upsertPurchaseOrder(
          {
            ...payload,
            id: op.entityId || payload.id,
            branchId: op.branchId ?? payload.branchId,
          },
          companyId,
        )
        break
      case 'stockTransfer.upsert':
        await this.masters.upsertStockTransfer(
          {
            ...payload,
            id: op.entityId || payload.id,
            branchId: op.branchId ?? payload.branchId,
          },
          companyId,
        )
        break
      case 'ledger.upsert':
        await this.orders.upsertLedger(
          {
            ...payload,
            id: op.entityId || payload.id,
            branchId: op.branchId ?? payload.branchId,
          },
          companyId,
        )
        break
      case 'audit.upsert':
        await this.orders.upsertAudit(
          {
            ...payload,
            id: op.entityId || payload.id,
            branchId: op.branchId ?? payload.branchId,
          },
          companyId,
        )
        break
      case 'seq.upsert':
        await this.orders.upsertSequence(
          {
            ...payload,
            kind: payload.kind,
            value: payload.value,
            branchId: op.branchId ?? payload.branchId,
          },
          companyId,
        )
        break
      case 'company.upsert':
        await this.masters.upsertCompany(payload, companyId)
        break
      case 'branch.upsert':
        await this.masters.upsertBranch(
          {
            ...payload,
            id: op.entityId || payload.id,
          },
          companyId,
        )
        break
      case 'branch.delete':
        await this.masters.deleteBranch(op.entityId, companyId)
        break
      case 'role.upsert':
        await this.access.upsertRole(companyId, {
          id: String(op.entityId || payload.id || ''),
          name: String(payload.name ?? ''),
          nameAr: payload.nameAr ? String(payload.nameAr) : undefined,
          key: payload.key ? String(payload.key) : undefined,
          privileges: (payload.privileges ?? payload) as never,
        })
        break
      case 'role.delete':
        await this.access.deleteRole(companyId, op.entityId)
        break
      case 'user.upsert':
        await this.access.saveUser(companyId, {
          id: String(op.entityId || payload.id || ''),
          name: String(payload.name ?? ''),
          nameAr: payload.nameAr ? String(payload.nameAr) : undefined,
          username: String(payload.username ?? ''),
          pin: payload.pin ? String(payload.pin) : undefined,
          role: String(payload.role ?? ''),
          branchId:
            payload.branchId == null || payload.branchId === ''
              ? null
              : String(payload.branchId),
          active: payload.active !== false,
        })
        break
      case 'floor.upsert':
        await this.masters.upsertFloorTable(
          { ...(payload as object), id: op.entityId || (payload.id as string), branchId: op.branchId ?? payload.branchId },
          companyId,
        )
        break
      case 'zatca.submit':
        await this.zatca.submitInvoice(companyId, {
          ...payload,
          invoiceUuid: op.entityId || payload.invoiceUuid || payload.id,
        })
        break
      default:
        throw new Error(`Unknown op ${op.type}`)
    }
  }
}
