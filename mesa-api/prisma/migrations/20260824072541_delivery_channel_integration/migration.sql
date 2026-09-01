-- CreateTable
CREATE TABLE "DeliveryChannelIntegration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "storeId" TEXT,
    "apiKey" TEXT,
    "apiBaseUrl" TEXT,
    "webhookSecret" TEXT,
    "lastMenuSyncAt" TIMESTAMP(3),
    "lastMenuSyncNote" TEXT,
    "meta" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryChannelIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryChannelIntegration_companyId_branchId_idx" ON "DeliveryChannelIntegration"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryChannelIntegration_branchId_channelId_key" ON "DeliveryChannelIntegration"("branchId", "channelId");

-- AddForeignKey
ALTER TABLE "DeliveryChannelIntegration" ADD CONSTRAINT "DeliveryChannelIntegration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChannelIntegration" ADD CONSTRAINT "DeliveryChannelIntegration_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
