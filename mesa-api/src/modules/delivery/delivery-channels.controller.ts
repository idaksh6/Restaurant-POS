import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard, requireCompany, type JwtUser } from '../auth/jwt.guard'
import { DeliveryChannelsService } from './delivery-channels.service'
import type { ChannelOrderStatus } from './adapters/channel-adapter'

@Controller('delivery/channels')
@UseGuards(JwtAuthGuard)
export class DeliveryChannelsController {
  constructor(@Inject(DeliveryChannelsService) private readonly channels: DeliveryChannelsService) {}

  @Get('config')
  listConfig(
    @Req() req: { user?: JwtUser },
    @Query('branchId') branchId?: string,
  ) {
    const bid = branchId ?? req.user?.branchId ?? ''
    return this.channels.listConfigs(requireCompany(req.user), bid)
  }

  @Get('supported')
  supported() {
    return this.channels.listSupportedChannels()
  }

  @Put('config')
  upsertConfig(
    @Req() req: { user?: JwtUser },
    @Body()
    body: {
      branchId?: string
      channelId: string
      enabled?: boolean
      storeId?: string
      apiKey?: string
      apiBaseUrl?: string
      webhookSecret?: string
    },
  ) {
    return this.channels.upsertConfig(requireCompany(req.user), {
      ...body,
      branchId: body.branchId ?? req.user?.branchId ?? '',
    })
  }

  @Get(':channelId/menu/preview')
  previewMenu(
    @Req() req: { user?: JwtUser },
    @Param('channelId') channelId: string,
    @Query('branchId') branchId?: string,
  ) {
    const bid = branchId ?? req.user?.branchId ?? ''
    return this.channels.previewMenu(requireCompany(req.user), bid, channelId)
  }

  @Post(':channelId/menu/sync')
  syncMenu(
    @Req() req: { user?: JwtUser },
    @Param('channelId') channelId: string,
    @Query('branchId') branchId?: string,
  ) {
    const bid = branchId ?? req.user?.branchId ?? ''
    return this.channels.syncMenu(requireCompany(req.user), bid, channelId)
  }
}

@Controller('delivery/orders')
@UseGuards(JwtAuthGuard)
export class DeliveryOrdersChannelController {
  constructor(@Inject(DeliveryChannelsService) private readonly channels: DeliveryChannelsService) {}

  @Post(':ticketId/accept')
  accept(
    @Req() req: { user?: JwtUser },
    @Param('ticketId') ticketId: string,
    @Body() body: { etaMinutes?: number },
  ) {
    return this.channels.acceptOrder(requireCompany(req.user), ticketId, body?.etaMinutes)
  }

  @Post(':ticketId/reject')
  reject(
    @Req() req: { user?: JwtUser },
    @Param('ticketId') ticketId: string,
    @Body() body: { reason?: string },
  ) {
    return this.channels.rejectOrder(requireCompany(req.user), ticketId, body?.reason)
  }

  @Post(':ticketId/channel-status')
  channelStatus(
    @Req() req: { user?: JwtUser },
    @Param('ticketId') ticketId: string,
    @Body() body: { status: ChannelOrderStatus },
  ) {
    return this.channels.pushChannelStatus(requireCompany(req.user), ticketId, body.status)
  }
}
