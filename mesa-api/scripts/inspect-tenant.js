const { PrismaClient } = require('@prisma/client')

async function main() {
  const url = 'postgresql://mesa:mesa@localhost:5432/mesa_t_co_mesa_restaurant'
  const p = new PrismaClient({ datasources: { db: { url } } })
  const tables = await p.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
  )
  console.log(
    'tables:',
    tables.map((t) => t.tablename).join(', '),
  )
  try {
    const migs = await p.$queryRawUnsafe(
      `SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at`,
    )
    console.log('migrations:', migs.length)
    console.log(migs.map((m) => m.migration_name).join('\n'))
  } catch (e) {
    console.log('no _prisma_migrations', e.message)
  }
  await p.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
