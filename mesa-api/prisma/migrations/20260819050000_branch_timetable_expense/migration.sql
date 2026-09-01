ALTER TABLE "ExpenseDetail" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
CREATE INDEX IF NOT EXISTS "ExpenseDetail_companyId_branchId_idx" ON "ExpenseDetail"("companyId", "branchId");

ALTER TABLE "MenuTimetable" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
CREATE INDEX IF NOT EXISTS "MenuTimetable_companyId_branchId_idx" ON "MenuTimetable"("companyId", "branchId");
