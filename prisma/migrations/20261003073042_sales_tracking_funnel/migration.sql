-- CreateEnum
CREATE TYPE "FunnelStage" AS ENUM ('SUSPECT', 'PROSPECT', 'APPROACH_ANALYSE', 'NEGOTIATE', 'CLOSE', 'ORDER', 'PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIALLY_PAID', 'PENDING');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "cdaDate" TIMESTAMP(3),
ADD COLUMN     "cdaStatus" TEXT,
ADD COLUMN     "customerRequirement" TEXT,
ADD COLUMN     "enquiryDate" TIMESTAMP(3),
ADD COLUMN     "funnelStage" "FunnelStage",
ADD COLUMN     "keyDiscussionPoints" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "meetingMode" TEXT,
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "productsDiscussed" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "purposeOfVisit" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "rndFeedback" TEXT,
ADD COLUMN     "samplingStatus" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "grade" TEXT,
    "variant" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "defaultUnitPrice" DECIMAL(15,2),
    "description" TEXT,
    "attributes" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salespersonId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "otherProductName" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceKey" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "amountPaid" DECIMAL(15,2) NOT NULL,
    "balanceAmount" DECIMAL(15,2) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_organizationId_idx" ON "Product"("organizationId");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_name_variant_key" ON "Product"("organizationId", "name", "variant");

-- CreateIndex
CREATE INDEX "SalesTransaction_organizationId_idx" ON "SalesTransaction"("organizationId");

-- CreateIndex
CREATE INDEX "SalesTransaction_salespersonId_idx" ON "SalesTransaction"("salespersonId");

-- CreateIndex
CREATE INDEX "SalesTransaction_customerId_idx" ON "SalesTransaction"("customerId");

-- CreateIndex
CREATE INDEX "SalesTransaction_productId_idx" ON "SalesTransaction"("productId");

-- CreateIndex
CREATE INDEX "SalesTransaction_saleDate_idx" ON "SalesTransaction"("saleDate");

-- CreateIndex
CREATE INDEX "SalesTransaction_paymentStatus_idx" ON "SalesTransaction"("paymentStatus");

-- CreateIndex
CREATE INDEX "SalesTransaction_groupId_idx" ON "SalesTransaction"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTransaction_organizationId_invoiceKey_lineNumber_key" ON "SalesTransaction"("organizationId", "invoiceKey", "lineNumber");

-- CreateIndex
CREATE INDEX "Lead_funnelStage_idx" ON "Lead"("funnelStage");

-- CreateIndex
CREATE INDEX "Lead_region_idx" ON "Lead"("region");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTransaction" ADD CONSTRAINT "SalesTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTransaction" ADD CONSTRAINT "SalesTransaction_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTransaction" ADD CONSTRAINT "SalesTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTransaction" ADD CONSTRAINT "SalesTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- One-time funnel backfill: derive the initial SPANCOP position from the
-- pre-existing LeadStatus so existing leads appear on the funnel immediately.
--   NEW          -> SUSPECT
--   CONTACTED    -> PROSPECT
--   QUALIFIED    -> APPROACH_ANALYSE
--   PROPOSAL     -> NEGOTIATE
--   NEGOTIATION  -> NEGOTIATE
--   WON          -> ORDER
--   LOST         -> NULL (shown separately by the funnel view as "Lost")
--
-- Only rows that do not already have a funnelStage are touched, so the UPDATE
-- is safe to re-run and never overwrites a stage set in the app.
-- ---------------------------------------------------------------------------
UPDATE "Lead"
SET "funnelStage" = CASE "status"
    WHEN 'NEW'         THEN 'SUSPECT'::"FunnelStage"
    WHEN 'CONTACTED'   THEN 'PROSPECT'::"FunnelStage"
    WHEN 'QUALIFIED'   THEN 'APPROACH_ANALYSE'::"FunnelStage"
    WHEN 'PROPOSAL'    THEN 'NEGOTIATE'::"FunnelStage"
    WHEN 'NEGOTIATION' THEN 'NEGOTIATE'::"FunnelStage"
    WHEN 'WON'         THEN 'ORDER'::"FunnelStage"
    ELSE NULL
  END
WHERE "funnelStage" IS NULL
  AND "status" <> 'LOST';
