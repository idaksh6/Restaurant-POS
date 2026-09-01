CREATE TABLE IF NOT EXISTS "PrintStation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "target" TEXT NOT NULL DEFAULT 'browser',
  "copies" INTEGER NOT NULL DEFAULT 1,
  "paperWidthMm" INTEGER NOT NULL DEFAULT 80,
  "departmentId" TEXT,
  "header" TEXT NOT NULL DEFAULT '',
  "footer" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PrintStation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PrintStation_companyId_branchId_idx" ON "PrintStation"("companyId", "branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PrintStation_companyId_fkey'
  ) THEN
    ALTER TABLE "PrintStation" ADD CONSTRAINT "PrintStation_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PrintStation_branchId_fkey'
  ) THEN
    ALTER TABLE "PrintStation" ADD CONSTRAINT "PrintStation_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
