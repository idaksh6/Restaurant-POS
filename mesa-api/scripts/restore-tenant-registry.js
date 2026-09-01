/**
 * Re-link co-mesa-restaurant to its dedicated tenant database.
 * Safe to re-run (upsert).
 */
const { PrismaClient } = require('@prisma/client')

async function main() {
  const primary = new PrismaClient()
  const tenantUrl = 'postgresql://mesa:mesa@localhost:5432/mesa_t_co_mesa_restaurant'
  const companyId = 'co-mesa-restaurant'
  try {
    const company = await primary.company.findUnique({ where: { id: companyId } })
    if (!company) {
      console.log('Company missing on primary — abort')
      return
    }
    await primary.tenantRegistry.upsert({
      where: { id: companyId },
      create: {
        id: companyId,
        taxId: company.taxId || companyId,
        companyName: company.companyName,
        databaseName: 'mesa_t_co_mesa_restaurant',
        databaseUrl: tenantUrl,
      },
      update: {
        taxId: company.taxId || companyId,
        companyName: company.companyName,
        databaseName: 'mesa_t_co_mesa_restaurant',
        databaseUrl: tenantUrl,
      },
    })
    console.log('Registry restored → mesa_t_co_mesa_restaurant')
    const row = await primary.tenantRegistry.findUnique({ where: { id: companyId } })
    console.log(row)
  } finally {
    await primary.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
