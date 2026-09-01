/**
 * Wipe all Mesa databases so you can re-test company registration from scratch.
 * - Drops every mesa_t_* tenant database
 * - Recreates empty primary `mesa` and applies migrations
 */
const { PrismaClient } = require('@prisma/client')
const { execFileSync } = require('child_process')
const path = require('path')

const ADMIN =
  process.env.DATABASE_ADMIN_URL || 'postgresql://mesa:mesa@localhost:5432/postgres'
const PRIMARY = process.env.DATABASE_URL || 'postgresql://mesa:mesa@localhost:5432/mesa'

async function main() {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN } } })
  try {
    const dbs = await admin.$queryRawUnsafe(
      `SELECT datname FROM pg_database WHERE datname = 'mesa' OR datname LIKE 'mesa_t_%'`,
    )
    console.log(
      'Found databases:',
      dbs.map((d) => d.datname).join(', ') || '(none)',
    )

    for (const { datname } of dbs) {
      console.log(`Terminating connections to ${datname}…`)
      await admin.$executeRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        datname,
      )
      console.log(`Dropping ${datname}…`)
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${datname}"`)
    }

    console.log('Creating empty mesa…')
    await admin.$executeRawUnsafe(`CREATE DATABASE "mesa"`)
  } finally {
    await admin.$disconnect()
  }

  console.log('Applying migrations…')
  const prismaCli = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js')
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: PRIMARY },
    stdio: 'inherit',
  })

  console.log('Done. Primary DB is empty (no companies). Restart mesa-api, then register via /developer.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
