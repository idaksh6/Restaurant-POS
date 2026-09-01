CREATE TABLE IF NOT EXISTS "SalesLedger" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL,
  "day" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL,
  "tax" DOUBLE PRECISION NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  "discountAmt" DOUBLE PRECISION,
  "staff" TEXT,
  "lines" JSONB,
  "splitPayments" JSONB,
  "charges" JSONB,
  "customerId" TEXT,
  "loyaltyRedeem" DOUBLE PRECISION,
  "voidReason" TEXT,
  "voidLineName" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SalesLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalesLedger_companyId_branchId_idx" ON "SalesLedger"("companyId", "branchId");
CREATE INDEX IF NOT EXISTS "SalesLedger_branchId_day_idx" ON "SalesLedger"("branchId", "day");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SalesLedger_companyId_fkey'
  ) THEN
    ALTER TABLE "SalesLedger" ADD CONSTRAINT "SalesLedger_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SalesLedger_branchId_fkey'
  ) THEN
    ALTER TABLE "SalesLedger" ADD CONSTRAINT "SalesLedger_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
