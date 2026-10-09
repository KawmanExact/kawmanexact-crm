-- DropForeignKey
ALTER TABLE "FollowUp" DROP CONSTRAINT "FollowUp_contactId_fkey";

-- DropIndex
DROP INDEX "Deal_region_idx";

-- DropIndex
DROP INDEX "SalesTransaction_advanceAmount_idx";

-- DropIndex
DROP INDEX "SalesTransaction_invoiceAmount_idx";

-- DropIndex
DROP INDEX "SalesTransaction_pdcAmount_idx";

-- AlterTable
ALTER TABLE "Deal" DROP COLUMN "location",
DROP COLUMN "region",
ADD COLUMN     "application" TEXT,
ADD COLUMN     "applicationOther" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "pinCode" TEXT,
ALTER COLUMN "score" SET NOT NULL;

-- AlterTable
ALTER TABLE "SalesTransaction" ADD COLUMN     "unit" TEXT;

-- CreateIndex
CREATE INDEX "Deal_city_idx" ON "Deal"("city");

-- CreateIndex
CREATE INDEX "Deal_country_idx" ON "Deal"("country");

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

