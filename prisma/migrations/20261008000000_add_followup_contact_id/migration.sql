-- Add contactId to FollowUp so the full Company -> Contact -> Deal ->
-- FollowUp hierarchy is queryable without re-deriving parents on every read.
--
-- contactId is nullable: company-level and deal-level follow-ups that have
-- no explicit contact still work; a backfill script fills contactId from the
-- linked deal's contactId / the linked contact's companyId.
-- The Lead FK is left untouched (leadId is legacy-only).

-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN     "contactId" TEXT;

-- CreateIndex
CREATE INDEX "FollowUp_contactId_idx" ON "FollowUp"("contactId");

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL;
