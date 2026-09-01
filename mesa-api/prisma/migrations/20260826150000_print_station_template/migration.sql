-- AlterTable
ALTER TABLE "PrintStation" ADD COLUMN IF NOT EXISTS "templateId" TEXT NOT NULL DEFAULT 'classic';
