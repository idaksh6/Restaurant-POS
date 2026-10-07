-- Print Agent: connection details, purposes and print options per printer
ALTER TABLE "PrintStation" ADD COLUMN IF NOT EXISTS "connection" TEXT;
ALTER TABLE "PrintStation" ADD COLUMN IF NOT EXISTS "host" TEXT;
ALTER TABLE "PrintStation" ADD COLUMN IF NOT EXISTS "port" INTEGER;
ALTER TABLE "PrintStation" ADD COLUMN IF NOT EXISTS "purposes" JSONB;
ALTER TABLE "PrintStation" ADD COLUMN IF NOT EXISTS "options" JSONB;
ALTER TABLE "PrintStation" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN;
