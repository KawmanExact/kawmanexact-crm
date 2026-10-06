/*
  Warnings:

  - The values [MEETING_REMINDER] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `funnelStage` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `value` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the `Meeting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MeetingParticipant` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MeetingRecording` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MeetingSummary` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MeetingTranscript` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('FOLLOW_UP_DUE', 'NEW_LEAD', 'DEAL_UPDATED', 'FILE_SHARED', 'FILE_UPLOADED', 'AI_REPORT_READY', 'CHECK_IN_COMPLETED', 'SECURITY_EVENT', 'DAILY_REPORT_SUBMITTED', 'VISIT_ASSIGNED');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Meeting" DROP CONSTRAINT "Meeting_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Meeting" DROP CONSTRAINT "Meeting_contactId_fkey";

-- DropForeignKey
ALTER TABLE "Meeting" DROP CONSTRAINT "Meeting_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Meeting" DROP CONSTRAINT "Meeting_dealId_fkey";

-- DropForeignKey
ALTER TABLE "Meeting" DROP CONSTRAINT "Meeting_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "MeetingParticipant" DROP CONSTRAINT "MeetingParticipant_meetingId_fkey";

-- DropForeignKey
ALTER TABLE "MeetingParticipant" DROP CONSTRAINT "MeetingParticipant_userId_fkey";

-- DropForeignKey
ALTER TABLE "MeetingRecording" DROP CONSTRAINT "MeetingRecording_meetingId_fkey";

-- DropForeignKey
ALTER TABLE "MeetingSummary" DROP CONSTRAINT "MeetingSummary_editedById_fkey";

-- DropForeignKey
ALTER TABLE "MeetingSummary" DROP CONSTRAINT "MeetingSummary_meetingId_fkey";

-- DropForeignKey
ALTER TABLE "MeetingTranscript" DROP CONSTRAINT "MeetingTranscript_meetingId_fkey";

-- DropIndex
DROP INDEX "Lead_funnelStage_idx";

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "funnelStage",
DROP COLUMN "score",
DROP COLUMN "value",
ADD COLUMN     "customProductNames" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropTable
DROP TABLE "Meeting";

-- DropTable
DROP TABLE "MeetingParticipant";

-- DropTable
DROP TABLE "MeetingRecording";

-- DropTable
DROP TABLE "MeetingSummary";

-- DropTable
DROP TABLE "MeetingTranscript";

-- DropEnum
DROP TYPE "FunnelStage";

-- DropEnum
DROP TYPE "MeetingStatus";

-- DropEnum
DROP TYPE "MeetingType";
