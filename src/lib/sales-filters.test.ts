import { describe, it, expect } from 'vitest'
import {
  DATE_PRESETS,
  DEFAULT_PAGE_SIZE,
  OTHER_PRODUCTS_FILTER,
  PAGE_SIZES,
  SALES_SORT_KEYS,
  SORT_FIELDS,
  buildSalesOrderBy,
  buildSalesWhere,
  describeSalesFilters,
  financialYearStart,
  formatFilterDate,
  parseSalesFilters,
  resolveDateRange,
  salesFiltersToQuery,
  salesScopeWhere,
} from './sales-filters'

const ORG = 'org_1'
const NOW = new Date(2026, 7, 20, 12, 30, 0) // 20 Aug 2026, local time

describe('parseSalesFilters', () => {
  it('returns no filters for an empty query bag', () => {
    const filters = parseSalesFilters({}, NOW)
    expect(filters.salespersonId).toBeUndefined()
    expect(filters.customerId).toBeUndefined()
    expect(filters.productId).toBeUndefined()
    expect(filters.paymentStatus).toBeUndefined()
    expect(filters.pageSize).toBeUndefined()
  })

  it('accepts valid enum values', () => {
    const filters = parseSalesFilters(
      {
        salesperson: 'user_1',
        customer: 'comp_1',
        product: 'prod_1',
        paymentStatus: 'PARTIALLY_PAID',
        sort: 'amountPaid',
        dir: 'asc',
        page: '3',
        pageSize: '50',
      },
      NOW
    )
    expect(filters.salespersonId).toBe('user_1')
    expect(filters.customerId).toBe('comp_1')
    expect(filters.productId).toBe('prod_1')
    expect(filters.paymentStatus).toBe('PARTIALLY_PAID')
    expect(filters.sort).toBe('amountPaid')
    expect(filters.dir).toBe('asc')
    expect(filters.page).toBe(3)
    expect(filters.pageSize).toBe(50)
  })

  it('DROPS an unknown payment status instead of passing it to the database', () => {
    expect(parseSalesFilters({ paymentStatus: 'REFUNDED' }, NOW).paymentStatus).toBeUndefined()
  })

  it('drops an unknown sort key', () => {
    expect(parseSalesFilters({ sort: 'DROP TABLE' }, NOW).sort).toBeUndefined()
  })

  it('rejects a page size that is not one of the allowed options', () => {
    expect(parseSalesFilters({ pageSize: '9999' }, NOW).pageSize).toBeUndefined()
    expect(PAGE_SIZES).toContain(DEFAULT_PAGE_SIZE)
  })

  it('drops a non-positive or non-numeric page number', () => {
    expect(parseSalesFilters({ page: '0' }, NOW).page).toBeUndefined()
    expect(parseSalesFilters({ page: '-4' }, NOW).page).toBeUndefined()
    expect(parseSalesFilters({ page: 'abc' }, NOW).page).toBeUndefined()
  })

  it('takes the first value when Next.js hands over an array', () => {
    expect(parseSalesFilters({ salesperson: ['user_9', 'user_1'] }, NOW).salespersonId).toBe('user_9')
  })

  it('treats a whitespace-only filter as absent', () => {
    expect(parseSalesFilters({ salesperson: '   ', q: '  ' }, NOW).salespersonId).toBeUndefined()
    expect(parseSalesFilters({ q: '  ' }, NOW).q).toBeUndefined()
  })

  it('keeps the "Other products" sentinel as a product filter', () => {
    expect(parseSalesFilters({ product: OTHER_PRODUCTS_FILTER }, NOW).productId).toBe(OTHER_PRODUCTS_FILTER)
  })
})

