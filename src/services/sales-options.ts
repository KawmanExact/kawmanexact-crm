import 'server-only'
import { requireApiSession } from '@/lib/session'
import { getSalespeople } from '@/services/sales.service'
import { getCompanyOptions } from '@/services/company.service'
import { getActiveProductOptions } from '@/services/product.service'
import type { SalesFilterOptions } from '@/components/crm/sales-tracking-view'

/**
 * Option lists for the sales filter bar.
 *
 * `salespeople` is narrowed to just the caller for users without sales.view_all,
 * so the dropdown never offers a filter that can only return zero rows. Server
 * scoping in salesWhereFor still rejects such a filter if the query string is
 * edited by hand — narrowing the list is a usability measure, not the guard.
 */
export async function getSalesFilterOptions(): Promise<{
  options: SalesFilterOptions
  canPickSalesperson: boolean
}> {
  const session = await requireApiSession()
  const permissions = session.user.permissions as string[]
  const canPickSalesperson = permissions.includes('sales.view_all')

  const [allSalespeople, customers, products] = await Promise.all([
    getSalespeople(),
    getCompanyOptions(),
    getActiveProductOptions(),
  ])

  return {
    options: {
      salespeople: canPickSalesperson
        ? allSalespeople
        : allSalespeople.filter((person) => person.id === session.user.id),
      customers,
      products,
    },
    canPickSalesperson,
  }
}