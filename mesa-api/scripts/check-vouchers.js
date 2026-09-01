const { PrismaClient } = require('@prisma/client')

async function check(label, url) {
  const p = new PrismaClient(url ? { datasources: { db: { url } } } : undefined)
  try {
    const batches = await p.foodVoucherBatch.findMany({ take: 10 })
    const codes = await p.foodVoucherCode.count()
    console.log(label, 'batches=', batches.length, 'codes=', codes)
    for (const b of batches) console.log(' -', b.id, b.name, b.count, b.amount)
  } catch (e) {
    console.log(label, 'ERR', String(e.message || e).slice(0, 200))
  } finally {
    await p.$disconnect()
  }
}

async function main() {
  await check('primary')
  const control = new PrismaClient()
  let regs = []
  try {
    regs = await control.tenantRegistry.findMany()
    console.log('tenants', regs.length)
  } finally {
    await control.$disconnect()
  }
  for (const r of regs) {
    await check(r.databaseName, r.databaseUrl)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
