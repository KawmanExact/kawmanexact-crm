-- Backfill closedAt for deals that were WON or LOST at creation/update
-- but had closedAt left NULL (before createDealAction started setting it).
-- Uses the deal's createdAt as a reasonable approximation of when it was won/lost.

UPDATE "Deal"
SET "closedAt" = "createdAt"
WHERE "stage" IN ('WON', 'LOST')
  AND "closedAt" IS NULL;
