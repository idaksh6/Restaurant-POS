-- Company POS license (first-device activate → 12 months; other devices inherit; hard-block when expired)
ALTER TABLE "TenantRegistry" ADD COLUMN IF NOT EXISTS "licenseStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "TenantRegistry" ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3);
ALTER TABLE "TenantRegistry" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- Existing tenants: stay live with a fresh 12-month window so production is not locked out
UPDATE "TenantRegistry"
SET
  "licenseStatus" = 'active',
  "activatedAt" = COALESCE("activatedAt", NOW()),
  "expiresAt" = COALESCE("expiresAt", NOW() + INTERVAL '12 months')
WHERE "activatedAt" IS NULL OR "licenseStatus" IS NULL OR "licenseStatus" = 'pending';
