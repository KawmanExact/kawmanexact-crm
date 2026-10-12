-- Add purposeMeta JSON column to FieldVisit to store structured product data
-- (productIds array and purposeOther text) without changing existing columns.

-- AlterTable
ALTER TABLE "FieldVisit" ADD COLUMN "purposeMeta" JSONB;