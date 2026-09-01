import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import type { Prisma, PrismaClient } from '@prisma/client'
import { InjectPrisma, PrismaService } from './prisma.service'
import { systemRoleTemplates } from './modules/access/roleTemplates'

const COMPANY_ID = 'co-mesa'
const BRANCH_RYD = 'br-ryd-01'
const BRANCH_JED = 'br-jed-01'

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly log = new Logger(SeedService.name)

  constructor(@InjectPrisma() private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.SEED_DEMO === '0' || process.env.SEED_DEMO === 'false') {
      this.log.log('SEED_DEMO disabled — skipping demo company seed')
      return
    }
    await this.ensureSeed()
  }

  /**
   * Seed a newly registered company's database (menu, floor, stock, payment types, VAT).
   * Company / branch / admin / roles are already created by DevService.register.
   */
  async seedTenant(
    db: PrismaClient,
    opts: { companyId: string; branchIds: string[] },
  ) {
    const { companyId, branchIds } = opts
    if (!branchIds.length) return
    await this.seedPaymentTypes(db, companyId)
    await this.seedTaxRates(db, companyId)
    await this.seedMenu(db, companyId, branchIds)
    await this.seedFloor(db, companyId, branchIds)
    await this.seedStock(db, companyId, branchIds)
    this.log.log(
      `Tenant seed ready · ${companyId} · branches=${branchIds.join(',')} · menu/floor/stock/payments/tax`,
    )
  }

  private async ensureSeed() {
    const company = await this.prisma.company.upsert({
      where: { id: COMPANY_ID },
      update: {},
      create: {
        id: COMPANY_ID,
        companyName: 'Mesa Restaurant',
        aliasName: 'ميسا للمطاعم',
        taxId: '300000000000003',
        enableTax: true,
        currency: 'Saudi Arabia · SAR',
        hqPhone: '+966 11 000 0000',
      },
    })

    await this.prisma.branch.upsert({
      where: { id: BRANCH_RYD },
      update: {},
      create: {
        id: BRANCH_RYD,
        companyId: company.id,
        name: 'Riyadh Main',
        nameAr: 'فرع الرياض الرئيسي',
        code: 'RYD-01',
        address: 'Olaya Street, Riyadh',
        addressAr: 'شارع العليا، الرياض',
        phone: '+966 11 000 0000',
        active: true,
      },
    })

    await this.prisma.branch.upsert({
      where: { id: BRANCH_JED },
      update: {},
      create: {
        id: BRANCH_JED,
        companyId: company.id,
        name: 'Jeddah Corniche',
        nameAr: 'فرع جدة الكورنيش',
        code: 'JED-01',
        address: 'Corniche Road, Jeddah',
        addressAr: 'طريق الكورنيش، جدة',
        phone: '+966 12 000 0000',
        active: true,
      },
    })

    const users: Array<{
      id: string
      username: string
      pin: string
      name: string
      role: string
      branchId?: string
    }> = [
      { id: 'u-admin', username: 'admin', pin: '0000', name: 'Admin', role: 'admin' },
      {
        id: 'u-cash',
        username: 'cashier',
        pin: '1111',
        name: 'Cashier',
        role: 'cashier',
        branchId: BRANCH_RYD,
      },
      {
        id: 'u-server',
        username: 'server',
        pin: '2222',
        name: 'Food Server',
        role: 'food-server',
        branchId: BRANCH_RYD,
      },
      {
        id: 'u-kitchen',
        username: 'kitchen',
        pin: '3333',
        name: 'Kitchen',
        role: 'kitchen-manager',
        branchId: BRANCH_RYD,
      },
    ]

    for (const u of users) {
      const pinHash = await bcrypt.hash(u.pin, 8)
      await this.prisma.user.upsert({
        where: { companyId_username: { companyId: COMPANY_ID, username: u.username } },
        update: {
          name: u.name,
          role: u.role,
          branchId: u.branchId,
          companyId: COMPANY_ID,
          pinHash,
        },
        create: {
          id: u.id,
          username: u.username,
          pinHash,
          name: u.name,
          role: u.role,
          branchId: u.branchId,
          companyId: COMPANY_ID,
          active: true,
        },
      })
    }

    await this.prisma.role.createMany({
      data: systemRoleTemplates.map((row) => ({
        companyId: COMPANY_ID,
        key: row.key,
        name: row.name,
        nameAr: row.nameAr,
        system: true,
        privileges: row.privileges as unknown as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    })

    await this.resetUnscopedCatalog()
    await this.seedTenant(this.prisma, {
      companyId: COMPANY_ID,
      branchIds: [...BRANCHES],
    })

    this.log.log('Seed ready · company, branches, staff, roles, branch-scoped menu')
  }

  private async seedPaymentTypes(db: PrismaClient, companyId: string) {
    const existing = await db.paymentType.count({ where: { companyId } })
    if (existing > 0) return
    const rows = [
      { id: 'ksa-pay-cash', name: 'Cash', parent: 'cash', sort: 1 },
      { id: 'ksa-pay-mada', name: 'mada', parent: 'card', sort: 2 },
      { id: 'ksa-pay-visa', name: 'Visa / Mastercard', parent: 'card', sort: 3 },
      { id: 'ksa-pay-apple', name: 'Apple Pay', parent: 'card', sort: 4 },
      { id: 'ksa-pay-stc', name: 'STC Pay', parent: 'online', sort: 5 },
      { id: 'ksa-pay-hungerstation', name: 'HungerStation', parent: 'online', sort: 6 },
      { id: 'ksa-pay-jahez', name: 'Jahez', parent: 'online', sort: 7 },
      { id: 'ksa-pay-keeta', name: 'Keeta', parent: 'online', sort: 8 },
    ] as const
    for (const row of rows) {
      await db.paymentType.upsert({
        where: { id: row.id },
        update: {
          name: row.name,
          parent: row.parent,
          sort: row.sort,
          active: true,
          companyId,
        },
        create: {
          id: row.id,
          companyId,
          name: row.name,
          parent: row.parent,
          sort: row.sort,
          active: true,
        },
      })
    }
  }

  private async seedTaxRates(db: PrismaClient, companyId: string) {
    const existing = await db.taxRate.count({ where: { companyId } })
    if (existing > 0) return
    await db.taxRate.createMany({
      data: [
        {
          id: `tax-vat__${companyId}`,
          companyId,
          name: 'VAT 15%',
          percent: 15,
          active: true,
          isDefault: true,
        },
        {
          id: `tax-zero__${companyId}`,
          companyId,
          name: 'Zero rated',
          percent: 0,
          active: true,
          isDefault: false,
        },
      ],
      skipDuplicates: true,
    })
  }

  /** One-shot: old seed wrote catalog with branchId NULL, so every till saw every dish. */
  private async resetUnscopedCatalog() {
    const unscopedCats = await this.prisma.category.count({
      where: { companyId: COMPANY_ID, branchId: null },
    })
    const unscopedProds = await this.prisma.product.count({
      where: { companyId: COMPANY_ID, branchId: null },
    })
    const legacyIds = await this.prisma.category.count({
      where: { companyId: COMPANY_ID, id: { in: MENU_CATEGORIES.map((c) => c.id) } },
    })
    if (unscopedCats || unscopedProds || legacyIds) {
      this.log.warn(
        `Unscoped catalog (${unscopedCats} categories, ${unscopedProds} products, ${legacyIds} legacy ids) — wiping operational data`,
      )
      await this.prisma.syncOp.deleteMany({ where: { companyId: COMPANY_ID } })
      await this.prisma.ticket.deleteMany({ where: { companyId: COMPANY_ID } })
      await this.prisma.dayClose.deleteMany({ where: { companyId: COMPANY_ID } })
      await this.prisma.product.deleteMany({ where: { companyId: COMPANY_ID } })
      await this.prisma.category.deleteMany({ where: { companyId: COMPANY_ID } })
      await this.prisma.floorTable.deleteMany({ where: { companyId: COMPANY_ID } })
      await this.prisma.stockItem.deleteMany({ where: { companyId: COMPANY_ID } })
    }

    await this.prisma.category.deleteMany({
      where: { companyId: COMPANY_ID, id: { in: MENU_CATEGORIES.map((c) => c.id) } },
    })
    await this.prisma.product.deleteMany({
      where: { companyId: COMPANY_ID, id: { in: MENU_PRODUCTS.map((p) => p.id) } },
    })
    await this.prisma.floorTable.deleteMany({
      where: { companyId: COMPANY_ID, id: { in: FLOOR_TABLES.map((t) => t.id) } },
    })
    await this.prisma.stockItem.deleteMany({
      where: { companyId: COMPANY_ID, id: { in: STOCK_ITEMS.map((s) => s.id) } },
    })
  }

  private scoped(baseId: string, branchId: string) {
    return `${baseId}__${branchId}`
  }

  private async seedMenu(db: PrismaClient, companyId: string, branchIds: string[]) {
    for (const branchId of branchIds) {
      for (const cat of MENU_CATEGORIES) {
        const id = this.scoped(cat.id, branchId)
        const parentId = cat.parentId ? this.scoped(cat.parentId, branchId) : null
        await db.category.upsert({
          where: { id },
          update: {
            name: cat.name,
            alias: cat.alias,
            sort: cat.sort,
            parentId,
            branchId,
          },
          create: {
            id,
            companyId,
            branchId,
            name: cat.name,
            alias: cat.alias,
            sort: cat.sort,
            parentId,
            active: true,
          },
        })
      }

      for (const p of MENU_PRODUCTS) {
        const id = this.scoped(p.id, branchId)
        const categoryId = this.scoped(p.categoryId, branchId)
        await db.product.upsert({
          where: { id },
          update: {
            name: p.name,
            alias: p.alias,
            categoryId,
            category: p.category,
            price: p.price,
            cost: p.cost,
            code: p.code,
            active: true,
            branchId,
          },
          create: {
            id,
            companyId,
            branchId,
            name: p.name,
            alias: p.alias,
            categoryId,
            category: p.category,
            price: p.price,
            cost: p.cost,
            code: p.code,
            active: true,
          },
        })
        await db.$executeRawUnsafe(
          `UPDATE "Product" SET "meta" = $1::jsonb WHERE "id" = $2 AND "companyId" = $3`,
          JSON.stringify({ popular: p.popular === true }),
          id,
          companyId,
        )
      }
    }
  }

  private async seedFloor(db: PrismaClient, companyId: string, branchIds: string[]) {
    for (const branchId of branchIds) {
      for (const [sort, t] of FLOOR_TABLES.entries()) {
        const id = this.scoped(t.id, branchId)
        await db.floorTable.upsert({
          where: { id },
          update: { label: t.label, seats: t.seats, area: t.area, sort, branchId, active: true },
          create: {
            id,
            companyId,
            branchId,
            label: t.label,
            seats: t.seats,
            area: t.area,
            sort,
            active: true,
          },
        })
      }
    }
  }

  private async seedStock(db: PrismaClient, companyId: string, branchIds: string[]) {
    for (const branchId of branchIds) {
      for (const s of STOCK_ITEMS) {
        const id = this.scoped(s.id, branchId)
        await db.stockItem.upsert({
          where: { id },
          update: {
            name: s.name,
            sku: s.sku,
            category: s.category,
            unit: s.unit,
            onHand: s.onHand,
            reorderAt: s.reorderAt,
            cost: s.cost,
            branchId,
          },
          create: {
            id,
            companyId,
            branchId,
            name: s.name,
            sku: s.sku,
            category: s.category,
            unit: s.unit,
            onHand: s.onHand,
            reorderAt: s.reorderAt,
            cost: s.cost,
          },
        })
      }
    }
  }
}

const BRANCHES = [BRANCH_RYD, BRANCH_JED] as const

const MENU_CATEGORIES: Array<{
  id: string
  name: string
  alias: string
  sort: number
  parentId?: string
}> = [
  { id: 'dept-food', name: 'Food', alias: 'الطعام', sort: 1 },
  { id: 'dept-pizza', name: 'Pizza', alias: 'البيتزا', sort: 2 },
  { id: 'dept-beverages', name: 'Beverages', alias: 'المشروبات', sort: 3 },
  { id: 'dept-desserts', name: 'Desserts', alias: 'الحلويات', sort: 4 },
  { id: 'sub-starters', name: 'Starters', alias: 'المقبلات', sort: 1, parentId: 'dept-food' },
  { id: 'sub-mains', name: 'Mains', alias: 'الأطباق الرئيسية', sort: 2, parentId: 'dept-food' },
  { id: 'sub-grill', name: 'Grill', alias: 'المشويات', sort: 3, parentId: 'dept-food' },
  { id: 'sub-sides', name: 'Sides', alias: 'الجانبية', sort: 4, parentId: 'dept-food' },
  { id: 'sub-pizza-classic', name: 'Classic', alias: 'كلاسيك', sort: 1, parentId: 'dept-pizza' },
  { id: 'sub-cold', name: 'Cold Drinks', alias: 'باردة', sort: 1, parentId: 'dept-beverages' },
  { id: 'sub-hot', name: 'Hot Drinks', alias: 'ساخنة', sort: 2, parentId: 'dept-beverages' },
  { id: 'sub-sweets', name: 'Sweets', alias: 'حلويات', sort: 1, parentId: 'dept-desserts' },
]

const MENU_PRODUCTS: Array<{
  id: string
  code: string
  name: string
  alias: string
  categoryId: string
  category: string
  price: number
  cost: number
  popular?: boolean
}> = [
  { id: 'p-hummus', code: '101', name: 'Hummus', alias: 'حمص', categoryId: 'sub-starters', category: 'Starters', price: 18, cost: 6, popular: true },
  { id: 'p-mutabbal', code: '102', name: 'Mutabbal', alias: 'متبل', categoryId: 'sub-starters', category: 'Starters', price: 18, cost: 6 },
  { id: 'p-fattoush', code: '103', name: 'Fattoush', alias: 'فتوش', categoryId: 'sub-starters', category: 'Starters', price: 22, cost: 7, popular: true },
  { id: 'p-kabsa', code: '201', name: 'Chicken Kabsa', alias: 'كبسة دجاج', categoryId: 'sub-mains', category: 'Mains', price: 42, cost: 16, popular: true },
  { id: 'p-mandi', code: '202', name: 'Lamb Mandi', alias: 'مندي لحم', categoryId: 'sub-mains', category: 'Mains', price: 58, cost: 24 },
  { id: 'p-mixed-grill', code: '301', name: 'Mixed Grill', alias: 'مشويات مشكلة', categoryId: 'sub-grill', category: 'Grill', price: 72, cost: 28, popular: true },
  { id: 'p-shish', code: '302', name: 'Shish Tawook', alias: 'شيش طاووق', categoryId: 'sub-grill', category: 'Grill', price: 38, cost: 14 },
  { id: 'p-fries', code: '401', name: 'Fries', alias: 'بطاطس', categoryId: 'sub-sides', category: 'Sides', price: 12, cost: 3, popular: true },
  { id: 'p-bread', code: '402', name: 'Arabic Bread', alias: 'خبز عربي', categoryId: 'sub-sides', category: 'Sides', price: 4, cost: 1 },
  { id: 'p-margherita', code: '501', name: 'Margherita', alias: 'مارغريتا', categoryId: 'sub-pizza-classic', category: 'Classic', price: 39, cost: 12, popular: true },
  { id: 'p-pepperoni', code: '502', name: 'Pepperoni', alias: 'بيبروني', categoryId: 'sub-pizza-classic', category: 'Classic', price: 45, cost: 15 },
  { id: 'p-lemonade', code: '601', name: 'House Lemonade', alias: 'ليمونادة', categoryId: 'sub-cold', category: 'Cold Drinks', price: 14, cost: 3, popular: true },
  { id: 'p-orange', code: '602', name: 'Fresh Orange Juice', alias: 'عصير برتقال', categoryId: 'sub-cold', category: 'Cold Drinks', price: 16, cost: 5 },
  { id: 'p-qahwa', code: '701', name: 'Arabic Qahwa', alias: 'قهوة عربية', categoryId: 'sub-hot', category: 'Hot Drinks', price: 12, cost: 3, popular: true },
  { id: 'p-cappuccino', code: '702', name: 'Cappuccino', alias: 'كابتشينو', categoryId: 'sub-hot', category: 'Hot Drinks', price: 16, cost: 4 },
  { id: 'p-umm-ali', code: '801', name: 'Umm Ali', alias: 'أم علي', categoryId: 'sub-sweets', category: 'Sweets', price: 22, cost: 7, popular: true },
  { id: 'p-kunafa', code: '802', name: 'Kunafa', alias: 'كنافة', categoryId: 'sub-sweets', category: 'Sweets', price: 28, cost: 9 },
]

const FLOOR_TABLES: Array<{ id: string; label: string; seats: number; area: string }> = [
  { id: 't1', label: '01', seats: 2, area: 'Main Hall' },
  { id: 't2', label: '02', seats: 2, area: 'Main Hall' },
  { id: 't3', label: '03', seats: 4, area: 'Main Hall' },
  { id: 't4', label: '04', seats: 4, area: 'Main Hall' },
  { id: 't5', label: '05', seats: 6, area: 'Family Section' },
  { id: 't6', label: '06', seats: 2, area: 'Family Section' },
  { id: 't7', label: '07', seats: 4, area: 'Outdoor' },
  { id: 't8', label: '08', seats: 8, area: 'Outdoor' },
  { id: 't9', label: '09', seats: 2, area: 'Private' },
  { id: 't10', label: '10', seats: 4, area: 'Private' },
  { id: 't11', label: '11', seats: 4, area: 'Private' },
  { id: 't12', label: '12', seats: 6, area: 'Family Section' },
]

const STOCK_ITEMS: Array<{
  id: string
  name: string
  sku: string
  category: string
  unit: string
  onHand: number
  reorderAt: number
  cost: number
}> = [
  { id: 's1', name: 'Ribeye Steak', sku: 'MEAT-RIB-300', category: 'Meat', unit: 'kg', onHand: 8.4, reorderAt: 10, cost: 18.2 },
  { id: 's2', name: 'Chicken Breast', sku: 'MEAT-CHK-BR', category: 'Meat', unit: 'kg', onHand: 22.0, reorderAt: 12, cost: 6.4 },
  { id: 's3', name: 'Arborio Rice', sku: 'DRY-ARB-1', category: 'Dry Goods', unit: 'kg', onHand: 4.2, reorderAt: 6, cost: 3.1 },
  { id: 's4', name: 'Tomatoes', sku: 'PRD-TOM', category: 'Produce', unit: 'kg', onHand: 14.5, reorderAt: 8, cost: 2.4 },
  { id: 's5', name: 'Burrata', sku: 'DRY-BUR', category: 'Dairy', unit: 'pcs', onHand: 6, reorderAt: 12, cost: 2.8 },
  { id: 's6', name: 'Lemonade Base', sku: 'BEV-LEM', category: 'Beverage', unit: 'L', onHand: 18, reorderAt: 10, cost: 1.9 },
  { id: 's7', name: 'Espresso Beans', sku: 'BEV-ESP', category: 'Beverage', unit: 'kg', onHand: 2.1, reorderAt: 3, cost: 14.0 },
  { id: 's8', name: 'Chocolate', sku: 'DRY-CHO', category: 'Dry Goods', unit: 'kg', onHand: 1.4, reorderAt: 2, cost: 9.5 },
  { id: 's9', name: 'Olive Oil', sku: 'DRY-OIL', category: 'Dry Goods', unit: 'L', onHand: 9.0, reorderAt: 4, cost: 7.2 },
  { id: 's10', name: 'Sea Bass', sku: 'SEA-BAS', category: 'Seafood', unit: 'kg', onHand: 3.6, reorderAt: 5, cost: 16.8 },
]
