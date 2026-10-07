import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { User } from '@prisma/client'
import { TenantDbService } from '../../tenant/tenant-db.service'
import {
  defaultExpiryFrom,
  licenseSnapshot,
  resolveLicenseStatus,
  type LicenseSnapshot,
} from './license'

const SECRET = process.env.JWT_SECRET ?? 'mesa-dev-secret'

@Injectable()
export class AuthService {
  constructor(@Inject(TenantDbService) private readonly tenants: TenantDbService) {}

  /** Hard-block when suspended or past expiresAt. First activate is handled in lookupCompany. */
  async assertCompanyLicense(companyId: string): Promise<LicenseSnapshot> {
    const reg = await this.tenants.getRegistry(companyId)
    if (!reg) throw new NotFoundException('Company not found')
    const snap = licenseSnapshot(reg)
    if (snap.licenseStatus === 'suspended') {
      throw new ForbiddenException('This POS company is suspended. Contact support.')
    }
    if (snap.licenseStatus === 'expired') {
      throw new ForbiddenException(
        `POS license expired on ${snap.expiresAt?.slice(0, 10) ?? '—'}. Contact your administrator.`,
      )
    }
    if (snap.licenseStatus === 'pending') {
      throw new ForbiddenException('This POS is not activated yet. Enter the company code on the activation screen.')
    }
    return snap
  }

