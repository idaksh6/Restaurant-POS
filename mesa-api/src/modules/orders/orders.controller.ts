import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard, requireCompany, type JwtUser } from '../auth/jwt.guard'
import { OrdersService } from './orders.service'

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  list(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.orders.listOpen(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Get('day-close')
  latestClose(
    @Req() req: { user?: JwtUser },
    @Query('branchId') branchId?: string,
  ) {
    return this.orders.latestDayClose(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Post('day-close')
  dayClose(
    @Req() req: { user?: JwtUser },
    @Body() body: { branchId: string; dayKey: string; countedCash: number; staff?: string },
  ) {
    return this.orders.closeDay(
      requireCompany(req.user),
      body.branchId,
      body.dayKey,
      body.countedCash,
      body.staff,
    )
  }

  @Get('shifts')
  listShifts(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.orders.listShifts(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('shifts')
  upsertShift(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.orders.upsertShift(
      { ...body, branchId: body.branchId ?? req.user?.branchId },
      requireCompany(req.user),
    )
  }

  @Get('ledger')
  listLedger(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.orders.listLedger(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('ledger')
  upsertLedger(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.orders.upsertLedger(
      { ...body, branchId: body.branchId ?? req.user?.branchId },
      requireCompany(req.user),
    )
  }

  @Get('audit')
  listAudit(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.orders.listAudit(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('audit')
  upsertAudit(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.orders.upsertAudit(
      { ...body, branchId: body.branchId ?? req.user?.branchId },
      requireCompany(req.user),
    )
  }

  @Get('sequences')
  listSequences(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.orders.listSequences(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('sequences')
  upsertSequence(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.orders.upsertSequence(
      { ...body, branchId: body.branchId ?? req.user?.branchId },
      requireCompany(req.user),
    )
  }

  /** Ingest KSA channel order (HungerStation / Jahez / Keeta / …) into the delivery board. */
  @Post('delivery/ingest')
  ingestDelivery(
    @Req() req: { user?: JwtUser },
    @Body()
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
    return this.orders.ingestDelivery(requireCompany(req.user), {
      ...body,
      branchId: body.branchId ?? req.user?.branchId,
    })
  }

  @Put(':id')
  upsert(
    @Req() req: { user?: JwtUser },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.orders.upsert({ ...body, id }, requireCompany(req.user))
  }

  @Post(':id/settle')
  settle(
    @Req() req: { user?: JwtUser },
    @Param('id') id: string,
    @Body() body: { meta?: unknown },
  ) {
    return this.orders.settle(id, requireCompany(req.user), body?.meta)
  }
}
