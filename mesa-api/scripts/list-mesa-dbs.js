const { PrismaClient } = require('@prisma/client')

async function main() {
  const p = new PrismaClient()
  try {
    const dbs = await p.$queryRawUnsafe(
      `SELECT datname FROM pg_database WHERE datname LIKE 'mesa%' ORDER BY 1`,
    )
    console.log('dbs', dbs)
    const regs = await p.tenantRegistry.findMany().catch((e) => {
      console.log('registry err', e.message)
      return []
    })
    console.log('registry', regs)
  } finally {
    await p.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
