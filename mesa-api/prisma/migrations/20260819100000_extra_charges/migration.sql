CREATE TABLE IF NOT EXISTS "ExtraCharge" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "percent" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExtraCharge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExtraCharge_companyId_branchId_idx" ON "ExtraCharge"("companyId", "branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExtraCharge_companyId_fkey'
  ) THEN
    ALTER TABLE "ExtraCharge" ADD CONSTRAINT "ExtraCharge_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExtraCharge_branchId_fkey'
  ) THEN
    ALTER TABLE "ExtraCharge" ADD CONSTRAINT "ExtraCharge_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
