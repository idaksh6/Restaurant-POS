const { PrismaClient } = require('@prisma/client')

async function main() {
  const url = 'postgresql://mesa:mesa@localhost:5432/mesa_t_co_mesa_restaurant'
  const p = new PrismaClient({ datasources: { db: { url } } })
  try {
    const batches = await p.foodVoucherBatch.findMany()
    const codes = await p.foodVoucherCode.count()
    console.log('tenant vouchers batches=', batches.length, 'codes=', codes)
    console.log(JSON.stringify(batches, null, 2))
    const companies = await p.company.findMany({ select: { id: true, companyName: true } })
    console.log('companies', companies)
  } catch (e) {
    console.log('ERR', e.message)
  } finally {
    await p.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
