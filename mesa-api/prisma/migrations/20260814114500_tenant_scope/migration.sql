-- Tenant-scope growing tables so one shared DB stays isolated per company.

-- Category
ALTER TABLE "Category" ADD COLUMN "companyId" TEXT;
UPDATE "Category" AS c
SET "companyId" = b."companyId"
FROM "Branch" AS b
WHERE c."branchId" = b."id";
UPDATE "Category" SET "companyId" = 'co-mesa' WHERE "companyId" IS NULL;
ALTER TABLE "Category" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Category_companyId_idx" ON "Category"("companyId");
CREATE INDEX "Category_companyId_branchId_idx" ON "Category"("companyId", "branchId");
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Product
ALTER TABLE "Product" ADD COLUMN "companyId" TEXT;
UPDATE "Product" AS p
SET "companyId" = b."companyId"
FROM "Branch" AS b
WHERE p."branchId" = b."id";
UPDATE "Product" SET "companyId" = 'co-mesa' WHERE "companyId" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Product_companyId_idx" ON "Product"("companyId");
CREATE INDEX "Product_companyId_branchId_idx" ON "Product"("companyId", "branchId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Customer
UPDATE "Customer" SET "companyId" = 'co-mesa' WHERE "companyId" IS NULL;
ALTER TABLE "Customer" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");
CREATE INDEX "Customer_companyId_phone_idx" ON "Customer"("companyId", "phone");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ticket
ALTER TABLE "Ticket" ADD COLUMN "companyId" TEXT;
UPDATE "Ticket" AS t
SET "companyId" = b."companyId"
FROM "Branch" AS b
WHERE t."branchId" = b."id";
UPDATE "Ticket" SET "companyId" = 'co-mesa' WHERE "companyId" IS NULL;
ALTER TABLE "Ticket" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Ticket_companyId_branchId_status_idx" ON "Ticket"("companyId", "branchId", "status");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SyncOp / Device / AuditLog (nullable — ops may predate a company bind)
ALTER TABLE "SyncOp" ADD COLUMN "companyId" TEXT;
CREATE INDEX "SyncOp_companyId_branchId_idx" ON "SyncOp"("companyId", "branchId");

ALTER TABLE "Device" ADD COLUMN "companyId" TEXT;
CREATE INDEX "Device_companyId_idx" ON "Device"("companyId");

ALTER TABLE "AuditLog" ADD COLUMN "companyId" TEXT;
CREATE INDEX "AuditLog_companyId_branchId_idx" ON "AuditLog"("companyId", "branchId");

-- DayClose
ALTER TABLE "DayClose" ADD COLUMN "companyId" TEXT;
UPDATE "DayClose" AS d
SET "companyId" = b."companyId"
FROM "Branch" AS b
WHERE d."branchId" = b."id";
UPDATE "DayClose" SET "companyId" = 'co-mesa' WHERE "companyId" IS NULL;
ALTER TABLE "DayClose" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "DayClose_companyId_idx" ON "DayClose"("companyId");
ALTER TABLE "DayClose" ADD CONSTRAINT "DayClose_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
