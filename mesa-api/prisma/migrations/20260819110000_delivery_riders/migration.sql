CREATE TABLE IF NOT EXISTS "DeliveryRider" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeliveryRider_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeliveryRider_companyId_branchId_idx" ON "DeliveryRider"("companyId", "branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryRider_companyId_fkey'
  ) THEN
    ALTER TABLE "DeliveryRider" ADD CONSTRAINT "DeliveryRider_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryRider_branchId_fkey'
  ) THEN
    ALTER TABLE "DeliveryRider" ADD CONSTRAINT "DeliveryRider_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
