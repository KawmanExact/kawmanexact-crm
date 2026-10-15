-- Phase 1: Add optional secondary phone/email fields across Contact, Company, and Deal.
-- All columns are nullable — existing rows get NULL and no data changes.
-- email2 is never part of the unique constraint (@@unique on emailKey only).

-- Contact: second mobile + second email
ALTER TABLE "Contact" ADD COLUMN "mobile2" TEXT;
ALTER TABLE "Contact" ADD COLUMN "email2" TEXT;

-- Company: second phone + second email
ALTER TABLE "Company" ADD COLUMN "phone2" TEXT;
ALTER TABLE "Company" ADD COLUMN "email2" TEXT;

-- Deal: second phone + second email
ALTER TABLE "Deal" ADD COLUMN "phone2" TEXT;
ALTER TABLE "Deal" ADD COLUMN "email2" TEXT;
