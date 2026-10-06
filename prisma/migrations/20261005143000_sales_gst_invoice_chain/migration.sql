-- Link the sale's money chain together: taxable value -> GST -> freight ->
-- invoice amount -> advance / PDC -> balance.
--
-- Until now GST, advance, PDC and freight were stored but never added up, so
-- `balanceAmount` was computed against the pre-GST line total and an invoice
-- could read as fully paid while GST and freight were still outstanding. These
-- columns make each step of the chain a real, queryable fact.
--
-- gstAmount and invoiceAmount are derived columns — they are written by the
-- server action on every save, never accepted from the client.

-- AlterTable
ALTER TABLE "SalesTransaction" ADD COLUMN     "gstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Backfill existing rows so the new columns are meaningful immediately rather
-- than reading 0 for every historical sale.
--
-- Rows entered before the GST/HSN fields existed have gstRate and freightAmount
-- NULL, so COALESCE leaves their GST at 0 and their invoice amount equal to the
-- taxable total — exactly the pre-change behaviour, so no historical report
-- shifts. Rows that do carry a rate get it applied retroactively.
UPDATE "SalesTransaction"
SET "gstAmount" = ROUND(
      ("totalAmount" * COALESCE("gstRate", 0)) / 100,
      2
    ),
    "invoiceAmount" = ROUND(
      "totalAmount"
      + (("totalAmount" * COALESCE("gstRate", 0)) / 100)
      + COALESCE("freightAmount", 0),
      2
    );

-- `invoiceAmount` is the figure the balance and payment status are derived from,
-- so every report grouping or filtering by it benefits from an index.
CREATE INDEX "SalesTransaction_invoiceAmount_idx" ON "SalesTransaction"("invoiceAmount");

-- Advances already collected and PDCs already promised are the two figures an
-- accountant reconciles against; index them alongside the balance.
CREATE INDEX "SalesTransaction_advanceAmount_idx" ON "SalesTransaction"("advanceAmount");
CREATE INDEX "SalesTransaction_pdcAmount_idx" ON "SalesTransaction"("pdcAmount");