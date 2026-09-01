const { PrismaClient } = require('@prisma/client')

async function main() {
  const primary = new PrismaClient()
  const tenantUrl = 'postgresql://mesa:mesa@localhost:5432/mesa_t_co_mesa_restaurant'
  const tenant = new PrismaClient({ datasources: { db: { url: tenantUrl } } })
  try {
    const pCompanies = await primary.company.findMany({ select: { id: true, companyName: true, taxId: true } })
    const tCompanies = await tenant.company.findMany({ select: { id: true, companyName: true, taxId: true } })
    console.log('primary companies', pCompanies)
    console.log('tenant companies', tCompanies)
    console.log('primary vouchers', await primary.foodVoucherBatch.count())
    console.log('tenant vouchers', await tenant.foodVoucherBatch.count())
    console.log('primary products', await primary.product.count())
    console.log('tenant products', await tenant.product.count())
  } finally {
    await primary.$disconnect()
    await tenant.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
