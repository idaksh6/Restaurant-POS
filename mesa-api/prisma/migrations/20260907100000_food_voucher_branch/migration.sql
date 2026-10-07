-- AlterTable
ALTER TABLE "FoodVoucherBatch" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "FoodVoucherCode" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

CREATE INDEX IF NOT EXISTS "FoodVoucherBatch_companyId_branchId_idx" ON "FoodVoucherBatch"("companyId", "branchId");
CREATE INDEX IF NOT EXISTS "FoodVoucherCode_companyId_branchId_idx" ON "FoodVoucherCode"("companyId", "branchId");
