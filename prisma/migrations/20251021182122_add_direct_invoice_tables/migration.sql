-- CreateEnum
CREATE TYPE "DirectInvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "DirectInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "DirectInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectInvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "totalPrice" DECIMAL(15,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'INV',
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectInvoice_invoiceNumber_key" ON "DirectInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "DirectInvoice_invoiceNumber_idx" ON "DirectInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "DirectInvoice_clientId_idx" ON "DirectInvoice"("clientId");

-- CreateIndex
CREATE INDEX "DirectInvoice_companyId_idx" ON "DirectInvoice"("companyId");

-- CreateIndex
CREATE INDEX "DirectInvoice_status_idx" ON "DirectInvoice"("status");

-- CreateIndex
CREATE INDEX "DirectInvoice_invoiceDate_idx" ON "DirectInvoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "DirectInvoice_dueDate_idx" ON "DirectInvoice"("dueDate");

-- CreateIndex
CREATE INDEX "DirectInvoiceItem_invoiceId_idx" ON "DirectInvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "DirectInvoiceItem_itemId_idx" ON "DirectInvoiceItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSequence_companyId_prefix_key" ON "InvoiceSequence"("companyId", "prefix");

-- AddForeignKey
ALTER TABLE "DirectInvoice" ADD CONSTRAINT "DirectInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectInvoice" ADD CONSTRAINT "DirectInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectInvoiceItem" ADD CONSTRAINT "DirectInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "DirectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectInvoiceItem" ADD CONSTRAINT "DirectInvoiceItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
