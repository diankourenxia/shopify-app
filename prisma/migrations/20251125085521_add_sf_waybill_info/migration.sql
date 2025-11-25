-- AlterTable
ALTER TABLE "OrderStatus" ADD COLUMN "sfCreatedAt" DATETIME;
ALTER TABLE "OrderStatus" ADD COLUMN "sfInvoiceUrl" TEXT;
ALTER TABLE "OrderStatus" ADD COLUMN "sfLabelUrl" TEXT;
ALTER TABLE "OrderStatus" ADD COLUMN "sfWaybillNo" TEXT;
