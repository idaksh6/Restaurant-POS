-- Link sales ledger rows to the ZATCA invoice issued at settle (reprints reuse the reported QR)
ALTER TABLE "SalesLedger" ADD COLUMN IF NOT EXISTS "invoiceUuid" TEXT;
