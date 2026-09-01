const { PrismaClient } = require('@prisma/client')

async function main() {
  const p = new PrismaClient()
  try {
    const info = await p.$queryRawUnsafe(`
      SELECT current_database() AS db,
             current_user AS usr,
             current_schema() AS schema,
             inet_server_addr()::text AS host,
             inet_server_port() AS port
    `)
    console.log('conn', info)
    const tables = await p.$queryRawUnsafe(`
      SELECT n.nspname AS schema, c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND c.relname ILIKE '%discount%'
    `)
    console.log('tables', tables)
    const cols = await p.$queryRawUnsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'DiscountRate'
      ORDER BY ordinal_position
    `)
    console.log('cols', cols)
  } finally {
    await p.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
