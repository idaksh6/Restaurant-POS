-- AlterTable
ALTER TABLE "Product" ADD COLUMN "meta" JSONB;

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "expiryDate" TEXT NOT NULL,
    "issueAmount" DOUBLE PRECISION NOT NULL,
    "extraCharges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasureUnit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL DEFAULT 'generic',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasureUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseDetail" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "expenseTypeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TEXT NOT NULL,
    "paymentTypeId" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuTimetable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validFrom" TEXT NOT NULL,
    "validTo" TEXT NOT NULL,
    "timeFrom" TEXT NOT NULL,
    "timeTo" TEXT NOT NULL,
    "departmentIds" JSONB NOT NULL,
    "productIds" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuTimetable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GiftCard_companyId_number_key" ON "GiftCard"("companyId", "number");
CREATE INDEX "GiftCard_companyId_idx" ON "GiftCard"("companyId");
CREATE INDEX "TaxRate_companyId_idx" ON "TaxRate"("companyId");
CREATE INDEX "MeasureUnit_companyId_idx" ON "MeasureUnit"("companyId");
CREATE INDEX "PaymentType_companyId_idx" ON "PaymentType"("companyId");
CREATE INDEX "ExpenseType_companyId_idx" ON "ExpenseType"("companyId");
CREATE INDEX "ExpenseDetail_companyId_idx" ON "ExpenseDetail"("companyId");
CREATE INDEX "ExpenseDetail_companyId_expenseTypeId_idx" ON "ExpenseDetail"("companyId", "expenseTypeId");
CREATE INDEX "MenuTimetable_companyId_idx" ON "MenuTimetable"("companyId");

ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MeasureUnit" ADD CONSTRAINT "MeasureUnit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentType" ADD CONSTRAINT "PaymentType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseType" ADD CONSTRAINT "ExpenseType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseDetail" ADD CONSTRAINT "ExpenseDetail_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseDetail" ADD CONSTRAINT "ExpenseDetail_expenseTypeId_fkey" FOREIGN KEY ("expenseTypeId") REFERENCES "ExpenseType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuTimetable" ADD CONSTRAINT "MenuTimetable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
