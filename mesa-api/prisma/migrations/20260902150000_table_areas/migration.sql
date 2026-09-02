CREATE TABLE IF NOT EXISTS "TableArea" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableArea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TableArea_companyId_idx" ON "TableArea"("companyId");

DO $$ BEGIN
  ALTER TABLE "TableArea" ADD CONSTRAINT "TableArea_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
