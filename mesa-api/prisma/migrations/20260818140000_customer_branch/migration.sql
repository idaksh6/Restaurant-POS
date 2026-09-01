-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Customer_companyId_branchId_idx" ON "Customer"("companyId", "branchId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Customer_branchId_fkey'
  ) THEN
    ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