describe('resolveDateRange', () => {
  it('covers only today for "today"', () => {
    const { from, to } = resolveDateRange('today', undefined, undefined, NOW)
    expect(from?.getDate()).toBe(20)
    expect(to?.getDate()).toBe(20)
  })

  it('includes today in "last 7 days" (7 distinct calendar days, not 8)', () => {
    const { from, to } = resolveDateRange('last7', undefined, undefined, NOW)
    const distinctDays = new Set(
      Array.from({ length: 8 }, (_, i) => {
        const d = new Date(from!.getFullYear(), from!.getMonth(), from!.getDate() + i)
        return d.toDateString()
      }).filter((day, i, all) => {
        const asDate = new Date(day)
        return asDate.getTime() <= to!.getTime() && all.indexOf(day) === i
      })
    )
    expect(distinctDays.size).toBe(7)
    expect(from!.getDate()).toBe(14)
    expect(to!.getDate()).toBe(20)
  })

  it('thisMonth starts on the 1st', () => {
    const { from } = resolveDateRange('thisMonth', undefined, undefined, NOW)
    expect(from!.getDate()).toBe(1)
    expect(from!.getMonth()).toBe(7)
  })

  it('lastMonth is the previous calendar month, ending on its last day', () => {
    const { from, to } = resolveDateRange('lastMonth', undefined, undefined, NOW)
    expect(from!.getMonth()).toBe(6)
    expect(from!.getDate()).toBe(1)
    expect(to!.getMonth()).toBe(6)
    expect(to!.getDate()).toBe(31)
  })

  it('thisQuarter starts at the beginning of the current quarter', () => {
    const { from } = resolveDateRange('thisQuarter', undefined, undefined, NOW)
    expect(from!.getMonth()).toBe(6)
    expect(from!.getDate()).toBe(1)
  })

  it('thisFY uses the Indian financial year (April start)', () => {
    const { from } = resolveDateRange('thisFY', undefined, undefined, NOW)
    expect(from!.getFullYear()).toBe(2026)
    expect(from!.getMonth()).toBe(3)
    expect(from!.getDate()).toBe(1)
  })

  it('financialYearStart rolls back a year when the date is before April', () => {
    const january = new Date(2026, 0, 15)
    expect(financialYearStart(january).getFullYear()).toBe(2025)
    expect(financialYearStart(january).getMonth()).toBe(3)
  })

  it('custom honours explicit from/to and extends "to" to the end of that day', () => {
    const { from, to } = resolveDateRange('custom', '2026-01-05', '2026-01-07', NOW)
    expect(from!.getDate()).toBe(5)
    expect(to!.getHours()).toBe(23)
    expect(to!.getMinutes()).toBe(59)
  })

  it('ignores unparseable custom dates', () => {
    const { from, to } = resolveDateRange('custom', 'not-a-date', 'also-not', NOW)
    expect(from).toBeUndefined()
    expect(to).toBeUndefined()
  })

  it('applies NO date filter for "all" and for an unknown preset', () => {
    expect(resolveDateRange('all', undefined, undefined, NOW)).toEqual({})
    expect(resolveDateRange(undefined, undefined, undefined, NOW)).toEqual({})
  })

  it('offers every preset a label', () => {
    for (const preset of DATE_PRESETS) expect(preset.length).toBeGreaterThan(0)
  })
})

describe('buildSalesWhere', () => {
  it('always scopes by organisation', () => {
    expect(buildSalesWhere({}, ORG, NOW).organizationId).toBe(ORG)
  })

  it('filters by salesperson, customer and payment status', () => {
    const where = buildSalesWhere(
      { salespersonId: 'u1', customerId: 'c1', paymentStatus: 'PAID' },
      ORG,
      NOW
    )
    expect(where.salespersonId).toBe('u1')
    expect(where.customerId).toBe('c1')
    expect(where.paymentStatus).toBe('PAID')
  })

  it('the "Other products" sentinel becomes productId IS NULL', () => {
    expect(buildSalesWhere({ productId: OTHER_PRODUCTS_FILTER }, ORG, NOW).productId).toBeNull()
  })

  it('a real product id filters by product', () => {
    expect(buildSalesWhere({ productId: 'p1' }, ORG, NOW).productId).toBe('p1')
  })

  it('a date range becomes an inclusive from/to pair', () => {
    const where = buildSalesWhere({ from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) }, ORG, NOW)
    expect(where.saleDate).toEqual({ gte: new Date(2026, 0, 1), lte: new Date(2026, 0, 31) })
  })

  it('search spans invoice number, "Other" name and catalog product name AND variant', () => {
    const where = buildSalesWhere({ q: 'curc' }, ORG, NOW)
    expect(where.OR).toHaveLength(4)
    const serialised = JSON.stringify(where.OR)
    expect(serialised).toContain('invoiceNumber')
    expect(serialised).toContain('otherProductName')
    expect(serialised).toContain('variant')
  })

  it('does not leak an unknown filter into the where clause', () => {
    const where = buildSalesWhere({ q: 'x' } as never, ORG, NOW)
    expect(Object.keys(where).sort()).toEqual(['OR', 'organizationId'])
  })
})

