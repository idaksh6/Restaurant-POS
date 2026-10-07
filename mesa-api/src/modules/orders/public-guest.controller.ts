import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common'
import { tenantAls } from '../../tenant/tenant-context'
import { OrdersService } from './orders.service'

/** Public guest QR menu + order — no staff JWT. Pass companyId for multi-tenant DBs. */
@Controller('public')
export class PublicGuestController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get('menu')
  menu(
    @Query('branchId') branchId?: string,
    @Query('companyId') companyId?: string,
  ) {
    if (!branchId?.trim()) throw new Error('branchId required')
    const bid = branchId.trim()
    const cid = companyId?.trim()
    if (cid) {
      return tenantAls.run({ companyId: cid }, () => this.orders.publicMenu(bid))
    }
    return this.orders.publicMenu(bid)
  }

  @Post('guest-order')
  guestOrder(
    @Body()
    body: {
      companyId?: string
      branchId?: string
      customer?: string
      phone?: string
      note?: string
      tableId?: string
      lines?: Array<{ name?: string; qty?: number; price?: number; itemId?: string }>
    },
  ) {
    const branchId = String(body.branchId ?? '').trim()
    if (!branchId) throw new Error('branchId required')
    const cid = String(body.companyId ?? '').trim()
    const run = () => this.orders.ingestGuestOrder(branchId, body)
    if (cid) return tenantAls.run({ companyId: cid }, run)
    return run()
  }
}
