-- Control-plane registry: one row per company → Postgres database URL
CREATE TABLE "TenantRegistry" (
    "id" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "databaseName" TEXT NOT NULL,
    "databaseUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRegistry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantRegistry_taxId_key" ON "TenantRegistry"("taxId");
