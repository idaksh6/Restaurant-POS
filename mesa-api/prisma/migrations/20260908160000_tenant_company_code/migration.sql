-- Short activation code for POS terminals (companies without a VAT can use this).
ALTER TABLE "TenantRegistry" ADD COLUMN IF NOT EXISTS "companyCode" TEXT;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS n
  FROM "TenantRegistry"
)
UPDATE "TenantRegistry" AS t
SET "companyCode" = 'C' || LPAD(numbered.n::text, 3, '0')
FROM numbered
WHERE t.id = numbered.id
  AND (t."companyCode" IS NULL OR btrim(t."companyCode") = '');

ALTER TABLE "TenantRegistry" ALTER COLUMN "companyCode" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "TenantRegistry_companyCode_key" ON "TenantRegistry"("companyCode");
