import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { InjectPrisma, PrismaService } from '../../prisma.service'
import { assertBranchInCompany, companyIdForBranch } from '../auth/tenant'
import { notifyTicketChanged } from '../sync/bus'

function asLines(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

@Injectable()
export class OrdersService {
  constructor(@InjectPrisma() private readonly prisma: PrismaService) {}

  listOpen(companyId: string, branchId?: string) {
    return this.prisma.ticket.findMany({
      where: {
        companyId,
        status: { notIn: ['settled', 'cancelled'] },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async upsert(
    ticket: { id: string; status?: string; branchId?: string } & Record<string, unknown>,
    companyId: string,
  ) {
    const branchId = String(ticket.branchId ?? '')
    if (!branchId) throw new Error('branchId required for ticket')
    await assertBranchInCompany(this.prisma, branchId, companyId)

    const incomingTs = Number(ticket.updatedAt ?? 0)
    const existing = await this.prisma.ticket.findUnique({ where: { id: ticket.id } })
    const existingPayload = (existing?.payload as Record<string, unknown> | null) ?? {}
    const existingTs = Number(existingPayload.updatedAt ?? 0)
    const newer = incomingTs >= existingTs
    const incomingLines = asLines(ticket.lines)
    const replaceLines = ticket.replaceLines === true || ticket.reseated === true || newer
    const lines = replaceLines && newer ? incomingLines : asLines(existingPayload.lines)
    const base = newer ? { ...existingPayload, ...ticket } : { ...ticket, ...existingPayload }
    const payload = {
      ...base,
      id: ticket.id,
      branchId,
      lines,
      updatedAt: Math.max(incomingTs, existingTs) || Date.now(),
    } as Prisma.InputJsonValue
    const type = String((base.type as string | undefined) ?? ticket.type ?? 'takeaway')
    const customer = String((base.customer as string | undefined) ?? ticket.customer ?? 'Guest')
    const phone = (base.phone ?? ticket.phone) ? String(base.phone ?? ticket.phone) : null
    const status = String(ticket.status ?? base.status ?? 'open')

    const saved = await this.prisma.ticket.upsert({
      where: { id: ticket.id },
      create: {
        id: ticket.id,
        companyId,
        branchId,
        type,
        customer,
        phone,
        status,
        payload,
      },
      update: {
        companyId,
        branchId,
        type,
        customer,
        phone,
        status,
        payload,
      },
    })
    notifyTicketChanged(ticket.id)
    return saved
  }

  /**
   * KSA aggregator / channel ingest (HungerStation, Jahez, Keeta, …).
   * Real platform webhooks map into this shape; POS also uses it to simulate import.
   */
  async ingestDelivery(
    companyId: string,
    body: {
      branchId?: string
      channel?: string
      externalOrderId?: string
      customer?: string
      phone?: string
      address?: string
      deliveryFee?: number
      lines?: Array<{ name?: string; qty?: number; price?: number; itemId?: string }>
    },
  ) {
    const branchId = String(body.branchId ?? '')
    if (!branchId) throw new Error('branchId required')
    await assertBranchInCompany(this.prisma, branchId, companyId)

    const channel = String(body.channel ?? 'HungerStation').trim() || 'HungerStation'
    const externalOrderId = String(body.externalOrderId ?? `SIM-${Date.now()}`).trim()
    const id = `dl-ext-${channel.replace(/\s+/g, '').toLowerCase()}-${externalOrderId}`

    const existing = await this.prisma.ticket.findFirst({ where: { id, companyId } })
    if (existing && existing.status !== 'cancelled') {
      return existing
    }

    const lines = (body.lines ?? []).map((l, i) => ({
      id: `ext-${i}-${Date.now()}`,
      itemId: String(l.itemId ?? `ext-item-${i}`),
      name: String(l.name ?? 'Item'),
      qty: Math.max(1, Number(l.qty ?? 1)),
      price: Math.max(0, Number(l.price ?? 0)),
      sent: false,
    }))
    const amount = lines.reduce((s, l) => s + l.qty * l.price, 0) + Number(body.deliveryFee ?? 0)
    const openedAt = new Date().toLocaleTimeString('en-SA', {
      hour: '2-digit',
      minute: '2-digit',
    })
    const payload = {
      id,
      type: 'delivery',
      customer: String(body.customer ?? 'Online guest'),
      phone: body.phone ? String(body.phone) : undefined,
      address: body.address ? String(body.address) : 'Address from app',
      deliveryFee: Number(body.deliveryFee ?? 0),
      deliveryStatus: 'new',
      channel,
      externalOrderId,
      openedAt,
      lines,
      amount,
      branchId,
      channelAcceptStatus: 'pending',
      updatedAt: Date.now(),
      replaceLines: true,
    }

    return this.upsert(
      {
        ...payload,
        status: 'open',
        branchId,
      },
      companyId,
    )
  }

  async settle(id: string, companyId: string, meta?: unknown) {
    const existing = await this.prisma.ticket.findFirst({
      where: { id, companyId },
    })
    const payload = {
      ...((existing?.payload as object) ?? {}),
      meta,
      checkStatus: 'settled',
    } as Prisma.InputJsonValue

    if (!existing) throw new Error('Ticket not found in this company')

    const saved = await this.prisma.ticket.update({
      where: { id },
      data: {
        status: 'settled',
        payload,
      },
    })
    notifyTicketChanged(id)
    return saved
  }

  async mergePayload(
    id: string,
    companyId: string,
    patch: Record<string, unknown>,
  ) {
    const existing = await this.prisma.ticket.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error('Ticket not found in this company')
    const current = (existing.payload as Record<string, unknown>) ?? {}
    const payload = { ...current, ...patch } as Prisma.InputJsonValue
    const saved = await this.prisma.ticket.update({
      where: { id },
      data: { payload },
    })
    notifyTicketChanged(id)
    return saved
  }

  async upsertLine(
    id: string,
    companyId: string,
    line: Record<string, unknown>,
  ) {
    const existing = await this.prisma.ticket.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error('Ticket not found in this company')
    const current = (existing.payload as Record<string, unknown>) ?? {}
    const lines = Array.isArray(current.lines) ? [...(current.lines as Record<string, unknown>[])] : []
    const lineId = String(line.id ?? '')
    const idx = lines.findIndex((l) => String(l.id) === lineId)
    if (idx >= 0) lines[idx] = { ...lines[idx], ...line }
    else lines.push(line)
    const amount = lines.reduce(
      (sum, l) => sum + Number(l.qty ?? 0) * Number(l.price ?? 0),
      0,
    )
    const payload = { ...current, lines, amount, updatedAt: Date.now() } as Prisma.InputJsonValue
    const saved = await this.prisma.ticket.update({
      where: { id },
      data: { payload },
    })
    notifyTicketChanged(id)
    return saved
  }

  async voidLine(id: string, companyId: string, lineId: string) {
    const existing = await this.prisma.ticket.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error('Ticket not found in this company')
    const current = (existing.payload as Record<string, unknown>) ?? {}
    const lines = Array.isArray(current.lines)
      ? (current.lines as Record<string, unknown>[]).filter((l) => String(l.id) !== lineId)
      : []
    const amount = lines.reduce(
      (sum, l) => sum + Number(l.qty ?? 0) * Number(l.price ?? 0),
      0,
    )
    const payload = { ...current, lines, amount, updatedAt: Date.now() } as Prisma.InputJsonValue
    const saved = await this.prisma.ticket.update({
      where: { id },
      data: { payload },
    })
    notifyTicketChanged(id)
    return saved
  }

  latestDayClose(companyId: string, branchId?: string) {
    return this.prisma.dayClose.findFirst({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { closedAt: 'desc' },
    })
  }

  async closeDay(companyId: string, branchId: string, dayKey: string, countedCash: number, staff?: string) {
    await assertBranchInCompany(this.prisma, branchId, companyId)
    return this.prisma.dayClose.upsert({
      where: { branchId_dayKey: { branchId, dayKey } },
      create: { companyId, branchId, dayKey, countedCash, staff },
      update: { countedCash, staff, closedAt: new Date() },
    })
  }

  listShifts(companyId: string, branchId?: string) {
    return this.prisma.shift.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { openedAt: 'desc' },
      take: 200,
    })
  }

  async upsertShift(row: Record<string, unknown>, companyId: string) {
    const id = String(row.id ?? '')
    if (!id) throw new Error('shift id required')
    const branchId = String(row.branchId ?? '')
    if (!branchId) throw new Error('branchId required for shift')
    await assertBranchInCompany(this.prisma, branchId, companyId)

    const open = row.open !== false
    const openedAt = new Date(String(row.openedAt ?? Date.now()))
    const closedAt = row.closedAt ? new Date(String(row.closedAt)) : open ? null : new Date()
    const floatAmount = Number(row.floatAmount ?? 0)
    const cashIn = Number(row.cashIn ?? 0)
    const countedCash = row.countedCash != null ? Number(row.countedCash) : null
    const variance = row.variance != null ? Number(row.variance) : null
    const userId = String(row.userId ?? '')
    const userName = String(row.userName ?? '')

    if (open) {
      await this.prisma.shift.updateMany({
        where: { companyId, branchId, open: true, NOT: { id } },
        data: { open: false, closedAt: new Date() },
      })
    }

    return this.prisma.shift.upsert({
      where: { id },
      create: {
        id,
        companyId,
        branchId,
        userId,
        userName,
        openedAt,
        closedAt,
        floatAmount,
        cashIn,
        countedCash,
        variance,
        open,
      },
      update: {
        companyId,
        branchId,
        userId,
        userName,
        openedAt,
        closedAt,
        floatAmount,
        cashIn,
        countedCash,
        variance,
        open,
      },
    })
  }

  listLedger(companyId: string, branchId?: string) {
    return this.prisma.salesLedger.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { at: 'desc' },
      take: 2000,
    })
  }

  listAudit(companyId: string, branchId?: string) {
    return this.prisma.auditLog.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { at: 'desc' },
      take: 2000,
    })
  }

  async upsertAudit(row: Record<string, unknown>, companyId: string) {
    const id = String(row.id ?? '')
    if (!id) throw new Error('audit id required')
    const branchId = String(row.branchId ?? '')
    if (!branchId) throw new Error('branchId required for audit')
    await assertBranchInCompany(this.prisma, branchId, companyId)

    const data = {
      companyId,
      branchId,
      action: String(row.action ?? ''),
      staff: row.staff ? String(row.staff) : null,
      entityId: row.entityId ? String(row.entityId) : null,
      detail: row.detail ? String(row.detail) : null,
      amount: row.amount != null ? Number(row.amount) : null,
      at: new Date(String(row.at ?? Date.now())),
    }

    return this.prisma.auditLog.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  async upsertLedger(row: Record<string, unknown>, companyId: string) {
    const id = String(row.id ?? '')
    if (!id) throw new Error('ledger id required')
    const branchId = String(row.branchId ?? '')
    if (!branchId) throw new Error('branchId required for ledger')
    await assertBranchInCompany(this.prisma, branchId, companyId)

    const json = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
      value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue)

    const data = {
      companyId,
      branchId,
      at: new Date(String(row.at ?? Date.now())),
      day: String(row.day ?? ''),
      type: String(row.type ?? 'sale'),
      source: String(row.source ?? ''),
      method: String(row.method ?? ''),
      subtotal: Number(row.subtotal ?? 0),
      tax: Number(row.tax ?? 0),
      total: Number(row.total ?? 0),
      discountAmt: row.discountAmt != null ? Number(row.discountAmt) : null,
      staff: row.staff ? String(row.staff) : null,
      lines: json(row.lines),
      splitPayments: json(row.splitPayments),
      charges: json(row.charges),
      customerId: row.customerId ? String(row.customerId) : null,
      loyaltyRedeem: row.loyaltyRedeem != null ? Number(row.loyaltyRedeem) : null,
      voidReason: row.voidReason ? String(row.voidReason) : null,
      voidLineName: row.voidLineName ? String(row.voidLineName) : null,
    }

    return this.prisma.salesLedger.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  listSequences(companyId: string, branchId?: string) {
    return this.prisma.branchSequence.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
    })
  }

  async upsertSequence(row: Record<string, unknown>, companyId: string) {
    const kind = String(row.kind ?? '')
    if (kind !== 'delivery' && kind !== 'driveThru' && kind !== 'takeaway' && kind !== 'quickServe') {
      throw new Error('invalid sequence kind')
    }
    const branchId = String(row.branchId ?? '')
    if (!branchId) throw new Error('branchId required for sequence')
    await assertBranchInCompany(this.prisma, branchId, companyId)

    const incoming = Math.max(0, Number(row.value ?? 0))
    const existing = await this.prisma.branchSequence.findUnique({
      where: { branchId_kind: { branchId, kind } },
    })
    const value = Math.max(existing?.value ?? 0, incoming)

    return this.prisma.branchSequence.upsert({
      where: { branchId_kind: { branchId, kind } },
      create: { companyId, branchId, kind, value },
      update: { companyId, value },
    })
  }
}

export { companyIdForBranch }
