-- Align User table with Prisma schema (columns were in schema but never migrated)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nameAr" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

-- Username uniqueness is per company (global unique may exist from init)
DROP INDEX IF EXISTS "User_username_key";
CREATE UNIQUE INDEX IF NOT EXISTS "User_companyId_username_key" ON "User"("companyId", "username");
