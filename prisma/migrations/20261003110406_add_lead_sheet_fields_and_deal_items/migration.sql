-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "grade" TEXT,
ADD COLUMN     "loaStatus" TEXT,
ADD COLUMN     "meetingAt" TEXT,
ADD COLUMN     "meetingDate" TIMESTAMP(3),
ADD COLUMN     "nextFollowUp" TIMESTAMP(3),
ADD COLUMN     "remark" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "unitCost" DECIMAL(15,2),
ADD COLUMN     "unitPrice" DECIMAL(15,2);

-- CreateTable
CREATE TABLE "DealItem" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "productId" TEXT,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "unitCost" DECIMAL(15,2) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealItem_dealId_idx" ON "DealItem"("dealId");

-- CreateIndex
CREATE INDEX "DealItem_productId_idx" ON "DealItem"("productId");

-- CreateIndex
CREATE INDEX "DealItem_organizationId_idx" ON "DealItem"("organizationId");

-- CreateIndex
CREATE INDEX "Lead_contactPerson_idx" ON "Lead"("contactPerson");

-- CreateIndex
CREATE INDEX "Lead_meetingDate_idx" ON "Lead"("meetingDate");

-- AddForeignKey
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
