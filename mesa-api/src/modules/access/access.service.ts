import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { InjectPrisma, PrismaService } from '../../prisma.service'
import { systemRoleTemplates, normalizeAccessFlags, type AccessFlags } from './roleTemplates'
import type { Prisma } from '@prisma/client'
import { requireCompany, type JwtUser } from '../auth/jwt.guard'
import { notifyMastersChanged } from '../sync/bus'

@Injectable()
export class AccessService {
  constructor(@InjectPrisma() private readonly prisma: PrismaService) {}

  private async publishSyncOp(
    companyId: string,
    type: 'user.upsert' | 'role.upsert' | 'role.delete',
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    try {
      await this.prisma.syncOp.create({
        data: {
          id: randomUUID(),
          deviceId: 'api',
          companyId,
          branchId: null,
          type,
          entityId,
          payload: payload as Prisma.InputJsonValue,
          createdAt: new Date(),
        },
      })
    } catch {
      /* duplicate / transient — still broadcast so peers refresh from REST */
    }
    notifyMastersChanged('api')
  }

  async assertCanManageUsers(user?: JwtUser) {
    const companyId = requireCompany(user)
    if (user?.role === 'admin') return companyId
    await this.ensureSystemRoles(companyId)
    const row = await this.prisma.role.findFirst({
      where: { companyId, key: user?.role ?? '' },
    })
    const privileges = (row?.privileges ?? {}) as AccessFlags
    if (!privileges.canManageUsers) {
      throw new ForbiddenException('No access to users and roles')
    }
    return companyId
  }

  async ensureSystemRoles(companyId: string) {
    for (const row of systemRoleTemplates) {
      await this.prisma.role.upsert({
        where: { companyId_key: { companyId, key: row.key } },
        update: {},
        create: {
          companyId,
          key: row.key,
          name: row.name,
          nameAr: row.nameAr,
          system: true,
          privileges: row.privileges as unknown as Prisma.InputJsonValue,
        },
      })
    }
  }

  async listRoles(companyId: string) {
    await this.ensureSystemRoles(companyId)
    return this.prisma.role.findMany({
      where: { companyId },
      orderBy: [{ system: 'desc' }, { name: 'asc' }],
    })
  }

