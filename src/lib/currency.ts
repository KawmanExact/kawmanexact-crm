/**
 * Compact currency formatting shared by the dashboard service (server) and
 * dashboard cards (client). Rupee-based, matching the India-focused CRM:
 * 1,000 -> ₹1K, 1,00,000 -> ₹1L, 1,0,00,000 -> ₹1Cr.
 */
export function formatCompactCurrency(amount: number): string {
  if (amount >= 10_000_000) return '₹' + (amount / 10_000_000).toFixed(1) + 'Cr'
  if (amount >= 100_000) return '₹' + (amount / 100_000).toFixed(1) + 'L'
  if (amount >= 1_000) return '₹' + (amount / 1_000).toFixed(1) + 'K'
  return '₹' + amount
}
