/**
 * Apply ZATCA Phase 1/2 DDL to every tenant DB (and primary).
 * Logs company ids only — never connection URLs.
 */
import { PrismaClient } from '@prisma/client'

const STEPS = [
  `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaPhase2Enabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaPhase2Env" TEXT NOT NULL DEFAULT 'sandbox'`,
  `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaCsid" TEXT`,
  `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaPrivateKey" TEXT`,
  `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaBinaryToken" TEXT`,
  `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaPih" TEXT`,
  `CREATE TABLE IF NOT EXISTS "ZatcaInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalSar" DOUBLE PRECISION NOT NULL,
    "vatSar" DOUBLE PRECISION NOT NULL,
    "sellerVat" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "tlvBase64" TEXT,
    "invoiceHash" TEXT,
    "zatcaUuid" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZatcaInvoice_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ZatcaInvoice_companyId_idx" ON "ZatcaInvoice"("companyId")`,
]

async function apply(label, url) {
  const client = new PrismaClient({ datasources: { db: { url } } })
  try {
    await client.$connect()
    for (const sql of STEPS) {
      await client.$executeRawUnsafe(sql)
    }
    // FK best-effort
    await client.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "ZatcaInvoice" DROP CONSTRAINT IF EXISTS "ZatcaInvoice_companyId_fkey";
        ALTER TABLE "ZatcaInvoice"
          ADD CONSTRAINT "ZatcaInvoice_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `)
    console.log(`ok ${label}`)
  } catch (err) {
    console.error(`fail ${label}: ${err instanceof Error ? err.message : err}`)
  } finally {
    await client.$disconnect().catch(() => undefined)
  }
}

async function main() {
  const primary = process.env.DATABASE_URL
  if (!primary) throw new Error('DATABASE_URL required')
  await apply('primary', primary)

  const control = new PrismaClient()
  try {
    const rows = await control.tenantRegistry.findMany({
      select: { id: true, databaseUrl: true },
    })
    for (const row of rows) {
      if (!row.databaseUrl) continue
      await apply(row.id, row.databaseUrl)
    }
  } finally {
    await control.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
