import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Prisma } from '@prisma/client'
import { systemRoleTemplates } from '../access/roleTemplates'
import { TenantDbService } from '../../tenant/tenant-db.service'
import { runWithCompanyId } from '../../tenant/tenant-context'
import { SeedService } from '../../seed.service'

export type RegisterCompanyInput = {
  companyName: string
  aliasName?: string
  taxId: string
  hqPhone?: string
  currency?: string
  enableTax?: boolean
  branchName: string
  branchNameAr?: string
  branchCode: string
  branchAddress?: string
  branchAddressAr?: string
  branchPhone?: string
  adminName: string
  adminNameAr?: string
  adminUsername: string
  adminPassword: string
}

export type UpdateCompanyInput = {
  companyName: string
  aliasName?: string
  taxId: string
  hqPhone?: string
  branches?: Array<{
    id: string
    name: string
    nameAr?: string
    code: string
    address?: string
    addressAr?: string
    phone?: string
  }>
  users?: Array<{
    id: string
    name: string
    nameAr?: string
    username: string
    password?: string
  }>
}

const DEV_JWT_SECRET = () =>
  process.env.DEV_PORTAL_JWT_SECRET ??
  process.env.JWT_SECRET ??
  'mesa-dev-portal-jwt'

function slugId(prefix: string, raw: string) {
  const clean = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
  return `${prefix}-${clean || Date.now().toString(36)}`
}

@Injectable()
export class DevService {
  constructor(
    @Inject(TenantDbService) private readonly tenants: TenantDbService,
    @Inject(SeedService) private readonly seed: SeedService,
  ) {}

  /** Single developer account from env (not POS staff). */
  login(username: string, password: string) {
    const expectedUser = process.env.DEV_PORTAL_USER ?? 'developer'
    const expectedPass = process.env.DEV_PORTAL_PASSWORD ?? 'mesa-dev-2026'
    if (username.trim() !== expectedUser || password !== expectedPass) {
      throw new UnauthorizedException('Invalid developer credentials')
    }
    const accessToken = jwt.sign(
      { sub: 'developer', role: 'developer', typ: 'dev-portal' },
      DEV_JWT_SECRET(),
      { expiresIn: '12h' },
    )
    return {
      accessToken,
      user: { username: expectedUser, role: 'developer' as const },
    }
  }

