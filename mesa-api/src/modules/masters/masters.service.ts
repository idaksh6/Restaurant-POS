import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { InjectPrisma, PrismaService } from '../../prisma.service'
import { assertBranchInCompany, companyIdForBranch } from '../auth/tenant'
import { notifyMastersChanged } from '../sync/bus'

type CategoryRow = {
  id: string
  companyId: string
  branchId: string | null
  name: string
  alias: string | null
  parentId: string | null
  active: boolean
  sort: number
  meta: Prisma.JsonValue | null
  updatedAt: Date
}

@Injectable()
export class MastersService {
  constructor(@InjectPrisma() private readonly prisma: PrismaService) {}

  async getCompany(companyId: string) {
    // Select only legacy columns so older tenant DBs still boot before ZATCA DDL is applied.
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        companyName: true,
        aliasName: true,
        taxId: true,
        enableTax: true,
        currency: true,
        logoDataUrl: true,
        hqPhone: true,
        updatedAt: true,
      },
    })
    if (!row) return null
    try {
      const flag = await this.prisma.$queryRaw<
        Array<{ zatcaEnabled: boolean; zatcaPhase2Enabled?: boolean }>
      >`
        SELECT "zatcaEnabled", "zatcaPhase2Enabled" FROM "Company" WHERE id = ${companyId}
      `
      return {
        ...row,
        zatcaEnabled: flag[0]?.zatcaEnabled === true,
        zatcaPhase2Enabled: flag[0]?.zatcaPhase2Enabled === true,
      }
    } catch {
      return { ...row, zatcaEnabled: false, zatcaPhase2Enabled: false }
    }
  }

  listBranches(companyId: string) {
    return this.prisma.branch.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    })
  }

  async upsertBranch(body: Record<string, unknown>, companyId: string) {
    const existing = await this.getCompany(companyId)
    if (!existing) throw new BadRequestException('Company not found')
    const id = String(body.id)
    const row = await this.prisma.branch.findUnique({ where: { id } })
    if (row && row.companyId !== companyId) {
      throw new BadRequestException('Branch belongs to another company')
    }
    const data = {
      companyId,
      name: String(body.name ?? ''),
      nameAr: body.nameAr ? String(body.nameAr) : null,
      code: String(body.code ?? ''),
      address: body.address ? String(body.address) : null,
      addressAr: body.addressAr ? String(body.addressAr) : null,
      phone: body.phone ? String(body.phone) : null,
      active: body.active !== false,
    }
    return this.prisma.branch.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  async deleteBranch(id: string, companyId: string) {
    const row = await this.prisma.branch.findFirst({ where: { id, companyId } })
    if (!row) return { ok: true, id }
    await this.prisma.branch.update({ where: { id }, data: { active: false } })
    return { ok: true, id }
  }

  listCategories(companyId: string, branchId?: string) {
    if (branchId) {
      return this.prisma.$queryRaw<CategoryRow[]>`
        SELECT id, "companyId", "branchId", name, alias, "parentId", active, sort, meta, "updatedAt"
        FROM "Category"
        WHERE "companyId" = ${companyId}
          AND "branchId" = ${branchId}
        ORDER BY sort ASC
      `
    }
    return this.prisma.$queryRaw<CategoryRow[]>`
      SELECT id, "companyId", "branchId", name, alias, "parentId", active, sort, meta, "updatedAt"
      FROM "Category"
      WHERE "companyId" = ${companyId}
      ORDER BY sort ASC
    `
  }

  async upsertCategory(cat: Record<string, unknown>, companyId: string) {
    const branchId = cat.branchId ? String(cat.branchId) : null
    if (!branchId) throw new BadRequestException('branchId required')
    if (branchId) await assertBranchInCompany(this.prisma, branchId, companyId)
    const id = String(cat.id)
    const meta = {
      isBar: cat.isBar === true,
      buttonColor: cat.buttonColor ? String(cat.buttonColor) : undefined,
      buttonHeight: cat.buttonHeight != null ? Number(cat.buttonHeight) : undefined,
      buttonFontSize: cat.buttonFontSize != null ? Number(cat.buttonFontSize) : undefined,
      productButtonColor: cat.productButtonColor ? String(cat.productButtonColor) : undefined,
      productButtonHeight: cat.productButtonHeight != null ? Number(cat.productButtonHeight) : undefined,
      productButtonFontSize:
        cat.productButtonFontSize != null ? Number(cat.productButtonFontSize) : undefined,
      deptFontColor: cat.deptFontColor ? String(cat.deptFontColor) : undefined,
      productFontColor: cat.productFontColor ? String(cat.productFontColor) : undefined,
      imageDataUrl: cat.imageDataUrl ? String(cat.imageDataUrl) : undefined,
    }
    const data = {
      companyId,
      name: String(cat.name ?? ''),
      parentId: cat.parentId ? String(cat.parentId) : null,
      active: cat.active !== false,
      sort: Number(cat.sort ?? 0),
      branchId,
    }
    await this.prisma.category.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
    const alias = cat.alias ? String(cat.alias) : null
    await this.prisma.$executeRawUnsafe(
      `UPDATE "Category" SET "alias" = $1, "meta" = $2::jsonb WHERE "id" = $3 AND "companyId" = $4`,
      alias,
      JSON.stringify(meta),
      id,
      companyId,
    )
    const rows = await this.prisma.$queryRaw<CategoryRow[]>`
      SELECT id, "companyId", "branchId", name, alias, "parentId", active, sort, meta, "updatedAt"
      FROM "Category"
      WHERE id = ${id} AND "companyId" = ${companyId}
      LIMIT 1
    `
    return rows[0]
  }

  async deleteCategory(id: string, companyId: string) {
    await this.prisma.category.deleteMany({ where: { id, companyId } })
    return { ok: true, id }
  }

  listProducts(companyId: string, branchId?: string) {
    if (branchId) {
      return this.prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT id, "companyId", "branchId", name, alias, "categoryId", category, price, cost, code, active, meta, "updatedAt"
        FROM "Product"
        WHERE "companyId" = ${companyId}
          AND "branchId" = ${branchId}
        ORDER BY code ASC
      `
    }
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, "companyId", "branchId", name, alias, "categoryId", category, price, cost, code, active, meta, "updatedAt"
      FROM "Product"
      WHERE "companyId" = ${companyId}
      ORDER BY code ASC
    `
  }

  async upsertProduct(product: Record<string, unknown>, companyId: string) {
    const branchId = product.branchId ? String(product.branchId) : null
    if (!branchId) throw new BadRequestException('branchId required')
    if (branchId) await assertBranchInCompany(this.prisma, branchId, companyId)
    const id = String(product.id)
    const code = String(product.code ?? '').trim()
    if (!code) throw new BadRequestException('Product code is required')
    const codeClash = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Product"
       WHERE "companyId" = $1
         AND "branchId" = $2
         AND LOWER(TRIM(code)) = LOWER($3)
         AND id <> $4
       LIMIT 1`,
      companyId,
      branchId,
      code,
      id,
    )
    if (codeClash.length) throw new ConflictException('Product code already exists')
    const data = {
      companyId,
      name: String(product.name ?? ''),
      alias: product.alias ? String(product.alias) : null,
      categoryId: String(product.categoryId ?? ''),
      category: String(product.category ?? ''),
      price: Number(product.price ?? 0),
      cost: Number(product.cost ?? 0),
      code,
      active: product.active !== false,
      branchId,
    }
    await this.prisma.product.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
    const existing = await this.prisma.product.findUnique({ where: { id } })
    const prevMeta =
      existing?.meta && typeof existing.meta === 'object' && !Array.isArray(existing.meta)
        ? ({ ...(existing.meta as Record<string, unknown>) } as Record<string, unknown>)
        : {}
    const hasImageKey = Object.prototype.hasOwnProperty.call(product, 'imageDataUrl')
    const hasRecipeKey = Object.prototype.hasOwnProperty.call(product, 'recipe')
    const hasCustomizerKey = Object.prototype.hasOwnProperty.call(product, 'customizer')
    const nextImage = hasImageKey
      ? product.imageDataUrl
        ? String(product.imageDataUrl)
        : undefined
      : prevMeta.imageDataUrl
        ? String(prevMeta.imageDataUrl)
        : undefined
    const nextRecipe = hasRecipeKey
      ? Array.isArray(product.recipe) && product.recipe.length
        ? product.recipe
        : undefined
      : Array.isArray(prevMeta.recipe) && (prevMeta.recipe as unknown[]).length
        ? prevMeta.recipe
        : undefined
    const nextCustomizer = hasCustomizerKey
      ? product.customizer && typeof product.customizer === 'object'
        ? product.customizer
        : undefined
      : prevMeta.customizer && typeof prevMeta.customizer === 'object'
        ? prevMeta.customizer
        : undefined
    const meta = {
      ...prevMeta,
      popular: product.popular === true,
      customizer: nextCustomizer,
      recipe: nextRecipe,
      unitId: product.unitId ? String(product.unitId) : prevMeta.unitId ? String(prevMeta.unitId) : undefined,
      vendorId: product.vendorId
        ? String(product.vendorId)
        : prevMeta.vendorId
          ? String(prevMeta.vendorId)
          : undefined,
      hsn: product.hsn != null ? String(product.hsn) : prevMeta.hsn ? String(prevMeta.hsn) : undefined,
      details:
        product.details != null
          ? String(product.details)
          : prevMeta.details
            ? String(prevMeta.details)
            : undefined,
      productType: product.productType
        ? String(product.productType)
        : prevMeta.productType
          ? String(prevMeta.productType)
          : undefined,
      taxIds: Array.isArray(product.taxIds)
        ? product.taxIds
        : Array.isArray(prevMeta.taxIds)
          ? prevMeta.taxIds
          : undefined,
      discountIds: Array.isArray(product.discountIds)
        ? product.discountIds
        : Array.isArray(prevMeta.discountIds)
          ? prevMeta.discountIds
          : undefined,
      imageDataUrl: nextImage,
    }
    if (!meta.recipe) delete meta.recipe
    if (!meta.customizer) delete meta.customizer
    if (!meta.imageDataUrl) delete meta.imageDataUrl
    await this.prisma.$executeRawUnsafe(
      `UPDATE "Product" SET "meta" = $1::jsonb WHERE "id" = $2 AND "companyId" = $3`,
      JSON.stringify(meta),
      id,
      companyId,
    )
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, "companyId", "branchId", name, alias, "categoryId", category, price, cost, code, active, meta, "updatedAt"
      FROM "Product"
      WHERE id = ${id} AND "companyId" = ${companyId}
      LIMIT 1
    `
    return rows[0]
  }

  async deleteProduct(id: string, companyId: string) {
    await this.prisma.product.deleteMany({ where: { id, companyId } })
    return { ok: true, id }
  }

  async listCustomers(companyId: string, branchId?: string) {
    if (branchId) await assertBranchInCompany(this.prisma, branchId, companyId)
    return this.prisma.customer.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { name: 'asc' },
    })
  }

  async upsertCustomer(input: Record<string, unknown>, companyId: string) {
    const id = String(input.id)
    const branchId = input.branchId ? String(input.branchId) : null
    if (!branchId) throw new BadRequestException('branchId required')
    await assertBranchInCompany(this.prisma, branchId, companyId)
    const data = {
      companyId,
      branchId,
      name: String(input.name ?? ''),
      phone: String(input.phone ?? ''),
      address: input.address ? String(input.address) : null,
      email: input.email ? String(input.email) : null,
      visits: Number(input.visits ?? 0),
      spent: Number(input.spent ?? 0),
      points: Number(input.points ?? 0),
    }
    return this.prisma.customer.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  listFoodVouchers(companyId: string) {
    return Promise.all([
      this.prisma.foodVoucherBatch.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.foodVoucherCode.findMany({
        where: { companyId },
        orderBy: { code: 'asc' },
      }),
    ]).then(([batches, codes]) => ({ batches, codes }))
  }

  async upsertFoodVoucherBatch(input: Record<string, unknown>, companyId: string) {
    const batchIn = (input.batch ?? input) as Record<string, unknown>
    const id = String(batchIn.id ?? '')
    if (!id) throw new BadRequestException('Batch id required')
    const data = {
      companyId,
      name: String(batchIn.name ?? ''),
      expiryDate: String(batchIn.expiryDate ?? ''),
      count: Number(batchIn.count ?? 0),
      amount: Number(batchIn.amount ?? 0),
      createdAt: batchIn.createdAt ? new Date(String(batchIn.createdAt)) : undefined,
    }
    const batch = await this.prisma.foodVoucherBatch.upsert({
      where: { id },
      create: {
        id,
        companyId: data.companyId,
        name: data.name,
        expiryDate: data.expiryDate,
        count: data.count,
        amount: data.amount,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      },
      update: {
        name: data.name,
        expiryDate: data.expiryDate,
        count: data.count,
        amount: data.amount,
      },
    })

    const codesIn = Array.isArray(input.codes) ? input.codes : []
    for (const raw of codesIn) {
      const row = raw as Record<string, unknown>
      const codeId = String(row.id ?? '')
      if (!codeId) continue
      const codeData = {
        companyId,
        batchId: id,
        name: String(row.name ?? data.name),
        code: String(row.code ?? ''),
        expiryDate: String(row.expiryDate ?? data.expiryDate),
        amount: Number(row.amount ?? data.amount),
        status: String(row.status ?? 'available'),
        usedAt: row.usedAt ? new Date(String(row.usedAt)) : null,
      }
      await this.prisma.foodVoucherCode.upsert({
        where: { id: codeId },
        create: { id: codeId, ...codeData },
        update: codeData,
      })
    }

    return batch
  }

  async deleteFoodVoucherBatch(id: string, companyId: string) {
    await this.prisma.foodVoucherBatch.deleteMany({ where: { id, companyId } })
    return { ok: true, id }
  }

  async redeemFoodVoucherCode(id: string, companyId: string) {
    const row = await this.prisma.foodVoucherCode.findFirst({ where: { id, companyId } })
    if (!row) throw new BadRequestException('Voucher not found')
    if (row.status !== 'available') throw new BadRequestException('Voucher already used')
    return this.prisma.foodVoucherCode.update({
      where: { id },
      data: { status: 'used', usedAt: new Date() },
    })
  }

  listVendors(companyId: string) {
    return Promise.all([
      this.prisma.vendor.findMany({
        where: { companyId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.vendorLedger.findMany({
        where: { companyId },
        orderBy: { date: 'asc' },
      }),
    ]).then(([vendors, ledger]) => ({ vendors, ledger }))
  }

  private normalizeVendorPhone(raw: string) {
    return raw.replace(/\D/g, '')
  }

  private async assertVendorUnique(
    companyId: string,
    excludeId: string,
    phone: string,
    phone2: string | null,
    email: string | null,
  ) {
    const minDigits = 7
    const normPhone = this.normalizeVendorPhone(phone)
    const normPhone2 = phone2 ? this.normalizeVendorPhone(phone2) : ''
    if (
      normPhone.length >= minDigits &&
      normPhone2.length >= minDigits &&
      normPhone === normPhone2
    ) {
      throw new ConflictException('Mobile 1 and Mobile 2 must be different')
    }

    const vendors = await this.prisma.vendor.findMany({
      where: { companyId },
      select: { id: true, name: true, phone: true, phone2: true, email: true },
    })

    for (const v of vendors) {
      if (v.id === excludeId) continue
      const existingPhone1 = this.normalizeVendorPhone(v.phone)
      const existingPhone2 = this.normalizeVendorPhone(v.phone2 ?? '')

      if (normPhone.length >= minDigits) {
        if (
          (existingPhone1.length >= minDigits && existingPhone1 === normPhone) ||
          (existingPhone2.length >= minDigits && existingPhone2 === normPhone)
        ) {
          throw new ConflictException(`Mobile number already used by “${v.name}”`)
        }
      }

      if (normPhone2.length >= minDigits) {
        if (
          (existingPhone1.length >= minDigits && existingPhone1 === normPhone2) ||
          (existingPhone2.length >= minDigits && existingPhone2 === normPhone2)
        ) {
          throw new ConflictException(`Mobile number already used by “${v.name}”`)
        }
      }

      if (email) {
        const existingEmail = (v.email ?? '').trim().toLowerCase()
        if (existingEmail && existingEmail === email) {
          throw new ConflictException(`Email already used by “${v.name}”`)
        }
      }
    }
  }

  async upsertVendor(input: Record<string, unknown>, companyId: string) {
    const id = String(input.id ?? '')
    if (!id) throw new BadRequestException('Vendor id required')
    const phone = String(input.phone ?? '').trim()
    const phone2Raw = input.phone2 ? String(input.phone2).trim() : ''
    const phone2 = phone2Raw || null
    const emailRaw = input.email ? String(input.email).trim() : ''
    const email = emailRaw ? emailRaw.toLowerCase() : null

    await this.assertVendorUnique(companyId, id, phone, phone2, email)

    const data = {
      companyId,
      name: String(input.name ?? ''),
      phone,
      phone2,
      email,
      taxId: input.taxId ? String(input.taxId) : null,
      address: input.address ? String(input.address) : null,
      city: String(input.city ?? ''),
      active: input.active !== false,
    }
    return this.prisma.vendor.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  async deleteVendor(id: string, companyId: string) {
    await this.prisma.vendor.deleteMany({ where: { id, companyId } })
    return { ok: true, id }
  }

  upsertVendorLedger(input: Record<string, unknown>, companyId: string) {
    const id = String(input.id ?? '')
    const vendorId = String(input.vendorId ?? input.supplierId ?? '')
    if (!id || !vendorId) throw new BadRequestException('Ledger id and vendor required')
    const data = {
      companyId,
      vendorId,
      date: String(input.date ?? new Date().toISOString().slice(0, 10)),
      description: String(input.description ?? ''),
      debit: Number(input.debit ?? 0),
      credit: Number(input.credit ?? 0),
      kind: String(input.kind ?? 'adjust'),
    }
    return this.prisma.vendorLedger.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  private async ensureDiscountRateTable() {
    await this.prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "DiscountRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscountRate_pkey" PRIMARY KEY ("id")
)`)
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "DiscountRate_companyId_idx" ON "DiscountRate"("companyId")`,
    )
    try {
      await this.prisma.$executeRawUnsafe(`
ALTER TABLE "DiscountRate"
  ADD CONSTRAINT "DiscountRate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE`)
    } catch {
      /* constraint may already exist */
    }
  }

  async listCatalog(companyId: string) {
    try {
      await this.ensureDiscountRateTable()
    } catch {
      /* ignore ensure failures; list still tries */
    }
    let discounts: Array<Record<string, unknown>> = []
    try {
      discounts = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM "DiscountRate" WHERE "companyId" = ${companyId} ORDER BY sort ASC, percent ASC
      `
    } catch {
      discounts = []
    }
    const [
      giftCards,
      taxes,
      units,
      paymentTypes,
      expenseTypes,
      expenseDetails,
      timetables,
      extraCharges,
      deliveryRiders,
      printStations,
    ] = await Promise.all([
        this.prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "GiftCard" WHERE "companyId" = ${companyId} ORDER BY "createdAt" DESC
        `,
        this.prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "TaxRate" WHERE "companyId" = ${companyId} ORDER BY name ASC
        `,
        this.prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "MeasureUnit" WHERE "companyId" = ${companyId} ORDER BY code ASC
        `,
        this.prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "PaymentType" WHERE "companyId" = ${companyId} ORDER BY sort ASC
        `,
        this.prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "ExpenseType" WHERE "companyId" = ${companyId} ORDER BY sort ASC
        `,
        this.prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "ExpenseDetail" WHERE "companyId" = ${companyId} ORDER BY date DESC
        `,
        this.prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "MenuTimetable" WHERE "companyId" = ${companyId} ORDER BY "createdAt" DESC
        `,
        this.prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "ExtraCharge" WHERE "companyId" = ${companyId} ORDER BY sort ASC
        `,
        this.prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "DeliveryRider" WHERE "companyId" = ${companyId} ORDER BY sort ASC
        `,
        this.prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "PrintStation" WHERE "companyId" = ${companyId} ORDER BY sort ASC
        `,
      ])
    return {
      giftCards,
      taxes,
      discounts,
      units,
      paymentTypes,
      expenseTypes,
      expenseDetails,
      timetables,
      extraCharges,
      deliveryRiders,
      printStations,
    }
  }

  async upsertCatalogRow(kind: string, input: Record<string, unknown>, companyId: string) {
    const id = String(input.id ?? '')
    if (!id) throw new BadRequestException('Id required')
    const now = new Date()
    switch (kind) {
      case 'giftCard':
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "GiftCard" (id, "companyId", number, "customerId", "customerName", phone, description, "expiryDate", "issueAmount", "extraCharges", "usedAmount", active, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (id) DO UPDATE SET
             number = EXCLUDED.number, "customerId" = EXCLUDED."customerId", "customerName" = EXCLUDED."customerName",
             phone = EXCLUDED.phone, description = EXCLUDED.description, "expiryDate" = EXCLUDED."expiryDate",
             "issueAmount" = EXCLUDED."issueAmount", "extraCharges" = EXCLUDED."extraCharges", "usedAmount" = EXCLUDED."usedAmount",
             active = EXCLUDED.active, "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          String(input.number ?? ''),
          input.customerId ? String(input.customerId) : null,
          String(input.customerName ?? ''),
          String(input.phone ?? ''),
          String(input.description ?? ''),
          String(input.expiryDate ?? ''),
          Number(input.issueAmount ?? 0),
          Number(input.extraCharges ?? 0),
          Number(input.usedAmount ?? 0),
          input.active !== false,
          input.createdAt ? new Date(String(input.createdAt)) : now,
          now,
        )
        break
      case 'tax':
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "TaxRate" (id, "companyId", name, percent, active, "isDefault", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, percent = EXCLUDED.percent, active = EXCLUDED.active,
             "isDefault" = EXCLUDED."isDefault", "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          String(input.name ?? ''),
          Number(input.percent ?? 0),
          input.active !== false,
          input.isDefault === true,
          now,
        )
        if (input.isDefault === true) {
          await this.prisma.$executeRawUnsafe(
            `UPDATE "TaxRate" SET "isDefault" = false WHERE "companyId" = $1 AND id <> $2`,
            companyId,
            id,
          )
        }
        break
      case 'discount':
        await this.ensureDiscountRateTable()
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "DiscountRate" (id, "companyId", name, percent, active, "isDefault", sort, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, percent = EXCLUDED.percent, active = EXCLUDED.active,
             "isDefault" = EXCLUDED."isDefault", sort = EXCLUDED.sort, "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          String(input.name ?? ''),
          Number(input.percent ?? 0),
          input.active !== false,
          input.isDefault === true,
          Number(input.sort ?? 0),
          now,
        )
        if (input.isDefault === true) {
          await this.prisma.$executeRawUnsafe(
            `UPDATE "DiscountRate" SET "isDefault" = false WHERE "companyId" = $1 AND id <> $2`,
            companyId,
            id,
          )
        }
        break
      case 'unit':
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "MeasureUnit" (id, "companyId", code, name, quantity, kind, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET
             code = EXCLUDED.code, name = EXCLUDED.name, quantity = EXCLUDED.quantity,
             kind = EXCLUDED.kind, "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          String(input.code ?? ''),
          String(input.name ?? ''),
          Number(input.quantity ?? 1),
          String(input.kind ?? 'generic'),
          now,
        )
        break
      case 'paymentType': {
        const payName = String(input.name ?? '').trim()
        if (!payName) throw new BadRequestException('Payment type name is required')
        const payClash = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM "PaymentType"
           WHERE "companyId" = $1 AND LOWER(TRIM(name)) = LOWER($2) AND id <> $3
           LIMIT 1`,
          companyId,
          payName,
          id,
        )
        if (payClash.length) throw new ConflictException('Payment type name already exists')
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "PaymentType" (id, "companyId", name, parent, active, sort, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, parent = EXCLUDED.parent, active = EXCLUDED.active,
             sort = EXCLUDED.sort, "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          payName,
          String(input.parent ?? 'other'),
          input.active !== false,
          Number(input.sort ?? 0),
          now,
        )
        break
      }
      case 'expenseType':
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "ExpenseType" (id, "companyId", name, description, active, sort, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, description = EXCLUDED.description, active = EXCLUDED.active,
             sort = EXCLUDED.sort, "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          String(input.name ?? ''),
          input.description ? String(input.description) : null,
          input.active !== false,
          Number(input.sort ?? 0),
          now,
        )
        break
      case 'expenseDetail':
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "ExpenseDetail" (id, "companyId", "branchId", "expenseTypeId", description, "invoiceNo", amount, date, "paymentTypeId", notes, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO UPDATE SET
             "branchId" = EXCLUDED."branchId", "expenseTypeId" = EXCLUDED."expenseTypeId", description = EXCLUDED.description,
             "invoiceNo" = EXCLUDED."invoiceNo", amount = EXCLUDED.amount, date = EXCLUDED.date,
             "paymentTypeId" = EXCLUDED."paymentTypeId", notes = EXCLUDED.notes, "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          input.branchId ? String(input.branchId) : null,
          String(input.expenseTypeId ?? ''),
          String(input.description ?? ''),
          input.invoiceNo ? String(input.invoiceNo) : null,
          Number(input.amount ?? 0),
          String(input.date ?? ''),
          input.paymentTypeId ? String(input.paymentTypeId) : null,
          input.notes ? String(input.notes) : null,
          now,
        )
        break
      case 'timetable':
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "MenuTimetable" (id, "companyId", "branchId", name, "validFrom", "validTo", "timeFrom", "timeTo", "departmentIds", "productIds", active, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)
           ON CONFLICT (id) DO UPDATE SET
             "branchId" = EXCLUDED."branchId", name = EXCLUDED.name, "validFrom" = EXCLUDED."validFrom", "validTo" = EXCLUDED."validTo",
             "timeFrom" = EXCLUDED."timeFrom", "timeTo" = EXCLUDED."timeTo",
             "departmentIds" = EXCLUDED."departmentIds", "productIds" = EXCLUDED."productIds",
             active = EXCLUDED.active, "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          input.branchId ? String(input.branchId) : null,
          String(input.name ?? ''),
          String(input.validFrom ?? ''),
          String(input.validTo ?? ''),
          String(input.timeFrom ?? ''),
          String(input.timeTo ?? ''),
          JSON.stringify(input.departmentIds ?? []),
          JSON.stringify(input.productIds ?? []),
          input.active !== false,
          input.createdAt ? new Date(String(input.createdAt)) : now,
          now,
        )
        break
      case 'extraCharge': {
        const branchId = String(input.branchId ?? '')
        if (!branchId) throw new BadRequestException('branchId required')
        await assertBranchInCompany(this.prisma, branchId, companyId)
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "ExtraCharge" (id, "companyId", "branchId", name, amount, percent, active, sort, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO UPDATE SET
             "branchId" = EXCLUDED."branchId", name = EXCLUDED.name, amount = EXCLUDED.amount,
             percent = EXCLUDED.percent, active = EXCLUDED.active, sort = EXCLUDED.sort,
             "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          branchId,
          String(input.name ?? ''),
          Number(input.amount ?? 0),
          input.percent === true,
          input.active !== false,
          Number(input.sort ?? 0),
          now,
        )
        break
      }
      case 'deliveryRider': {
        const branchId = String(input.branchId ?? '')
        if (!branchId) throw new BadRequestException('branchId required')
        await assertBranchInCompany(this.prisma, branchId, companyId)
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "DeliveryRider" (id, "companyId", "branchId", name, phone, active, sort, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET
             "branchId" = EXCLUDED."branchId", name = EXCLUDED.name, phone = EXCLUDED.phone,
             active = EXCLUDED.active, sort = EXCLUDED.sort, "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          branchId,
          String(input.name ?? ''),
          String(input.phone ?? ''),
          input.active !== false,
          Number(input.sort ?? 0),
          now,
        )
        break
      }
      case 'printStation': {
        const branchId = String(input.branchId ?? '')
        if (!branchId) throw new BadRequestException('branchId required')
        await assertBranchInCompany(this.prisma, branchId, companyId)
        const kind = String(input.kind ?? 'receipt') === 'kot' ? 'kot' : 'receipt'
        const templateRaw = String(input.templateId ?? (kind === 'kot' ? 'kitchen' : 'classic'))
        const allowed = [
          'classic',
          'compact',
          'bold',
          'brand',
          'bilingual',
          'minimal',
          'kitchen',
          'board',
        ]
        const templateId = allowed.includes(templateRaw)
          ? templateRaw
          : kind === 'kot'
            ? 'kitchen'
            : 'classic'
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "PrintStation" (id, "companyId", "branchId", kind, name, target, copies, "paperWidthMm", "templateId", "departmentId", header, footer, active, sort, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO UPDATE SET
             "branchId" = EXCLUDED."branchId", kind = EXCLUDED.kind, name = EXCLUDED.name, target = EXCLUDED.target,
             copies = EXCLUDED.copies, "paperWidthMm" = EXCLUDED."paperWidthMm", "templateId" = EXCLUDED."templateId",
             "departmentId" = EXCLUDED."departmentId",
             header = EXCLUDED.header, footer = EXCLUDED.footer, active = EXCLUDED.active, sort = EXCLUDED.sort,
             "updatedAt" = EXCLUDED."updatedAt"`,
          id,
          companyId,
          branchId,
          kind,
          String(input.name ?? ''),
          String(input.target ?? 'browser') || 'browser',
          Math.max(1, Number(input.copies ?? 1) || 1),
          Number(input.paperWidthMm ?? 80) || 80,
          templateId,
          input.departmentId ? String(input.departmentId) : null,
          String(input.header ?? ''),
          String(input.footer ?? ''),
          input.active !== false,
          Number(input.sort ?? 0),
          now,
        )
        break
      }
      default:
        throw new BadRequestException(`Unknown catalog kind ${kind}`)
    }
    return { ok: true, id, kind }
  }

  async deleteCatalogRow(kind: string, id: string, companyId: string) {
    const tables: Record<string, string> = {
      giftCard: 'GiftCard',
      tax: 'TaxRate',
      discount: 'DiscountRate',
      unit: 'MeasureUnit',
      paymentType: 'PaymentType',
      expenseType: 'ExpenseType',
      expenseDetail: 'ExpenseDetail',
      timetable: 'MenuTimetable',
      extraCharge: 'ExtraCharge',
      deliveryRider: 'DeliveryRider',
      printStation: 'PrintStation',
    }
    const table = tables[kind]
    if (!table) throw new BadRequestException(`Unknown catalog kind ${kind}`)
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE id = $1 AND "companyId" = $2`,
      id,
      companyId,
    )
    return { ok: true, id }
  }

  async redeemGiftCard(id: string, companyId: string, amount: number) {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; issueAmount: number; extraCharges: number; usedAmount: number }>
    >`
      SELECT id, "issueAmount", "extraCharges", "usedAmount"
      FROM "GiftCard"
      WHERE id = ${id} AND "companyId" = ${companyId}
      LIMIT 1
    `
    const row = rows[0]
    if (!row) throw new BadRequestException('Gift card not found')
    const bal = Math.max(0, row.issueAmount + row.extraCharges - row.usedAmount)
    const take = Math.min(Math.max(0, amount), bal)
    if (take <= 0) throw new BadRequestException('Nothing to redeem')
    const used = Math.round((row.usedAmount + take) * 100) / 100
    await this.prisma.$executeRawUnsafe(
      `UPDATE "GiftCard" SET "usedAmount" = $1, "updatedAt" = $2 WHERE id = $3 AND "companyId" = $4`,
      used,
      new Date(),
      id,
      companyId,
    )
    return { ok: true, id, remaining: Math.round((bal - take) * 100) / 100 }
  }

  async upsertCompany(body: Record<string, unknown>, companyId: string) {
    const existing = await this.getCompany(companyId)
    if (!existing) throw new BadRequestException('Company not found')
    const zatcaEnabled =
      body.zatcaEnabled === undefined
        ? Boolean((existing as { zatcaEnabled?: boolean }).zatcaEnabled)
        : body.zatcaEnabled === true
    const data = {
      companyName: String(body.companyName ?? existing.companyName),
      aliasName: body.aliasName ? String(body.aliasName) : null,
      taxId: body.taxId ? String(body.taxId) : null,
      enableTax: body.enableTax !== false,
      currency: String(body.currency ?? existing.currency),
      logoDataUrl:
        body.logoDataUrl === undefined
          ? existing.logoDataUrl
          : body.logoDataUrl
            ? String(body.logoDataUrl)
            : null,
      hqPhone: body.hqPhone ? String(body.hqPhone) : null,
    }
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data,
    })
    // Column added in 20260829120000; set via SQL so older Prisma clients still work mid-deploy.
    await this.prisma.$executeRaw`
      UPDATE "Company" SET "zatcaEnabled" = ${zatcaEnabled} WHERE id = ${companyId}
    `
    return { ...updated, zatcaEnabled }
  }

  listFloorTables(companyId: string, branchId?: string) {
    if (branchId) {
      return this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM "FloorTable"
        WHERE "companyId" = ${companyId} AND "branchId" = ${branchId}
        ORDER BY sort ASC, label ASC
      `
    }
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "FloorTable"
      WHERE "companyId" = ${companyId}
      ORDER BY sort ASC, label ASC
    `
  }

  async upsertFloorTable(input: Record<string, unknown>, companyId: string) {
    const id = String(input.id ?? '')
    const branchId = String(input.branchId ?? '')
    if (!id || !branchId) throw new BadRequestException('id and branchId required')
    await assertBranchInCompany(this.prisma, branchId, companyId)
    const now = new Date()
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "FloorTable" (id, "companyId", "branchId", label, seats, area, sort, active, "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         "branchId" = EXCLUDED."branchId", label = EXCLUDED.label, seats = EXCLUDED.seats,
         area = EXCLUDED.area, sort = EXCLUDED.sort, active = EXCLUDED.active, "updatedAt" = EXCLUDED."updatedAt"`,
      id,
      companyId,
      branchId,
      String(input.label ?? ''),
      Number(input.seats ?? 2),
      String(input.area ?? 'Main Hall'),
      Number(input.sort ?? 0),
      input.active !== false,
      now,
    )
    notifyMastersChanged('api')
    return { id }
  }

  async deleteFloorTable(id: string, companyId: string) {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "FloorTable" WHERE id = $1 AND "companyId" = $2`,
      id,
      companyId,
    )
    notifyMastersChanged('api')
    return { ok: true, id }
  }

  listStockItems(companyId: string, branchId?: string) {
    if (branchId) {
      return this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM "StockItem"
        WHERE "companyId" = ${companyId} AND "branchId" = ${branchId}
        ORDER BY name ASC
      `
    }
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "StockItem" WHERE "companyId" = ${companyId} ORDER BY name ASC
    `
  }

  private async ensureIngredientTable() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Ingredient" (
        id TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        name TEXT NOT NULL,
        sku TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT 'pcs',
        active BOOLEAN NOT NULL DEFAULT true,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "vendorId" TEXT`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS vendor TEXT`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "vendorLinks" JSONB`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "reorderAt" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "defaultLocationId" TEXT`,
    )
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Ingredient_companyId_idx" ON "Ingredient" ("companyId")`,
    )
  }

  private async ensureStockIngredientColumn() {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockItem" ADD COLUMN IF NOT EXISTS "ingredientId" TEXT`,
    )
  }

  private async ensureStockLocationColumn() {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockItem" ADD COLUMN IF NOT EXISTS "locationBalances" JSONB`,
    )
  }

  private async ensureStockTransferKindColumns() {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'location'`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'completed'`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "stockId" TEXT`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "fromLocation" TEXT`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "toLocation" TEXT`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "fromBranchId" TEXT`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "toBranchId" TEXT`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "fromBranchName" TEXT`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "toBranchName" TEXT`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "rawQty" DOUBLE PRECISION`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "outputQty" DOUBLE PRECISION`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "yieldRatio" DOUBLE PRECISION`,
    )
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3)`,
    )
  }

  async listIngredients(companyId: string) {
    await this.ensureIngredientTable()
    return this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "Ingredient" WHERE "companyId" = $1 ORDER BY name ASC`,
      companyId,
    )
  }

  async upsertIngredient(input: Record<string, unknown>, companyId: string) {
    await this.ensureIngredientTable()
    const id = String(input.id ?? '')
    if (!id) throw new BadRequestException('id required')
    const name = String(input.name ?? '').trim()
    if (!name) throw new BadRequestException('name required')
    const now = new Date()
    const vendorId = input.vendorId ? String(input.vendorId).trim() || null : null
    const vendor = input.vendor ? String(input.vendor).trim() || null : null
    const vendorLinks =
      input.vendorLinks != null && typeof input.vendorLinks === 'object'
        ? JSON.stringify(input.vendorLinks)
        : null
    const reorderAt =
      input.reorderAt != null && Number.isFinite(Number(input.reorderAt))
        ? Math.max(0, Number(input.reorderAt))
        : 0
    const defaultLocationId = input.defaultLocationId
      ? String(input.defaultLocationId).trim() || null
      : null
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "Ingredient" (id, "companyId", name, sku, category, unit, active, "vendorId", vendor, "vendorLinks", "reorderAt", "defaultLocationId", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, sku = EXCLUDED.sku, category = EXCLUDED.category,
         unit = EXCLUDED.unit, active = EXCLUDED.active,
         "vendorId" = EXCLUDED."vendorId", vendor = EXCLUDED.vendor,
         "vendorLinks" = EXCLUDED."vendorLinks", "reorderAt" = EXCLUDED."reorderAt",
         "defaultLocationId" = EXCLUDED."defaultLocationId",
         "updatedAt" = EXCLUDED."updatedAt"`,
      id,
      companyId,
      name,
      String(input.sku ?? ''),
      String(input.category ?? ''),
      String(input.unit ?? 'pcs'),
      input.active !== false,
      vendorId,
      vendor,
      vendorLinks,
      reorderAt,
      defaultLocationId,
      now,
    )
    notifyMastersChanged('api')
    return { id, name }
  }

  async deleteIngredient(companyId: string, id: string) {
    await this.ensureIngredientTable()
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "Ingredient" WHERE id = $1 AND "companyId" = $2`,
      id,
      companyId,
    )
    return { ok: true }
  }

  async upsertStockItem(input: Record<string, unknown>, companyId: string) {
    const id = String(input.id ?? '')
    if (!id) throw new BadRequestException('id required')
    const now = new Date()
    const statedOnHand =
      input.onHand != null && Number.isFinite(Number(input.onHand)) ? Number(input.onHand) : null
    const delta = input.delta != null && Number.isFinite(Number(input.delta)) ? Number(input.delta) : null
    let onHand = statedOnHand ?? 0
    if (statedOnHand == null && delta != null) {
      const rows = await this.prisma.$queryRaw<Array<{ onHand: number }>>`
        SELECT "onHand" FROM "StockItem" WHERE id = ${id} AND "companyId" = ${companyId} LIMIT 1
      `
      onHand = Math.max(0, Math.round(((rows[0]?.onHand ?? 0) + delta) * 100) / 100)
    }
    await this.ensureStockIngredientColumn()
    await this.ensureStockLocationColumn()
    const ingredientId = input.ingredientId ? String(input.ingredientId) : null
    const locationBalances =
      input.locationBalances != null ? JSON.stringify(input.locationBalances) : null
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "StockItem" (id, "companyId", "branchId", "ingredientId", name, sku, category, unit, "onHand", "locationBalances", "reorderAt", cost, "vendorId", vendor, "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         "ingredientId" = EXCLUDED."ingredientId", name = EXCLUDED.name, sku = EXCLUDED.sku, category = EXCLUDED.category, unit = EXCLUDED.unit,
         "onHand" = EXCLUDED."onHand", "locationBalances" = EXCLUDED."locationBalances", "reorderAt" = EXCLUDED."reorderAt", cost = EXCLUDED.cost,
         "vendorId" = EXCLUDED."vendorId", vendor = EXCLUDED.vendor, "updatedAt" = EXCLUDED."updatedAt"`,
      id,
      companyId,
      input.branchId ? String(input.branchId) : null,
      ingredientId,
      String(input.name ?? 'Item'),
      String(input.sku ?? ''),
      String(input.category ?? ''),
      String(input.unit ?? 'pcs'),
      onHand,
      locationBalances,
      Number(input.reorderAt ?? 0),
      Number(input.cost ?? 0),
      input.vendorId ? String(input.vendorId) : null,
      String(input.vendor ?? ''),
      now,
    )
    notifyMastersChanged('api')
    return { id, onHand }
  }

  listStockReceipts(companyId: string, branchId?: string) {
    return this.prisma.stockReceipt.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
  }

  async upsertStockReceipt(input: Record<string, unknown>, companyId: string) {
    const id = String(input.id ?? '')
    if (!id) throw new BadRequestException('id required')
    const branchId = String(input.branchId ?? '')
    if (!branchId) throw new BadRequestException('branchId required for receipt')
    await assertBranchInCompany(this.prisma, branchId, companyId)

    const createdAt = new Date(String(input.createdAt ?? Date.now()))
    const lines = (Array.isArray(input.lines) ? input.lines : []) as Prisma.InputJsonValue
    const data = {
      companyId,
      branchId,
      receiveNumber: String(input.receiveNumber ?? ''),
      receivingDate: String(input.receivingDate ?? ''),
      invoiceNumber: String(input.invoiceNumber ?? ''),
      invoiceDate: String(input.invoiceDate ?? ''),
      supplierId: String(input.supplierId ?? ''),
      receivingPerson: String(input.receivingPerson ?? ''),
      packingQty: Number(input.packingQty ?? 1),
      notes: input.notes ? String(input.notes) : null,
      lines,
      netAmount: Number(input.netAmount ?? 0),
      createdAt,
    }

    return this.prisma.stockReceipt.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  listPurchaseOrders(companyId: string, branchId?: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
  }

  async upsertPurchaseOrder(input: Record<string, unknown>, companyId: string) {
    const id = String(input.id ?? '')
    if (!id) throw new BadRequestException('id required')
    const branchId = String(input.branchId ?? '')
    if (!branchId) throw new BadRequestException('branchId required for purchase order')
    await assertBranchInCompany(this.prisma, branchId, companyId)

    const createdAt = new Date(String(input.createdAt ?? Date.now()))
    const lines = (Array.isArray(input.lines) ? input.lines : []) as Prisma.InputJsonValue
    const data = {
      companyId,
      branchId,
      supplierId: String(input.supplierId ?? ''),
      status: String(input.status ?? 'draft'),
      notes: input.notes ? String(input.notes) : null,
      lines,
      createdAt,
    }

    return this.prisma.purchaseOrder.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  async listStockTransfers(companyId: string, branchId?: string) {
    await this.ensureStockTransferKindColumns()
    return this.prisma.stockTransfer.findMany({
      where: {
        companyId,
        ...(branchId
          ? {
              OR: [{ branchId }, { toBranchId: branchId }, { fromBranchId: branchId }],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
  }

  async upsertStockTransfer(input: Record<string, unknown>, companyId: string) {
    const id = String(input.id ?? '')
    if (!id) throw new BadRequestException('id required')
    const branchId = String(input.branchId ?? '')
    if (!branchId) throw new BadRequestException('branchId required for stock transfer')
    await assertBranchInCompany(this.prisma, branchId, companyId)

    const createdAt = new Date(String(input.createdAt ?? Date.now()))
    await this.ensureStockTransferKindColumns()
    const kind = String(input.kind ?? 'location')
    const status =
      input.status != null
        ? String(input.status)
        : kind === 'branch'
          ? 'in_transit'
          : 'completed'
    const data = {
      companyId,
      branchId,
      kind,
      status,
      stockId: input.stockId ? String(input.stockId) : null,
      fromLocation: input.fromLocation ? String(input.fromLocation) : null,
      toLocation: input.toLocation ? String(input.toLocation) : null,
      fromBranchId: input.fromBranchId ? String(input.fromBranchId) : null,
      toBranchId: input.toBranchId ? String(input.toBranchId) : null,
      fromBranchName: input.fromBranchName ? String(input.fromBranchName) : null,
      toBranchName: input.toBranchName ? String(input.toBranchName) : null,
      fromStockId: String(input.fromStockId ?? ''),
      toStockId: String(input.toStockId ?? ''),
      fromName: String(input.fromName ?? ''),
      toName: String(input.toName ?? ''),
      fromSku: String(input.fromSku ?? ''),
      toSku: String(input.toSku ?? ''),
      qty: Number(input.qty ?? input.outputQty ?? 0),
      unit: String(input.unit ?? 'pcs'),
      rawQty: input.rawQty != null ? Number(input.rawQty) : null,
      outputQty: input.outputQty != null ? Number(input.outputQty) : null,
      yieldRatio: input.yieldRatio != null ? Number(input.yieldRatio) : null,
      note: input.note ? String(input.note) : null,
      staff: input.staff ? String(input.staff) : null,
      createdAt,
      receivedAt: input.receivedAt ? new Date(String(input.receivedAt)) : null,
    }

    return this.prisma.stockTransfer.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }
}

export type JsonValue = Prisma.InputJsonValue
export { companyIdForBranch }
