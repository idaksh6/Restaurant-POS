const { PrismaClient } = require('@prisma/client')

async function main() {
  const p = new PrismaClient()
  const deleted = await p.tenantRegistry.deleteMany({})
  console.log('cleared registries:', deleted.count)
  await p.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
