-- Direct Fatoora onboarding fields
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaSecret" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaComplianceRequestId" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaCsidKind" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaIcv" INTEGER NOT NULL DEFAULT 0;
