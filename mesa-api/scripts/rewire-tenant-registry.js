/**
 * Point every TenantRegistry row at databases on the current DATABASE_URL host.
 * Use after migrating from Supabase (or any remote Postgres) to localhost.
 */
const { PrismaClient } = require('@prisma/client')

function withDatabaseName(baseUrl, databaseName) {
  const url = new URL(baseUrl)
  url.pathname = `/${databaseName}`
  return url.toString()
}

function primaryDbName(baseUrl) {
  try {
    return new URL(baseUrl).pathname.replace(/^\//, '') || 'mesa'
  } catch {
    return 'mesa'
  }
}

async function main() {
  const primaryUrl = process.env.DATABASE_URL
  if (!primaryUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const control = new PrismaClient()
  const mainDb = primaryDbName(primaryUrl)

  try {
    const rows = await control.tenantRegistry.findMany()
    console.log(`TenantRegistry: ${rows.length} row(s)`)

    for (const row of rows) {
      const dbName = row.databaseName?.trim()
      let nextUrl = primaryUrl
      if (dbName && dbName !== mainDb) {
        nextUrl = withDatabaseName(primaryUrl, dbName)
      }
      if (row.databaseUrl === nextUrl) {
        console.log(`  ok · ${row.id} · ${dbName}`)
        continue
      }
      await control.tenantRegistry.update({
        where: { id: row.id },
        data: { databaseUrl: nextUrl },
      })
      console.log(`  updated · ${row.id} · ${dbName}`)
      console.log(`    → ${nextUrl.replace(/:([^:@/]+)@/, ':***@')}`)
    }
  } finally {
    await control.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
