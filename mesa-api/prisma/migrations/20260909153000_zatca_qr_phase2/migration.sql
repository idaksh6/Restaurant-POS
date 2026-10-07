-- Phase 2 stamped QR payload from certified Fatoora gateway
ALTER TABLE "ZatcaInvoice" ADD COLUMN IF NOT EXISTS "qrPhase2Base64" TEXT;
