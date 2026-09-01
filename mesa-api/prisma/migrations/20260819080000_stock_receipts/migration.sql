CREATE TABLE IF NOT EXISTS "StockReceipt" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "receiveNumber" TEXT NOT NULL,
  "receivingDate" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL DEFAULT '',
  "invoiceDate" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "receivingPerson" TEXT NOT NULL DEFAULT '',
  "packingQty" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "notes" TEXT,
  "lines" JSONB NOT NULL,
  "netAmount" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockReceipt_companyId_branchId_idx" ON "StockReceipt"("companyId", "branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockReceipt_companyId_fkey'
  ) THEN
    ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockReceipt_branchId_fkey'
  ) THEN
    ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
