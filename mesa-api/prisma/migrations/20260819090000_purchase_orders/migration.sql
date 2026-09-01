CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "lines" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PurchaseOrder_companyId_branchId_idx" ON "PurchaseOrder"("companyId", "branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_companyId_fkey'
  ) THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_branchId_fkey'
  ) THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