  async login(username: string, pin: string, companyId?: string) {
    const uname = username.trim().toLowerCase()
    const matched: User[] = []

    const searchIds = companyId?.trim()
      ? [companyId.trim()]
      : (await this.tenants.listRegistries()).map((r) => r.id)

    for (const cid of searchIds) {
      const prisma = await this.tenants.clientFor(cid)
      const candidates = await prisma.user.findMany({
        where: { username: uname, companyId: cid },
      })
      for (const user of candidates) {
        const ok = (await bcrypt.compare(pin, user.pinHash)) || user.pinHash === pin
        if (ok) matched.push(user)
      }
    }

    if (!matched.length) throw new UnauthorizedException('Invalid credentials')
    if (matched.length > 1) {
      throw new UnauthorizedException(
        'This username exists in more than one company. Sign in with that company selected.',
      )
    }
    const user = matched[0]
    if (user.active === false) {
      throw new UnauthorizedException('User is inactive and cannot log in')
    }
    if (!user.companyId) throw new UnauthorizedException('User is not bound to a company')

    const license = await this.assertCompanyLicense(user.companyId)

    const prisma = await this.tenants.clientFor(user.companyId)
    const [company, branches] = await Promise.all([
      prisma.company.findUnique({ where: { id: user.companyId } }),
      prisma.branch.findMany({
        where: { active: true, companyId: user.companyId },
        orderBy: { code: 'asc' },
      }),
    ])

    const accessToken = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        name: user.name,
        branchId: user.branchId,
        companyId: user.companyId,
      },
      SECRET,
      { expiresIn: '12h' },
    )

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        username: user.username,
        branchId: user.branchId,
        companyId: user.companyId,
      },
      branches,
      company,
      license,
    }
  }

  /**
   * Bind a POS terminal by company code or VAT.
   * First device: stamps activatedAt + expiresAt (+12 months) → Active.
   * Later devices: inherit the same license window (no re-stamp).
   * Expired / suspended: hard block.
   */
  async lookupCompany(activationKey: string) {
    const key = activationKey.trim()
    if (!key) {
      throw new BadRequestException('Company code or VAT / tax ID required')
    }

    const code = key.toUpperCase().replace(/[^A-Z0-9]/g, '')
    let reg =
      code.length >= 3 ? await this.tenants.getRegistryByCompanyCode(code) : null
    if (!reg && key.length >= 10) {
      reg = await this.tenants.getRegistryByTaxId(key)
    }
    if (!reg) {
      throw new NotFoundException('No company for this company code or VAT / tax ID')
    }

    let license = licenseSnapshot(reg)
    if (license.licenseStatus === 'suspended') {
      throw new ForbiddenException('This POS company is suspended. Contact support.')
    }
    if (license.licenseStatus === 'expired') {
      throw new ForbiddenException(
        `POS license expired on ${license.expiresAt?.slice(0, 10) ?? '—'}. Contact your administrator.`,
      )
    }

    // First device ever activates — stamp once; other devices inherit.
    if (!reg.activatedAt || license.licenseStatus === 'pending') {
      const activatedAt = new Date()
      const expiresAt = reg.expiresAt && reg.expiresAt > activatedAt ? reg.expiresAt : defaultExpiryFrom(activatedAt)
      reg = await this.tenants.updateLicense(reg.id, {
        licenseStatus: 'active',
        activatedAt,
        expiresAt,
      })
      license = licenseSnapshot(reg)
    } else if (resolveLicenseStatus(reg) === 'expired') {
      throw new ForbiddenException(
        `POS license expired on ${license.expiresAt?.slice(0, 10) ?? '—'}. Contact your administrator.`,
      )
    }

    const prisma = await this.tenants.clientFor(reg.id)
    const company = await prisma.company.findUnique({
      where: { id: reg.id },
      select: {
        id: true,
        companyName: true,
        aliasName: true,
        taxId: true,
        hqPhone: true,
        enableTax: true,
        currency: true,
        logoDataUrl: true,
        branches: {
          where: { active: true },
          orderBy: { code: 'asc' },
        },
      },
    })
    if (!company) throw new NotFoundException('No company for this company code or VAT / tax ID')
    return {
      ...company,
      companyCode: reg.companyCode,
      license,
    }
  }

  async listStaff(companyId?: string) {
    if (!companyId?.trim()) {
      throw new BadRequestException('companyId required')
    }
    const cid = companyId.trim()
    await this.assertCompanyLicense(cid)
    const prisma = await this.tenants.clientFor(cid)
    return prisma.user.findMany({
      where: { companyId: cid, active: true },
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
        pinHash: true,
        company: { select: { companyName: true, aliasName: true } },
      },
    })
  }

  /** Delivery rider sign-in — PIN = last 4 digits of rider phone. */
  async riderLogin(pin: string, companyId?: string) {
    const code = pin.replace(/\D/g, '').slice(-4)
    if (code.length < 4) throw new BadRequestException('Enter the last 4 digits of your phone')
    if (!companyId?.trim()) throw new BadRequestException('companyId required — activate the POS terminal first')
    const cid = companyId.trim()
    const license = await this.assertCompanyLicense(cid)
    const prisma = await this.tenants.clientFor(cid)
    const riders = await prisma.deliveryRider.findMany({
      where: { companyId: cid, active: true },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    })
    const matched = riders.filter((r) => {
      const digits = String(r.phone ?? '').replace(/\D/g, '')
      return digits.slice(-4) === code
    })
    if (!matched.length) throw new UnauthorizedException('Invalid rider PIN')
    if (matched.length > 1) {
      throw new UnauthorizedException('PIN matches more than one rider — update phone numbers in Settings')
    }
    const rider = matched[0]
    const [company, branches] = await Promise.all([
      prisma.company.findUnique({ where: { id: cid } }),
      prisma.branch.findMany({
        where: { active: true, companyId: cid },
        orderBy: { code: 'asc' },
      }),
    ])
    const accessToken = jwt.sign(
      {
        sub: `rider:${rider.id}`,
        role: 'rider',
        name: rider.name,
        branchId: rider.branchId,
        companyId: cid,
        riderId: rider.id,
      },
      SECRET,
      { expiresIn: '12h' },
    )
    return {
      accessToken,
      user: {
        id: `rider:${rider.id}`,
        name: rider.name,
        role: 'rider',
        username: `rider-${rider.id}`,
        branchId: rider.branchId,
        companyId: cid,
      },
      company,
      branches,
      license,
    }
  }

  verify(token: string) {
    try {
      return jwt.verify(token, SECRET) as {
        sub: string
        role: string
        name: string
        branchId?: string
        companyId?: string
      }
    } catch {
      throw new UnauthorizedException('Invalid token')
    }
  }
}
