-- Roles were in schema.prisma but never migrated (control DB had them via db push)
CREATE TABLE IF NOT EXISTS "Role" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "privileges" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Role_companyId_key_key" ON "Role"("companyId", "key");
CREATE INDEX IF NOT EXISTS "Role_companyId_idx" ON "Role"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Role_companyId_fkey'
  ) THEN
    ALTER TABLE "Role"
      ADD CONSTRAINT "Role_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
