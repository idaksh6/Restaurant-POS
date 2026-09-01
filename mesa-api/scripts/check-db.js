const { PrismaClient } = require('@prisma/client')

async function main() {
  const p = new PrismaClient()
  const cols = await p.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'User' ORDER BY 1`,
  )
  console.log('User columns:', cols)
  const regs = await p.tenantRegistry.findMany()
  console.log('Registries:', regs)
  const cos = await p.company.findMany()
  console.log('Companies:', cos)
  await p.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
