import { describe, it, expect } from 'vitest'
import {
  salesClientFormSchema,
  salesClientLineSchema,
  salesFormSchema,
  otherProductNameError,
  PAYMENT_STATUS_LABEL,
} from './sales-schema'
import { OTHER_PRODUCT_SENTINEL } from './sales-money'

function line(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    productId: 'prod_1',
    otherProductName: '',
    unit: '',
    quantity: 2,
    unitPrice: 100,
    amountPaid: 0,
    paymentStatus: 'PENDING',
    hsnCode: '',
    gstRate: 0,
    freightAmount: 0,
    leadTimeDays: 0,
    advanceAmount: 0,
    pdcAmount: 0,
    paymentMode: '',
    purchaseOrderNo: '',
    ...overrides,
  }
}

function clientLine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    productId: 'prod_1',
    otherProductName: '',
    unit: '',
    quantity: '2',
    unitPrice: '100',
    amountPaid: '0',
    paymentStatus: 'PENDING',
    hsnCode: '',
    gstRate: '0',
    freightAmount: '0',
    leadTimeDays: '0',
    advanceAmount: '0',
    pdcAmount: '0',
    paymentMode: '',
    purchaseOrderNo: '',
    ...overrides,
  }
}

function form(overrides: Record<string, unknown> = {}) {
  return {
    salespersonId: 'user_1',
    customerId: 'comp_1',
    saleDate: '2026-03-01',
    paymentDate: '',
    invoiceNumber: 'INV-1',
    remarks: '',
    moveLeadStage: false,
    lines: [line()],
    ...overrides,
  }
}

describe('salesFormSchema (server)', () => {
  it('accepts a minimal valid sale', () => {
    expect(salesFormSchema.safeParse(form()).success).toBe(true)
  })

  it('rejects a sale with no product lines', () => {
    const result = salesFormSchema.safeParse(form({ lines: [] }))
    expect(result.success).toBe(false)
  })

  it('rejects a blank invoice number', () => {
    const result = salesFormSchema.safeParse(form({ invoiceNumber: '   ' }))
    expect(result.success).toBe(false)
  })

  it('rejects a quantity of zero or less', () => {
    expect(salesFormSchema.safeParse(form({ lines: [line({ quantity: 0 })] })).success).toBe(false)
    expect(salesFormSchema.safeParse(form({ lines: [line({ quantity: -1 })] })).success).toBe(false)
  })

  it('rejects a negative unit price', () => {
    expect(salesFormSchema.safeParse(form({ lines: [line({ unitPrice: -0.01 })] })).success).toBe(false)
  })

  it('rejects paying more than the line total', () => {
    const result = salesFormSchema.safeParse(
      form({ lines: [line({ quantity: 1, unitPrice: 100, amountPaid: 150, paymentStatus: 'PAID' })] })
    )
    expect(result.success).toBe(false)
  })

  it('rejects a payment status that contradicts total and amount paid', () => {
    const result = salesFormSchema.safeParse(
      form({ lines: [line({ quantity: 1, unitPrice: 100, amountPaid: 0, paymentStatus: 'PAID' })] })
    )
    expect(result.success).toBe(false)
  })

  it('requires exactly one of catalog product or typed "Other" name', () => {
    expect(
      salesFormSchema.safeParse(form({ lines: [line({ productId: '', otherProductName: '' })] })).success
    ).toBe(false)

    expect(
      salesFormSchema.safeParse(
        form({ lines: [line({ productId: 'prod_1', otherProductName: 'Curcumin' })] })
      ).success
    ).toBe(false)

    expect(
      salesFormSchema.safeParse(
        form({
          // A payment was recorded, so the payment date is now required too.
          paymentDate: '2026-03-02',
          lines: [line({ productId: '', otherProductName: 'Curcumin', unit: 'pcs', quantity: 2, unitPrice: 10, amountPaid: 20, paymentStatus: 'PAID' })],
        })
      ).success
    ).toBe(true)
  })

  it('treats the "Other" sentinel as requiring a typed name', () => {
    const result = salesFormSchema.safeParse(
      form({ lines: [line({ productId: OTHER_PRODUCT_SENTINEL, otherProductName: '' })] })
    )
    expect(result.success).toBe(false)
  })
})

describe('payment date rules (shared by both schemas)', () => {
  const paidLines = [line({ quantity: 1, unitPrice: 100, amountPaid: 50, paymentStatus: 'PARTIALLY_PAID' })]

  it('is optional when nothing was paid', () => {
    expect(salesFormSchema.safeParse(form({ paymentDate: '' })).success).toBe(true)
  })

  it('is REQUIRED once a payment is recorded', () => {
    const result = salesFormSchema.safeParse(form({ lines: paidLines, paymentDate: '' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'paymentDate')).toBe(true)
    }
  })

  it('is rejected when it precedes the sale date', () => {
    const result = salesFormSchema.safeParse(
      form({ saleDate: '2026-03-10', lines: paidLines, paymentDate: '2026-03-01' })
    )
    expect(result.success).toBe(false)
  })

  it('is rejected when no payment was recorded but a date was entered', () => {
    expect(salesFormSchema.safeParse(form({ paymentDate: '2026-03-02' })).success).toBe(false)
  })

  it('is accepted on or after the sale date', () => {
    expect(
      salesFormSchema.safeParse(form({ saleDate: '2026-03-01', lines: paidLines, paymentDate: '2026-03-01' }))
        .success
    ).toBe(true)
  })
})

