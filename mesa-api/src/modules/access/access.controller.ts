import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard, requireCompany, type JwtUser } from '../auth/jwt.guard'
import { AccessService } from './access.service'
import type { AccessFlags } from './roleTemplates'

@Controller('access')
@UseGuards(JwtAuthGuard)
export class AccessController {
  constructor(@Inject(AccessService) private readonly access: AccessService) {}

  @Get('roles')
  roles(@Req() req: { user?: JwtUser }) {
    return this.access.listRoles(requireCompany(req.user))
  }

  @Post('roles')
  async createRole(
    @Req() req: { user?: JwtUser },
    @Body() body: { name?: string; nameAr?: string; key?: string; privileges?: AccessFlags },
  ) {
    const companyId = await this.access.assertCanManageUsers(req.user)
    return this.access.upsertRole(companyId, {
      name: body.name ?? '',
      nameAr: body.nameAr,
      key: body.key,
      privileges: body.privileges as AccessFlags,
    })
  }

  @Put('roles/:id')
  async updateRole(
    @Req() req: { user?: JwtUser },
    @Param('id') id: string,
    @Body() body: { name?: string; nameAr?: string; key?: string; privileges?: AccessFlags },
  ) {
    const companyId = await this.access.assertCanManageUsers(req.user)
    return this.access.upsertRole(companyId, {
      id,
      name: body.name ?? '',
      nameAr: body.nameAr,
      key: body.key,
      privileges: body.privileges as AccessFlags,
    })
  }

  @Delete('roles/:id')
  async deleteRole(@Req() req: { user?: JwtUser }, @Param('id') id: string) {
    const companyId = await this.access.assertCanManageUsers(req.user)
    return this.access.deleteRole(companyId, id)
  }

  @Get('users')
  async users(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    const companyId = await this.access.assertCanManageUsers(req.user)
    return this.access.listUsers(companyId, branchId)
  }

  @Post('users')
  async createUser(
    @Req() req: { user?: JwtUser },
    @Body()
    body: {
      name?: string
      nameAr?: string
      username?: string
      pin?: string
      role?: string
      branchId?: string | null
      active?: boolean
    },
  ) {
    const companyId = await this.access.assertCanManageUsers(req.user)
    return this.access.saveUser(companyId, {
      name: body.name ?? '',
      nameAr: body.nameAr,
      username: body.username ?? '',
      pin: body.pin,
      role: body.role ?? '',
      branchId: body.branchId,
      active: body.active,
    })
  }

  @Put('users/:id')
  async updateUser(
    @Req() req: { user?: JwtUser },
    @Param('id') id: string,
    @Body()
    body: {
      name?: string
      nameAr?: string
      username?: string
      pin?: string
      role?: string
      branchId?: string | null
      active?: boolean
    },
  ) {
    const companyId = await this.access.assertCanManageUsers(req.user)
    return this.access.saveUser(companyId, {
      id,
      name: body.name ?? '',
      nameAr: body.nameAr,
      username: body.username ?? '',
      pin: body.pin,
      role: body.role ?? '',
      branchId: body.branchId,
      active: body.active,
    })
  }
}
