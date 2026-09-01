const { PrismaClient } = require('@prisma/client')

async function main() {
  const url =
    process.env.DATABASE_ADMIN_URL || 'postgresql://mesa:mesa@localhost:5432/postgres'
  const p = new PrismaClient({ datasources: { db: { url } } })
  try {
    await p.$executeRawUnsafe('ALTER USER mesa WITH CREATEDB')
    console.log('CREATEDB granted to role mesa')
  } finally {
    await p.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