describe('moveLeadStage coercion', () => {
  it('accepts a real boolean', () => {
    expect(salesFormSchema.safeParse(form({ moveLeadStage: true })).success).toBe(true)
  })

  it('treats the string "false" as FALSE, not as truthy "true"', () => {
    const result = salesFormSchema.safeParse(form({ moveLeadStage: 'false' }))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.moveLeadStage).toBe(false)
    }
  })
})

describe('salesClientLineSchema (browser twin)', () => {
  it('accepts the string shape produced by <input type="number">', () => {
    const result = salesClientLineSchema.safeParse(clientLine())
    expect(result.success).toBe(true)
  })

  it('rejects a BLANK quantity, which would otherwise pass as a valid line', () => {
    const result = salesClientLineSchema.safeParse(clientLine({ quantity: '' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'quantity')).toBe(true)
    }
  })

  it('rejects a BLANK unit price rather than silently pricing the line at zero', () => {
    const result = salesClientLineSchema.safeParse(clientLine({ unitPrice: '' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'unitPrice')).toBe(true)
    }
  })

  it('accepts an explicit zero unit price for a free item', () => {
    const result = salesClientLineSchema.safeParse(clientLine({ unitPrice: '0' }))
    expect(result.success).toBe(true)
  })

  it('treats a blank amount paid as zero and still demands PENDING', () => {
    expect(
      salesClientLineSchema.safeParse(clientLine({ amountPaid: '' })).success
    ).toBe(true)

    expect(
      salesClientLineSchema.safeParse(clientLine({ amountPaid: '', paymentStatus: 'PAID' })).success
    ).toBe(false)
  })

  it('rejects non-numeric text', () => {
    const result = salesClientLineSchema.safeParse(clientLine({ quantity: 'ten' }))
    expect(result.success).toBe(false)
  })
})

describe('browser and server schemas agree on the payment date rule', () => {
  const paidClientLines = [
    clientLine({
      quantity: '1',
      unitPrice: '100',
      amountPaid: '50',
      paymentStatus: 'PARTIALLY_PAID',
    }),
  ]

  it('both reject a paid sale with no payment date', () => {
    const server = salesFormSchema.safeParse(
      form({
        lines: [line({ quantity: 1, unitPrice: 100, amountPaid: 50, paymentStatus: 'PARTIALLY_PAID' })],
        paymentDate: '',
      })
    )
    const browser = salesClientFormSchema.safeParse({
      salespersonId: 'user_1',
      customer: { id: 'comp_1', name: 'Acme' },
      saleDate: '2026-03-01',
      paymentDate: '',
      invoiceNumber: 'INV-1',
      remarks: '',
      moveLeadStage: false,
      lines: paidClientLines,
    })
    expect(server.success).toBe(false)
    expect(browser.success).toBe(false)
  })

  it('both reject a payment date before the sale date', () => {
    const server = salesFormSchema.safeParse(
      form({
        saleDate: '2026-03-10',
        lines: [line({ quantity: 1, unitPrice: 100, amountPaid: 50, paymentStatus: 'PARTIALLY_PAID' })],
        paymentDate: '2026-03-01',
      })
    )
    const browser = salesClientFormSchema.safeParse({
      salespersonId: 'user_1',
      customer: { id: 'comp_1', name: 'Acme' },
      saleDate: '2026-03-10',
      paymentDate: '2026-03-01',
      invoiceNumber: 'INV-1',
      remarks: '',
      moveLeadStage: false,
      lines: paidClientLines,
    })
    expect(server.success).toBe(false)
    expect(browser.success).toBe(false)
  })

  it('both accept the same paid sale with a payment date', () => {
    const server = salesFormSchema.safeParse(
      form({
        lines: [line({ quantity: 1, unitPrice: 100, amountPaid: 50, paymentStatus: 'PARTIALLY_PAID' })],
        paymentDate: '2026-03-05',
      })
    )
    const browser = salesClientFormSchema.safeParse({
      salespersonId: 'user_1',
      customer: { id: 'comp_1', name: 'Acme' },
      saleDate: '2026-03-01',
      paymentDate: '2026-03-05',
      invoiceNumber: 'INV-1',
      remarks: '',
      moveLeadStage: false,
      lines: paidClientLines,
    })
    expect(server.success).toBe(true)
    expect(browser.success).toBe(true)
  })
})

describe('salesClientFormSchema (browser)', () => {
  it('requires a picked customer', () => {
    const result = salesClientFormSchema.safeParse({
      salespersonId: 'user_1',
      customer: null,
      saleDate: '2026-03-01',
      paymentDate: '',
      invoiceNumber: 'INV-1',
      remarks: '',
      moveLeadStage: false,
      lines: [clientLine({ quantity: '1', unitPrice: '10' })],
    })
    expect(result.success).toBe(false)
  })
})

describe('otherProductNameError', () => {
  it('mirrors the "Other" name rule used by the server schema', () => {
    expect(otherProductNameError('')).toBe('Enter the product name')
    expect(otherProductNameError('   ')).toBe('Enter the product name')
    expect(otherProductNameError('x'.repeat(121))).toBe('Max 120 characters')
    expect(otherProductNameError('Curcumin')).toBeUndefined()
  })
})

describe('PAYMENT_STATUS_LABEL', () => {
  it('labels every status once, for badges, selects and exports', () => {
    expect(Object.keys(PAYMENT_STATUS_LABEL).sort()).toEqual(['PAID', 'PARTIALLY_PAID', 'PENDING'])
  })
})