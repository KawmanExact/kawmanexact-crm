-- AlterEnum: Update DealStage enum values
BEGIN;

CREATE TYPE "DealStage_new" AS ENUM ('SUSPECT', 'PROSPECT', 'APPROACH_ANALYSE', 'NEGOTIATE', 'CLOSE', 'ORDER', 'PAYMENT', 'LOST');
ALTER TABLE "Deal" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "Deal" ALTER COLUMN "stage" TYPE "DealStage_new" USING ("stage"::text::"DealStage_new");
ALTER TABLE "Deal" ALTER COLUMN "stage" SET DEFAULT 'SUSPECT'::"DealStage_new";
ALTER TYPE "DealStage" RENAME TO "DealStage_old";
ALTER TYPE "DealStage_new" RENAME TO "DealStage";
DROP TYPE "public"."DealStage_old" CASCADE;

COMMIT;

-- PaymentStatus was already created by 20261003073042_sales_tracking_funnel,
-- so only the new Deal column is added here.

-- AlterTable: Add new columns to Deal
ALTER TABLE "Deal" ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Deal" ADD COLUMN "lostReason" TEXT;
ALTER TABLE "Deal" ADD COLUMN "lostAt" TIMESTAMP(3) WITH TIME ZONE;

-- CreateTable: DealStageHistory
CREATE TABLE "DealStageHistory" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL,
    "previousStage" "DealStage",
    "probability" INTEGER NOT NULL DEFAULT 0,
    "movedById" TEXT,
    "movedByName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealStageHistory_dealId_idx" ON "DealStageHistory"("dealId");
CREATE INDEX "DealStageHistory_organizationId_idx" ON "DealStageHistory"("organizationId");
CREATE INDEX "DealStageHistory_createdAt_idx" ON "DealStageHistory"("createdAt");
CREATE INDEX "Deal_paymentStatus_idx" ON "Deal"("paymentStatus");

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
