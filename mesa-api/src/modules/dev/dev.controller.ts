import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common'
import { DevService, type RegisterCompanyInput, type UpdateCompanyInput } from './dev.service'

@Controller('dev')
export class DevController {
  constructor(@Inject(DevService) private readonly dev: DevService) {}

  @Post('login')
  login(@Body() body: { username?: string; password?: string }) {
    return this.dev.login(body.username ?? '', body.password ?? '')
  }

  @Get('companies')
  list(@Headers('authorization') auth?: string) {
    this.dev.assertDevToken(auth)
    return this.dev.listCompanies()
  }

  @Get('companies/:id')
  one(@Headers('authorization') auth: string | undefined, @Param('id') id: string) {
    this.dev.assertDevToken(auth)
    return this.dev.getCompany(id)
  }

  @Post('companies/register')
  register(
    @Headers('authorization') auth: string | undefined,
    @Body() body: RegisterCompanyInput,
  ) {
    this.dev.assertDevToken(auth)
    return this.dev.register(body)
  }

  @Put('companies/:id')
  update(
    @Headers('authorization') auth: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateCompanyInput,
  ) {
    this.dev.assertDevToken(auth)
    return this.dev.update(id, body)
  }
}
