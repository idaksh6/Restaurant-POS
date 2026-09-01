-- CreateTable
CREATE TABLE IF NOT EXISTS "FloorTable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 2,
    "area" TEXT NOT NULL DEFAULT 'Main Hall',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorTable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FloorTable_companyId_branchId_idx" ON "FloorTable"("companyId", "branchId");

ALTER TABLE "FloorTable" DROP CONSTRAINT IF EXISTS "FloorTable_companyId_fkey";
ALTER TABLE "FloorTable" ADD CONSTRAINT "FloorTable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FloorTable" DROP CONSTRAINT IF EXISTS "FloorTable_branchId_fkey";
ALTER TABLE "FloorTable" ADD CONSTRAINT "FloorTable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "onHand" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderAt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockItem_companyId_idx" ON "StockItem"("companyId");
CREATE INDEX IF NOT EXISTS "StockItem_companyId_branchId_idx" ON "StockItem"("companyId", "branchId");

ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_companyId_fkey";
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
