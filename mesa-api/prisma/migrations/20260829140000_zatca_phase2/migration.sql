-- Phase 2 ZATCA: company credentials + invoice reporting store
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaPhase2Enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaPhase2Env" TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaCsid" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaPrivateKey" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaBinaryToken" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zatcaPih" TEXT;

CREATE TABLE IF NOT EXISTS "ZatcaInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalSar" DOUBLE PRECISION NOT NULL,
    "vatSar" DOUBLE PRECISION NOT NULL,
    "sellerVat" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "tlvBase64" TEXT,
    "invoiceHash" TEXT,
    "zatcaUuid" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZatcaInvoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ZatcaInvoice_companyId_idx" ON "ZatcaInvoice"("companyId");

ALTER TABLE "ZatcaInvoice"
  DROP CONSTRAINT IF EXISTS "ZatcaInvoice_companyId_fkey";

ALTER TABLE "ZatcaInvoice"
  ADD CONSTRAINT "ZatcaInvoice_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
