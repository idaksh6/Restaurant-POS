import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: { username?: string; pin?: string; companyId?: string }) {
    return this.auth.login(body.username ?? '', body.pin ?? '', body.companyId)
  }

  /** Delivery rider — PIN is last 4 digits of phone on Settings → Delivery boy. */
  @Post('rider')
  rider(@Body() body: { pin?: string; companyId?: string }) {
    return this.auth.riderLogin(body.pin ?? '', body.companyId)
  }

  /** Bind a POS terminal by VAT — does not list other tenants. */
  @Post('terminal')
  terminal(@Body() body: { taxId?: string }) {
    return this.auth.lookupCompany(body.taxId ?? '')
  }

  /** Terminal staff roster for the bound company only. */
  @Get('staff')
  staff(@Query('companyId') companyId?: string) {
    return this.auth.listStaff(companyId)
  }
}
