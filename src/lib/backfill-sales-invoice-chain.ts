import { prisma } from '@/lib/db'
import { deriveLineMoneyDetail } from '@/lib/sales-money'

/**
 * Recompute the derived money columns (`gstAmount`, `invoiceAmount`,
 * `balanceAmount`, `paymentStatus`) for every SalesTransaction row.
 *
 * The migration that added gstAmount/invoiceAmount backfilled them with plain
 * SQL, which leaves two problems behind: a row whose stored balance was computed
 * against the pre-GST total is still internally inconsistent, and a row saved
 * before the GST/HSN fields existed was never re-derived after being edited.
 * This pass runs the real calculation — the same function the form and the save
 * action use — so DB, screen and export all agree.
 *
 * Idempotent: a row already matching the derived values is left untouched, so
 * re-running is a no-op. Touches nothing else, and is safe to run mid-week.
 *
 * Run with: npx tsx src/lib/backfill-sales-invoice-chain.ts
 */
export async function backfillSalesInvoiceChain(): Promise<{
  scanned: number
  updated: number
}> {
  const rows = await prisma.salesTransaction.findMany({
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      totalAmount: true,
      gstRate: true,
      gstAmount: true,
      freightAmount: true,
      invoiceAmount: true,
      amountPaid: true,
      balanceAmount: true,
      paymentStatus: true,
      advanceAmount: true,
      pdcAmount: true,
    },
  })

  let updated = 0

  for (const row of rows) {
    const money = deriveLineMoneyDetail({
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      gstRate: row.gstRate,
      freightAmount: row.freightAmount,
      advanceAmount: row.advanceAmount,
      pdcAmount: row.pdcAmount,
      amountPaid: row.amountPaid,
    })

    const alreadyCorrect =
      row.gstAmount.equals(money.gstAmount) &&
      row.invoiceAmount.equals(money.invoiceAmount) &&
      row.balanceAmount.equals(money.balanceAmount) &&
      row.paymentStatus === money.paymentStatus
    if (alreadyCorrect) continue

    await prisma.salesTransaction.update({
      where: { id: row.id },
      data: {
        gstAmount: money.gstAmount,
        invoiceAmount: money.invoiceAmount,
        balanceAmount: money.balanceAmount,
        paymentStatus: money.paymentStatus,
      },
    })
    updated += 1
  }

  return { scanned: rows.length, updated }
}

if (require.main === module) {
  backfillSalesInvoiceChain()
    .then(({ scanned, updated }) => {
      console.log(`Invoice-chain backfill complete: ${updated} of ${scanned} row(s) updated`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Invoice-chain backfill failed:', err)
      process.exit(1)
    })
}