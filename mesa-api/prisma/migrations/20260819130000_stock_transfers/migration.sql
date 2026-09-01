CREATE TABLE IF NOT EXISTS "StockTransfer" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "fromStockId" TEXT NOT NULL,
  "toStockId" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "toName" TEXT NOT NULL,
  "fromSku" TEXT NOT NULL DEFAULT '',
  "toSku" TEXT NOT NULL DEFAULT '',
  "qty" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'pcs',
  "note" TEXT,
  "staff" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockTransfer_companyId_branchId_idx" ON "StockTransfer"("companyId", "branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_companyId_fkey'
  ) THEN
    ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_branchId_fkey'
  ) THEN
    ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
