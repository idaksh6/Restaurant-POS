import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { Inject } from '@nestjs/common'
import { OrdersService } from '../orders/orders.service'

/**
 * Public aggregator ingest — no staff JWT.
 * Authenticate with X-Webhook-Secret === process.env.DELIVERY_WEBHOOK_SECRET
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Post('delivery/ingest')
  ingest(
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body()
    body: {
      companyId?: string
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
    const expected = process.env.DELIVERY_WEBHOOK_SECRET?.trim()
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid webhook secret')
    }
    const companyId = String(body.companyId ?? '').trim()
    if (!companyId) throw new UnauthorizedException('companyId required')
    return this.orders.ingestDelivery(companyId, body)
  }
}
