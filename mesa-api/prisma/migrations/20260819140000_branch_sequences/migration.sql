CREATE TABLE IF NOT EXISTS "BranchSequence" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BranchSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BranchSequence_branchId_kind_key" ON "BranchSequence"("branchId", "kind");
CREATE INDEX IF NOT EXISTS "BranchSequence_companyId_branchId_idx" ON "BranchSequence"("companyId", "branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BranchSequence_companyId_fkey'
  ) THEN
    ALTER TABLE "BranchSequence" ADD CONSTRAINT "BranchSequence_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BranchSequence_branchId_fkey'
  ) THEN
    ALTER TABLE "BranchSequence" ADD CONSTRAINT "BranchSequence_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
