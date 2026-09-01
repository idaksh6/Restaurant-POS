CREATE TABLE IF NOT EXISTS "Shift" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  "floatAmount" DOUBLE PRECISION NOT NULL,
  "cashIn" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "countedCash" DOUBLE PRECISION,
  "variance" DOUBLE PRECISION,
  "open" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Shift_companyId_branchId_idx" ON "Shift"("companyId", "branchId");
CREATE INDEX IF NOT EXISTS "Shift_branchId_open_idx" ON "Shift"("branchId", "open");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Shift_companyId_fkey'
  ) THEN
    ALTER TABLE "Shift" ADD CONSTRAINT "Shift_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Shift_branchId_fkey'
  ) THEN
    ALTER TABLE "Shift" ADD CONSTRAINT "Shift_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
