-- Ingredient master + optional link from StockItem (was in schema + runtime ALTER only)
CREATE TABLE IF NOT EXISTS "Ingredient" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Ingredient_companyId_idx" ON "Ingredient"("companyId");

DO $$ BEGIN
  ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "StockItem" ADD COLUMN IF NOT EXISTS "ingredientId" TEXT;

CREATE INDEX IF NOT EXISTS "StockItem_companyId_ingredientId_idx"
  ON "StockItem"("companyId", "ingredientId");