  async upsertRole(
    companyId: string,
    input: {
      id?: string
      key?: string
      name: string
      nameAr?: string
      privileges: AccessFlags
    },
  ) {
    const name = input.name.trim()
    if (!name) throw new BadRequestException('Role name required')
    const key = (input.key ?? name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    if (!key) throw new BadRequestException('Role key required')
    if (systemRoleTemplates.some((r) => r.key === key) && !input.id) {
      throw new ConflictException('That key is reserved for a system role')
    }

    const nameClash = await this.prisma.role.findFirst({
      where: {
        companyId,
        name: { equals: name, mode: 'insensitive' },
        ...(input.id ? { id: { not: input.id } } : {}),
      },
    })
    if (nameClash) throw new ConflictException('Role name already exists')

    const privileges = normalizeAccessFlags(input.privileges)

    if (input.id) {
      let existing = await this.prisma.role.findFirst({ where: { id: input.id, companyId } })
      if (!existing) {
        existing = await this.prisma.role.findFirst({ where: { companyId, key } })
      }
      if (existing) {
        const row = await this.prisma.role.update({
          where: { id: existing.id },
          data: {
            name,
            nameAr: input.nameAr?.trim() || null,
            privileges: privileges as unknown as Prisma.InputJsonValue,
            ...(existing.system ? {} : { key }),
          },
        })
        await this.publishSyncOp(companyId, 'role.upsert', row.id, {
          id: row.id,
          key: row.key,
          name: row.name,
          nameAr: row.nameAr,
          system: row.system,
          privileges: row.privileges,
          companyId,
        })
        return row
      }
    }

    const clash = await this.prisma.role.findFirst({ where: { companyId, key } })
    if (clash) throw new ConflictException('Role key already exists')
    const created = await this.prisma.role.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        companyId,
        key,
        name,
        nameAr: input.nameAr?.trim() || null,
        system: false,
        privileges: privileges as unknown as Prisma.InputJsonValue,
      },
    })
    await this.publishSyncOp(companyId, 'role.upsert', created.id, {
      id: created.id,
      key: created.key,
      name: created.name,
      nameAr: created.nameAr,
      system: created.system,
      privileges: created.privileges,
      companyId,
    })
    return created
  }

  async deleteRole(companyId: string, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, companyId } })
    if (!role) return { ok: true }
    if (role.system) throw new BadRequestException('System roles cannot be deleted')
    const inUse = await this.prisma.user.count({ where: { companyId, role: role.key } })
    if (inUse) throw new ConflictException('Reassign users before deleting this role')
    await this.prisma.role.delete({ where: { id } })
    await this.publishSyncOp(companyId, 'role.delete', id, { id })
    return { ok: true }
  }

  async listUsers(companyId: string, branchId?: string) {
    return this.prisma.user.findMany({
      where: {
        companyId,
        ...(branchId
          ? { OR: [{ branchId }, { branchId: null }, { role: 'admin' }] }
          : {}),
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        username: true,
        name: true,
        nameAr: true,
        role: true,
        active: true,
        branchId: true,
        companyId: true,
        createdAt: true,
      },
    })
  }

  async saveUser(
    companyId: string,
    input: {
      id?: string
      name: string
      nameAr?: string
      username: string
      pin?: string
      role: string
      branchId?: string | null
      active?: boolean
    },
  ) {
    const name = input.name.trim()
    const username = input.username.trim().toLowerCase()
    const role = input.role.trim()
    if (!name) throw new BadRequestException('Name required')
    if (!username || username.length < 3) throw new BadRequestException('Username min 3 characters')
    if (!role) throw new BadRequestException('Role required')

    await this.ensureSystemRoles(companyId)
    const roleRow = await this.prisma.role.findFirst({ where: { companyId, key: role } })
    if (!roleRow) throw new BadRequestException('Unknown role')

    if (input.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: input.branchId, companyId } })
      if (!branch) throw new BadRequestException('Branch not in this company')
    }

    const clash = await this.prisma.user.findFirst({
      where: { companyId, username, ...(input.id ? { id: { not: input.id } } : {}) },
    })
    if (clash) throw new ConflictException('Username already used in this company')

    if (input.id) {
      let existing = await this.prisma.user.findFirst({ where: { id: input.id, companyId } })
      if (!existing) {
        existing = await this.prisma.user.findFirst({ where: { companyId, username } })
      }
      if (existing) {
        if (existing.role === 'admin' && role !== 'admin') {
          throw new BadRequestException('Admin role cannot be changed')
        }
        if (existing.role !== 'admin' && role === 'admin') {
          throw new BadRequestException('Admin role cannot be assigned')
        }
        if (existing.role === 'admin' && input.active === false) {
          const admins = await this.prisma.user.count({
            where: { companyId, role: 'admin', active: true, id: { not: existing.id } },
          })
          if (!admins) throw new ConflictException('Keep at least one active Admin')
        }
        const data: {
          name: string
          nameAr: string | null
          username: string
          role: string
          branchId: string | null
          active: boolean
          pinHash?: string
        } = {
          name,
          nameAr: input.nameAr?.trim() || null,
          username,
          role,
          branchId: input.branchId !== undefined ? input.branchId : existing.branchId,
          active: input.active !== false,
        }
        if (input.pin?.trim()) {
          if (input.pin.trim().length < 4) throw new BadRequestException('PIN min 4 characters')
          data.pinHash = await bcrypt.hash(input.pin.trim(), 8)
        }
        const updated = await this.prisma.user.update({
          where: { id: existing.id },
          data,
          select: {
            id: true,
            username: true,
            name: true,
            nameAr: true,
            role: true,
            active: true,
            branchId: true,
            companyId: true,
          },
        })
        await this.publishSyncOp(companyId, 'user.upsert', updated.id, {
          ...updated,
          ...(input.pin?.trim() ? { pin: input.pin.trim() } : {}),
        })
        return updated
      }
    }

    if (!input.pin?.trim() || input.pin.trim().length < 4) {
      throw new BadRequestException('PIN min 4 characters')
    }
    if (role === 'admin') {
      throw new BadRequestException('Admin role cannot be assigned')
    }
    const created = await this.prisma.user.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        companyId,
        name,
        nameAr: input.nameAr?.trim() || null,
        username,
        role,
        branchId: input.branchId ?? null,
        active: input.active !== false,
        pinHash: await bcrypt.hash(input.pin.trim(), 8),
      },
      select: {
        id: true,
        username: true,
        name: true,
        nameAr: true,
        role: true,
        active: true,
        branchId: true,
        companyId: true,
      },
    })
    await this.publishSyncOp(companyId, 'user.upsert', created.id, {
      ...created,
      pin: input.pin.trim(),
    })
    return created
  }
}
