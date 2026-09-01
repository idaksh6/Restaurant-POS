-- Discount master rates (POS floor quick-picks)
CREATE TABLE IF NOT EXISTS "DiscountRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DiscountRate_companyId_idx" ON "DiscountRate"("companyId");

ALTER TABLE "DiscountRate"
  DROP CONSTRAINT IF EXISTS "DiscountRate_companyId_fkey";

ALTER TABLE "DiscountRate"
  ADD CONSTRAINT "DiscountRate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
