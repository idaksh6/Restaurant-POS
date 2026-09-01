const { PrismaClient } = require('@prisma/client')

async function main() {
  const p = new PrismaClient()
  try {
    const before = await p.$queryRawUnsafe(
      `SELECT to_regclass('public."DiscountRate"')::text AS tbl`,
    )
    console.log('before', before)

    await p.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "DiscountRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscountRate_pkey" PRIMARY KEY ("id")
)`)
    await p.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "DiscountRate_companyId_idx" ON "DiscountRate"("companyId")`,
    )
    try {
      await p.$executeRawUnsafe(`
ALTER TABLE "DiscountRate"
  ADD CONSTRAINT "DiscountRate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE`)
    } catch (e) {
      console.log('fk note:', String(e.message || e).slice(0, 120))
    }

    const after = await p.$queryRawUnsafe(
      `SELECT to_regclass('public."DiscountRate"')::text AS tbl`,
    )
    console.log('after', after)
  } finally {
    await p.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
