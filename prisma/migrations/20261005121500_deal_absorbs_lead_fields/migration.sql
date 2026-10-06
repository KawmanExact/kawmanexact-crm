-- Deals and leads are the same record now: the Deal row carries every field
-- that used to live only on Lead, so an enquiry is entered once instead of
-- being typed into a lead form and then re-entered as a deal.
--
-- All columns are nullable / defaulted, so existing deals stay valid and every
-- existing lead can be folded into one without a data backfill step.

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "cdaStatus" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "customProductNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "customerRequirement" TEXT,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "grade" TEXT,
ADD COLUMN     "keyDiscussionPoints" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "loaStatus" TEXT,
ADD COLUMN     "meetingAt" TEXT,
ADD COLUMN     "meetingDate" TIMESTAMP(3),
ADD COLUMN     "meetingMode" TEXT,
ADD COLUMN     "nextFollowUp" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "productsDiscussed" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "purposeOfVisit" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "rndFeedback" TEXT,
ADD COLUMN     "samplingStatus" TEXT,
ADD COLUMN     "score" INTEGER DEFAULT 0,
ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE INDEX "Deal_lastActivityAt_idx" ON "Deal"("lastActivityAt");

-- CreateIndex
CREATE INDEX "Deal_region_idx" ON "Deal"("region");

-- CreateIndex
CREATE INDEX "Deal_nextFollowUp_idx" ON "Deal"("nextFollowUp");