import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { InjectPrisma, PrismaService } from '../../prisma.service'
import { assertBranchInCompany } from '../auth/tenant'
import { notifyTicketChanged } from '../sync/bus'
import { adapterForChannel, supportedChannelIds } from './adapters/registry'
import type {
  ChannelIntegrationRow,
  ChannelMenuItem,
  ChannelOrderStatus,
} from './adapters/channel-adapter'

function adapterFor(channelId: string) {
  return adapterForChannel(channelId)
}

function configId(branchId: string, channelId: string) {
  return `${branchId}__${channelId}`
}

function rowToConfig(row: {
  channelId: string
  enabled: boolean
  storeId: string | null
  apiKey: string | null
  apiBaseUrl: string | null
  webhookSecret: string | null
}): ChannelIntegrationRow {
  return {
    channelId: row.channelId,
    enabled: row.enabled,
    storeId: row.storeId ?? undefined,
    apiKey: row.apiKey ?? undefined,
    apiBaseUrl: row.apiBaseUrl ?? undefined,
    webhookSecret: row.webhookSecret ?? undefined,
  }
}

@Injectable()
export class DeliveryChannelsService {
  constructor(@InjectPrisma() private readonly prisma: PrismaService) {}

  async listConfigs(companyId: string, branchId: string) {
    try {
      return await this.prisma.deliveryChannelIntegration.findMany({
        where: { companyId, branchId },
        orderBy: { channelId: 'asc' },
      })
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'P2021') return []
      throw err
    }
  }

  listSupportedChannels() {
    return supportedChannelIds()
  }

  async upsertConfig(
    companyId: string,
    body: {
      branchId: string
      channelId: string
      enabled?: boolean
      storeId?: string
      apiKey?: string
      apiBaseUrl?: string
      webhookSecret?: string
    },
  ) {
    const branchId = String(body.branchId ?? '')
    const channelId = String(body.channelId ?? '').trim()
    if (!branchId || !channelId) throw new BadRequestException('branchId and channelId required')
    await assertBranchInCompany(this.prisma, branchId, companyId)

    const id = configId(branchId, channelId)
    return this.prisma.deliveryChannelIntegration.upsert({
      where: { id },
      create: {
        id,
        companyId,
        branchId,
        channelId,
        enabled: body.enabled === true,
        storeId: body.storeId ? String(body.storeId) : null,
        apiKey: body.apiKey ? String(body.apiKey) : null,
        apiBaseUrl: body.apiBaseUrl ? String(body.apiBaseUrl) : null,
        webhookSecret: body.webhookSecret ? String(body.webhookSecret) : null,
      },
      update: {
        enabled: body.enabled === true,
        storeId: body.storeId ? String(body.storeId) : null,
        apiKey: body.apiKey ? String(body.apiKey) : null,
        apiBaseUrl: body.apiBaseUrl ? String(body.apiBaseUrl) : null,
        webhookSecret: body.webhookSecret ? String(body.webhookSecret) : null,
      },
    })
  }

  async getConfig(companyId: string, branchId: string, channelId: string) {
    const row = await this.findConfigRow(companyId, branchId, channelId)
    if (!row) throw new NotFoundException('Channel not configured')
    if (!row.enabled) throw new BadRequestException('Channel is disabled')
    if (!row.storeId?.trim()) throw new BadRequestException('Store ID required')
    return row
  }

  /** Returns null when integrations table is missing or row not found. */
  private async findConfigRow(companyId: string, branchId: string, channelId: string) {
    try {
      return await this.prisma.deliveryChannelIntegration.findFirst({
        where: { companyId, branchId, channelId },
      })
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'P2021') return null
      throw err
    }
  }

  private async productsForMenu(companyId: string, branchId: string): Promise<ChannelMenuItem[]> {
    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        OR: [{ branchId }, { branchId: null }],
        active: true,
      },
      orderBy: { name: 'asc' },
    })
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      nameAr: p.alias ?? undefined,
      category: p.category,
      price: p.price,
      active: p.active,
      code: p.code,
    }))
  }

  async previewMenu(companyId: string, branchId: string, channelId: string) {
    const adapter = adapterFor(channelId)
    if (!adapter) throw new BadRequestException(`No adapter for ${channelId}`)
    const row = await this.getConfig(companyId, branchId, channelId)
    const company = await this.prisma.company.findUnique({ where: { id: companyId } })
    const items = await this.productsForMenu(companyId, branchId)
    const currency = company?.currency?.includes('SAR') ? 'SAR' : 'SAR'
    return adapter.buildMenuPayload(row.storeId!, branchId, items, currency)
  }

  async syncMenu(companyId: string, branchId: string, channelId: string) {
    const adapter = adapterFor(channelId)
    if (!adapter) throw new BadRequestException(`No adapter for ${channelId}`)
    const row = await this.getConfig(companyId, branchId, channelId)
    const menu = await this.previewMenu(companyId, branchId, channelId)
    const result = await adapter.pushMenu(rowToConfig(row), menu)
    const note = `${result.mode}: ${result.message}`
    await this.prisma.deliveryChannelIntegration.update({
      where: { id: row.id },
      data: {
        lastMenuSyncAt: new Date(),
        lastMenuSyncNote: note.slice(0, 500),
        meta: {
          lastSync: result,
          itemCount: menu.items.length,
        } as Prisma.InputJsonValue,
      },
    })
    return { menu, result }
  }

  private async ticketPayload(ticketId: string, companyId: string) {
    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, companyId } })
    if (!ticket) throw new NotFoundException('Ticket not found')
    const payload = (ticket.payload as Record<string, unknown>) ?? {}
    const channel = String(payload.channel ?? 'Direct')
    const externalOrderId = String(payload.externalOrderId ?? '').trim()
    if (!externalOrderId) throw new BadRequestException('Not an external channel order')
    if (channel === 'Direct') throw new BadRequestException('Direct orders have no platform callback')
    return { ticket, payload, channel, externalOrderId, branchId: ticket.branchId }
  }

  async acceptOrder(companyId: string, ticketId: string, etaMinutes?: number) {
    const { ticket, payload, channel, externalOrderId, branchId } = await this.ticketPayload(
      ticketId,
      companyId,
    )
    const adapter = adapterFor(channel)
    const row = await this.findConfigRow(companyId, branchId, channel)
    let result = {
      ok: true,
      mode: 'local' as const,
      message: 'Accepted at POS (configure channel API for live partner callback)',
    }

    if (adapter && row?.enabled && row.storeId?.trim()) {
      const partner = await adapter.acceptOrder(rowToConfig(row), externalOrderId, { etaMinutes })
      if (!partner.ok) throw new BadRequestException(partner.message)
      result = partner
      await adapter.updateOrderStatus(rowToConfig(row), externalOrderId, 'accepted').catch(() => undefined)
    }

    const nextPayload = {
      ...payload,
      channelAcceptStatus: 'accepted',
      channelAcceptedAt: new Date().toISOString(),
      deliveryStatus: String(payload.deliveryStatus ?? 'new'),
      updatedAt: Date.now(),
    } as Prisma.InputJsonValue

    const saved = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { payload: nextPayload },
    })
    notifyTicketChanged(ticket.id)
    return { ticket: saved, result }
  }

  async rejectOrder(companyId: string, ticketId: string, reason?: string) {
    const { ticket, payload, channel, externalOrderId, branchId } = await this.ticketPayload(
      ticketId,
      companyId,
    )
    const adapter = adapterFor(channel)
    const row = await this.findConfigRow(companyId, branchId, channel)
    let result = {
      ok: true,
      mode: 'local' as const,
      message: 'Rejected at POS (configure channel API for live partner callback)',
    }

    if (adapter && row?.enabled && row.storeId?.trim()) {
      const partner = await adapter.rejectOrder(rowToConfig(row), externalOrderId, reason)
      if (!partner.ok) throw new BadRequestException(partner.message)
      result = partner
    }

    const nextPayload = {
      ...payload,
      channelAcceptStatus: 'rejected',
      channelRejectedAt: new Date().toISOString(),
      channelRejectReason: reason ?? 'Rejected at POS',
      deliveryStatus: 'cancelled',
      updatedAt: Date.now(),
    } as Prisma.InputJsonValue

    const saved = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'cancelled', payload: nextPayload },
    })
    notifyTicketChanged(ticket.id)
    return { ticket: saved, result }
  }

  async pushChannelStatus(
    companyId: string,
    ticketId: string,
    status: ChannelOrderStatus,
  ) {
    const { ticket, payload, channel, externalOrderId, branchId } = await this.ticketPayload(
      ticketId,
      companyId,
    )
    const adapter = adapterFor(channel)
    if (!adapter) return { skipped: true, reason: 'no adapter' }
    const row = await this.findConfigRow(companyId, branchId, channel)
    if (!row?.enabled || !row.storeId?.trim()) return { skipped: true, reason: 'channel not configured' }

    const result = await adapter.updateOrderStatus(rowToConfig(row), externalOrderId, status)
    const nextPayload = {
      ...payload,
      channelLastStatus: status,
      channelLastStatusAt: new Date().toISOString(),
      channelLastStatusResult: result.message,
      updatedAt: Date.now(),
    } as Prisma.InputJsonValue
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { payload: nextPayload },
    })
    notifyTicketChanged(ticket.id)
    return { result }
  }
}
