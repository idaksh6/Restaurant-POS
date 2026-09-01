const { PrismaClient } = require('@prisma/client')

async function main() {
  const admin = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_ADMIN_URL || 'postgresql://mesa:mesa@localhost:5432/postgres' },
    },
  })
  const dbs = await admin.$queryRawUnsafe(
    `SELECT datname FROM pg_database WHERE datname LIKE 'mesa_t_%'`,
  )
  console.log('orphan tenants:', dbs)
  for (const { datname } of dbs) {
    await admin.$executeRawUnsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      datname,
    )
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${datname}"`)
    console.log('dropped', datname)
  }
  const control = new PrismaClient()
  const regs = await control.tenantRegistry.findMany()
  console.log('registries:', regs)
  await control.$disconnect()
  await admin.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
