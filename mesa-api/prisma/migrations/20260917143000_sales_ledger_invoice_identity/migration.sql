-- Persist invoice identity on sales ledger for Back Office reprints
ALTER TABLE "SalesLedger" ADD COLUMN IF NOT EXISTS "billNo" INTEGER;
ALTER TABLE "SalesLedger" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "SalesLedger" ADD COLUMN IF NOT EXISTS "staffUsername" TEXT;
ALTER TABLE "SalesLedger" ADD COLUMN IF NOT EXISTS "tableLabel" TEXT;