describe('salesScopeWhere', () => {
  it('sales.view_all sees the whole organisation and nothing more', () => {
    expect(salesScopeWhere(ORG, { id: 'u1', permissions: ['sales.view_all'] }, [])).toEqual({
      organizationId: ORG,
    })
  })

  it('without view_all a plain user sees only their own sales', () => {
    expect(salesScopeWhere(ORG, { id: 'u1', permissions: [] }, ['VIEWER'])).toEqual({
      organizationId: ORG,
      salespersonId: 'u1',
    })
  })

  it('a MANAGER is widened to their department when one is set', () => {
    const where = salesScopeWhere(
      ORG,
      { id: 'u1', permissions: [], departmentId: 'dept_1' },
      ['MANAGER']
    )
    expect(where).toEqual({
      organizationId: ORG,
      salesperson: { departmentId: 'dept_1' },
    })
  })

  it('a SALES_MANAGER without a department falls back to OWN, never to the whole org', () => {
    const where = salesScopeWhere(ORG, { id: 'u1', permissions: [], departmentId: null }, [
      'SALES_MANAGER',
    ])
    expect(where.salespersonId).toBe('u1')
  })

  it('always keeps the organisation boundary for every role', () => {
    for (const roles of [[], ['MANAGER'], ['SALES_MANAGER'], ['VIEWER']]) {
      expect(salesScopeWhere(ORG, { id: 'u1', permissions: [] }, roles).organizationId).toBe(ORG)
    }
  })
})

describe('buildSalesOrderBy', () => {
  it('defaults to newest sale date first, with a line-order tiebreaker', () => {
    expect(buildSalesOrderBy({})).toEqual([{ saleDate: 'desc' }, { lineNumber: 'asc' }])
  })

  it('honours an ascending sort', () => {
    expect(buildSalesOrderBy({ sort: 'amountPaid', dir: 'asc' })).toEqual([
      { amountPaid: 'asc' },
      { lineNumber: 'asc' },
    ])
  })

  it('maps every advertised sort key to an order clause', () => {
    for (const key of SALES_SORT_KEYS) {
      expect(buildSalesOrderBy({ sort: key, dir: 'asc' })[0]).toEqual({ [SORT_FIELDS[key]]: 'asc' })
    }
  })

  it('falls back to date order for an unknown key instead of building { undefined }', () => {
    expect(buildSalesOrderBy({ sort: 'nope' as never, dir: 'asc' })).toEqual([
      { saleDate: 'asc' },
      { lineNumber: 'asc' },
    ])
  })
})

describe('describeSalesFilters', () => {
  it('says "None" when nothing is applied', () => {
    expect(describeSalesFilters({}, {})).toEqual([])
  })

  it('uses resolved human labels when available', () => {
    const lines = describeSalesFilters(
      { salespersonId: 'u1', customerId: 'c1', productId: 'p1' },
      { salesperson: 'Priya', customer: 'Acme Ltd', product: 'CarniExAct' }
    )
    expect(lines).toContain('Salesperson: Priya')
    expect(lines).toContain('Customer: Acme Ltd')
    expect(lines).toContain('Product: CarniExAct')
  })

  it('names the "Other products" bucket explicitly', () => {
    expect(describeSalesFilters({ productId: OTHER_PRODUCTS_FILTER }, {})).toContain(
      'Product: Other products'
    )
  })

  it('states the date range so an export can be reconciled against the screen', () => {
    expect(describeSalesFilters({ datePreset: 'last7' }, {})).toEqual(['Date Range: Last 7 days'])
    expect(
      describeSalesFilters(
        { datePreset: 'custom', from: new Date(2026, 0, 5), to: new Date(2026, 0, 7) },
        {}
      )
    ).toEqual(['Date Range: 05 Jan 2026 to 07 Jan 2026'])
  })

  it('includes the search term and the payment status', () => {
    const lines = describeSalesFilters({ q: 'curcumin', paymentStatus: 'PARTIALLY_PAID' }, {})
    expect(lines).toContain('Search: curcumin')
    expect(lines).toContain('Payment Status: PARTIALLY PAID')
  })
})

describe('salesFiltersToQuery', () => {
  it('round-trips the filters it serialises', () => {
    const filters = parseSalesFilters(
      {
        salesperson: 'u1',
        customer: 'c1',
        product: 'p1',
        paymentStatus: 'PAID',
        date: 'last7',
        q: 'abc',
        sort: 'totalAmount',
        dir: 'asc',
        page: '2',
        pageSize: '50',
      },
      NOW
    )
    const roundTripped = parseSalesFilters(
      Object.fromEntries(new URLSearchParams(salesFiltersToQuery(filters)).entries()),
      NOW
    )
    expect(roundTripped.salespersonId).toBe('u1')
    expect(roundTripped.customerId).toBe('c1')
    expect(roundTripped.productId).toBe('p1')
    expect(roundTripped.paymentStatus).toBe('PAID')
    expect(roundTripped.datePreset).toBe('last7')
    expect(roundTripped.q).toBe('abc')
    expect(roundTripped.sort).toBe('totalAmount')
    expect(roundTripped.dir).toBe('asc')
    expect(roundTripped.page).toBe(2)
    expect(roundTripped.pageSize).toBe(50)
  })
})

describe('formatFilterDate', () => {
  it('formats as day-month-year', () => {
    expect(formatFilterDate(new Date(2026, 0, 5))).toBe('05 Jan 2026')
  })
})