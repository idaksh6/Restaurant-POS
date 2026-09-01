import { Body, Controller, Get, Inject, Param, Put, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard, requireCompany, type JwtUser } from '../auth/jwt.guard'
import { ZatcaService } from './zatca.service'

@Controller('zatca')
@UseGuards(JwtAuthGuard)
export class ZatcaController {
  constructor(@Inject(ZatcaService) private readonly zatca: ZatcaService) {}

  @Get('config')
  config(@Req() req: { user?: JwtUser }) {
    return this.zatca.getConfig(requireCompany(req.user))
  }

  @Put('config')
  putConfig(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.zatca.putConfig(requireCompany(req.user), body)
  }

  @Get('invoices')
  list(@Req() req: { user?: JwtUser }, @Query('take') take?: string) {
    return this.zatca.listInvoices(requireCompany(req.user), take ? Number(take) : 50)
  }

  @Get('invoices/:id')
  one(@Req() req: { user?: JwtUser }, @Param('id') id: string) {
    return this.zatca.getInvoice(requireCompany(req.user), id)
  }

  @Put('invoices')
  submit(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.zatca.submitInvoice(requireCompany(req.user), body)
  }
}