  assertDevToken(authHeader?: string) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Developer login required')
    }
    const token = authHeader.slice(7)
    try {
      const payload = jwt.verify(token, DEV_JWT_SECRET()) as { typ?: string }
      if (payload.typ !== 'dev-portal') {
        throw new UnauthorizedException('Invalid developer token')
      }
    } catch {
      throw new UnauthorizedException('Developer session expired — log in again')
    }
  }

  async listCompanies() {
    const registries = await this.tenants.listRegistries()
    const rows = await Promise.all(
      registries.map(async (reg) => {
        const prisma = await this.tenants.clientFor(reg.id)
        const company = await prisma.company.findUnique({
          where: { id: reg.id },
          include: {
            branches: { orderBy: { code: 'asc' } },
            users: {
              where: { role: 'admin' },
              select: { id: true, username: true, name: true, role: true, createdAt: true },
            },
          },
        })
        if (!company) {
          return {
            id: reg.id,
            companyName: reg.companyName,
            taxId: reg.taxId,
            databaseName: reg.databaseName,
            branches: [],
            users: [],
          }
        }
        return { ...company, databaseName: reg.databaseName }
      }),
    )
    return rows
  }

  async getCompany(id: string) {
    const reg = await this.tenants.getRegistry(id)
    if (!reg) throw new BadRequestException('Company not found')
    const prisma = await this.tenants.clientFor(id)
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        branches: { orderBy: { code: 'asc' } },
        users: {
          select: {
            id: true,
            username: true,
            name: true,
            nameAr: true,
            role: true,
            branchId: true,
            createdAt: true,
          },
        },
      },
    })
    if (!company) throw new BadRequestException('Company not found')
    return { ...company, databaseName: reg.databaseName }
  }

  async register(input: RegisterCompanyInput) {
    const companyName = input.companyName?.trim()
    const taxId = input.taxId?.trim()
    const branchName = input.branchName?.trim()
    const branchCode = input.branchCode?.trim().toUpperCase()
    const adminUsername = input.adminUsername?.trim().toLowerCase()
    const adminPassword = input.adminPassword?.trim()
    const adminName = input.adminName?.trim() || 'Admin'

    if (!companyName) throw new BadRequestException('companyName required')
    if (!taxId || taxId.length < 10) {
      throw new BadRequestException('Valid KSA VAT / taxId required')
    }
    if (!branchName || !branchCode) {
      throw new BadRequestException('branchName and branchCode required')
    }
    if (!adminUsername || adminUsername.length < 3) {
      throw new BadRequestException('adminUsername required (min 3)')
    }
    if (!adminPassword || adminPassword.length < 4) {
      throw new BadRequestException('adminPassword required (min 4)')
    }

    const companyId = slugId('co', companyName)
    const branchId = slugId('br', `${branchCode}-${companyId}`)
    const pinHash = await bcrypt.hash(adminPassword, 8)

    let prisma
    try {
      prisma = await this.tenants.provisionCompanyDb({
        companyId,
        companyName,
        taxId,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/already has/i.test(msg)) throw new ConflictException(msg)
      throw new BadRequestException(
        `Could not create company database. Ensure Postgres user can CREATE DATABASE. ${msg}`,
      )
    }

    let result
    try {
      result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          id: companyId,
          companyName,
          aliasName: input.aliasName?.trim() || null,
          taxId,
          hqPhone: input.hqPhone?.trim() || null,
          currency: input.currency?.trim() || 'Saudi Arabia · SAR',
          enableTax: input.enableTax !== false,
        },
      })

      const branch = await tx.branch.create({
        data: {
          id: branchId,
          companyId: company.id,
          name: branchName,
          nameAr: input.branchNameAr?.trim() || null,
          code: branchCode,
          address: input.branchAddress?.trim() || null,
          addressAr: input.branchAddressAr?.trim() || null,
          phone: input.branchPhone?.trim() || input.hqPhone?.trim() || null,
          active: true,
        },
      })

      const admin = await tx.user.create({
        data: {
          username: adminUsername,
          pinHash,
          name: adminName,
          nameAr: input.adminNameAr?.trim() || null,
          role: 'admin',
          active: true,
          companyId: company.id,
          branchId: branch.id,
        },
        select: {
          id: true,
          username: true,
          name: true,
          nameAr: true,
          role: true,
          companyId: true,
          branchId: true,
        },
      })

      return { company, branch, admin }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new BadRequestException(`Company database ready but create failed: ${msg}`)
    }

    await prisma.role.createMany({
      data: systemRoleTemplates.map((row) => ({
        companyId: result.company.id,
        key: row.key,
        name: row.name,
        nameAr: row.nameAr,
        system: true,
        privileges: row.privileges as unknown as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    })

    try {
      await this.seed.seedTenant(prisma, {
        companyId: result.company.id,
        branchIds: [result.branch.id],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new BadRequestException(`Company DB created but seed failed: ${msg}`)
    }

    const reg = await this.tenants.getRegistry(companyId)

    return {
      ok: true,
      provisioned: true,
      seeded: true,
      databaseName: reg?.databaseName,
      message: `Company provisioned in ${reg?.databaseName} with starter menu, floor, stock, payments, and VAT.`,
      ...result,
    }
  }

  async update(id: string, input: UpdateCompanyInput) {
    const companyName = input.companyName?.trim()
    const taxId = input.taxId?.trim()
    if (!companyName) throw new BadRequestException('companyName required')
    if (!taxId || taxId.length < 10) {
      throw new BadRequestException('Valid KSA VAT / taxId required')
    }

    const reg = await this.tenants.getRegistry(id)
    if (!reg) throw new BadRequestException('Company not found')

    const taxTaken = await this.tenants.getRegistryByTaxId(taxId)
    if (taxTaken && taxTaken.id !== id) {
      throw new ConflictException('Company with this VAT/taxId already exists')
    }

    const prisma = await this.tenants.clientFor(id)
    const branches = input.branches ?? []
    const users = input.users ?? []

    const codes = branches.map((b) => b.code.trim().toUpperCase())
    if (new Set(codes).size !== codes.length) {
      throw new ConflictException('Duplicate branch codes')
    }

    const usernames = users.map((u) => u.username.trim().toLowerCase())
    if (new Set(usernames).size !== usernames.length) {
      throw new ConflictException('Duplicate admin usernames')
    }

    await runWithCompanyId(id, async () => {
      await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id },
          data: {
            companyName,
            aliasName: input.aliasName?.trim() || null,
            taxId,
            hqPhone: input.hqPhone?.trim() || null,
          },
        })

        for (const b of branches) {
          const code = b.code.trim().toUpperCase()
          const name = b.name.trim()
          if (!b.id || !code || !name) {
            throw new BadRequestException('Each branch needs id, code, and name')
          }
          const clash = await tx.branch.findFirst({
            where: { companyId: id, code, id: { not: b.id } },
          })
          if (clash) throw new ConflictException(`Branch code ${code} already used`)
          await tx.branch.update({
            where: { id: b.id },
            data: {
              name,
              nameAr: b.nameAr?.trim() || null,
              code,
              address: b.address?.trim() || null,
              addressAr: b.addressAr?.trim() || null,
              phone: b.phone?.trim() || null,
            },
          })
        }

        for (const u of users) {
          const username = u.username.trim().toLowerCase()
          const name = u.name.trim()
          if (!u.id || !username || username.length < 3 || !name) {
            throw new BadRequestException('Each user needs id, name, and username (min 3)')
          }
          const clash = await tx.user.findFirst({
            where: { companyId: id, username, id: { not: u.id } },
          })
          if (clash) throw new ConflictException(`Username ${username} already taken in this company`)
          const data: {
            name: string
            nameAr: string | null
            username: string
            pinHash?: string
          } = {
            name,
            nameAr: u.nameAr?.trim() || null,
            username,
          }
          const nextPin = u.password?.trim()
          if (nextPin) {
            if (nextPin.length < 4) {
              throw new BadRequestException('New password must be at least 4 characters')
            }
            data.pinHash = await bcrypt.hash(nextPin, 8)
          }
          await tx.user.update({ where: { id: u.id }, data })
        }
      })
    })

    await this.tenants.control.tenantRegistry.update({
      where: { id },
      data: { companyName, taxId },
    })

    return this.getCompany(id)
  }
}
