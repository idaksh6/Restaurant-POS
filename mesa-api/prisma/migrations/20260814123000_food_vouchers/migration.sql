-- CreateTable
CREATE TABLE "FoodVoucherBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodVoucherBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodVoucherCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "usedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodVoucherCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodVoucherBatch_companyId_idx" ON "FoodVoucherBatch"("companyId");

-- CreateIndex
CREATE INDEX "FoodVoucherCode_companyId_idx" ON "FoodVoucherCode"("companyId");

-- CreateIndex
CREATE INDEX "FoodVoucherCode_companyId_batchId_idx" ON "FoodVoucherCode"("companyId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodVoucherCode_companyId_code_key" ON "FoodVoucherCode"("companyId", "code");

-- AddForeignKey
ALTER TABLE "FoodVoucherBatch" ADD CONSTRAINT "FoodVoucherBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodVoucherCode" ADD CONSTRAINT "FoodVoucherCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodVoucherCode" ADD CONSTRAINT "FoodVoucherCode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FoodVoucherBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
