-- AlterTable
ALTER TABLE "SalesTransaction" ADD COLUMN     "advanceAmount" DECIMAL(15,2),
ADD COLUMN     "freightAmount" DECIMAL(15,2),
ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "paymentMode" TEXT,
ADD COLUMN     "pdcAmount" DECIMAL(15,2),
ADD COLUMN     "purchaseOrderNo" TEXT;
