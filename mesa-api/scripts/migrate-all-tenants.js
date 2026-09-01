/**
 * Run `prisma migrate deploy` against every tenant database in TenantRegistry
 * (plus the control-plane DATABASE_URL). Required after new migrations —
 * company DBs are separate from `mesa`.
 */
const { PrismaClient } = require('@prisma/client')
const { execFileSync } = require('child_process')
const path = require('path')

async function main() {
  const root = path.resolve(__dirname, '..')
  const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js')
  const control = new PrismaClient()
  const urls = new Set()

  const primary = process.env.DATABASE_URL
  if (primary) urls.add(primary)

  try {
    const regs = await control.tenantRegistry.findMany({
      select: { id: true, companyName: true, databaseName: true, databaseUrl: true },
    })
    console.log(`TenantRegistry: ${regs.length} row(s)`)
    for (const r of regs) {
      console.log(`  - ${r.id} · ${r.companyName} · ${r.databaseName}`)
      if (r.databaseUrl) urls.add(r.databaseUrl)
    }
  } finally {
    await control.$disconnect()
  }

  for (const databaseUrl of urls) {
    let label = databaseUrl
    try {
      label = new URL(databaseUrl).pathname.replace(/^\//, '') || databaseUrl
    } catch {
      /* keep raw */
    }
    console.log(`\n→ migrate deploy · ${label}`)
    try {
      const out = execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: 'utf8',
      })
      console.log(out.trim() || 'ok')
    } catch (err) {
      const e = err
      console.error(e.stderr || e.stdout || e.message)
      process.exitCode = 1
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
