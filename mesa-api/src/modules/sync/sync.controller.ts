import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard, requireCompany, type JwtUser } from '../auth/jwt.guard'
import { SyncService } from './sync.service'
import { SyncGateway } from './sync.gateway'

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(SyncGateway) private readonly gateway: SyncGateway,
  ) {}

  @Get('bootstrap')
  bootstrap(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.sync.bootstrap(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  /** Company-wide JSON backup from the server database. */
  @Get('backup')
  backup(@Req() req: { user?: JwtUser }) {
    return this.sync.exportBackup(requireCompany(req.user))
  }

  @Post('push')
  async push(
    @Req() req: { user?: JwtUser },
    @Body() body: { deviceId?: string; ops?: unknown[] },
  ) {
    const result = await this.sync.push(
      requireCompany(req.user),
      body.deviceId ?? 'unknown',
      (body.ops ?? []) as never,
    )
    const ops = Array.isArray(body.ops) ? body.ops : []
    const ticketOnly =
      ops.length > 0 &&
      ops.every((op) => {
        const type = String((op as { type?: string }).type ?? '')
        return type.startsWith('ticket') || type.startsWith('kot')
      })
    this.gateway.broadcast({
      type: ticketOnly ? 'ticket.updated' : 'masters.invalidate',
      deviceId: body.deviceId ?? 'unknown',
    })
    return result
  }

  @Get('pull')
  pull(
    @Req() req: { user?: JwtUser },
    @Query('since') since?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.sync.pull(requireCompany(req.user), since ?? '0', branchId ?? req.user?.branchId)
  }
}
