import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma'
import {
  buildInvoiceKey,
  computeBalance,
  computeLineTotal,
  decimalToString,
  derivePaymentStatus,
  isPaymentStatusConsistent,
  otherProductNameIsValid,
  sumMoney,
  sumQuantity,
  toDecimal,
  toDecimalOrZero,
  toMoney,
  toQuantity,
} from './sales-money'

describe('toDecimal', () => {
  it('parses numbers, numeric strings and Decimal instances', () => {
    expect(toDecimal('12.50')?.toFixed()).toBe('12.5')
    expect(toDecimal(3)?.toFixed()).toBe('3')
    expect(toDecimal(new Prisma.Decimal('7.25'))?.toFixed()).toBe('7.25')
  })

  it('returns null for blank, non-numeric and non-finite input', () => {
    expect(toDecimal('')).toBeNull()
    expect(toDecimal('   ')).toBeNull()
    expect(toDecimal(null)).toBeNull()
    expect(toDecimal(undefined)).toBeNull()
    expect(toDecimal('abc')).toBeNull()
    expect(toDecimal('12abc')).toBeNull()
    expect(toDecimal(Number.NaN)).toBeNull()
    expect(toDecimal(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('toDecimalOrZero falls back to zero instead of null', () => {
    expect(toDecimalOrZero('nope').toFixed()).toBe('0')
    expect(toDecimalOrZero(undefined).toFixed()).toBe('0')
  })
})

describe('computeLineTotal', () => {
  it('multiplies quantity by unit price at the money scale', () => {
    expect(computeLineTotal('2', '15.50').toFixed()).toBe('31')
    expect(computeLineTotal(1.5, 100).toFixed()).toBe('150')
  })

  it('avoids binary float drift by using Decimal, not floats', () => {
    // 0.1 * 3 in raw JS is 0.30000000000000004.
    expect(computeLineTotal(0.1, 3).toFixed()).toBe('0.3')
  })

  it('rounds half-up to two decimals', () => {
    expect(computeLineTotal('3', '0.125').toFixed()).toBe('0.38')
    expect(computeLineTotal('2', '1.005').toFixed()).toBe('2.01')
  })

  it('treats missing inputs as zero rather than NaN', () => {
    expect(computeLineTotal(null, undefined).toFixed()).toBe('0')
  })
})

describe('computeBalance', () => {
  it('is total minus amount paid', () => {
    expect(computeBalance('100', '40').toFixed()).toBe('60')
  })

  it('never goes below zero', () => {
    expect(computeBalance('100', '150').toFixed()).toBe('0')
  })

  it('is the full total when nothing was paid', () => {
    expect(computeBalance('100', '0').toFixed()).toBe('100')
  })

  it('is zero when the line is fully paid', () => {
    expect(computeBalance('100', '100').toFixed()).toBe('0')
  })
})

describe('derivePaymentStatus', () => {
  it('is PAID when paid equals total', () => {
    expect(derivePaymentStatus('100', '100')).toBe('PAID')
    expect(derivePaymentStatus('100', '150')).toBe('PAID')
  })

  it('is PENDING when nothing has been paid', () => {
    expect(derivePaymentStatus('100', '0')).toBe('PENDING')
  })

  it('is PARTIALLY_PAID strictly between zero and the total', () => {
    expect(derivePaymentStatus('100', '1')).toBe('PARTIALLY_PAID')
    expect(derivePaymentStatus('100', '99.99')).toBe('PARTIALLY_PAID')
  })

  it('treats a zero-total line as PENDING, never PAID', () => {
    expect(derivePaymentStatus('0', '0')).toBe('PENDING')
  })

  it('isPaymentStatusConsistent agrees with the derived value', () => {
    expect(isPaymentStatusConsistent('PAID', '100', '100')).toBe(true)
    expect(isPaymentStatusConsistent('PENDING', '100', '100')).toBe(false)
    expect(isPaymentStatusConsistent('PARTIALLY_PAID', '100', '50')).toBe(true)
  })
})

describe('scale helpers', () => {
  it('toMoney keeps two decimals', () => {
    expect(toMoney('1.005').toFixed()).toBe('1.01')
    expect(toMoney('1.004').toFixed()).toBe('1')
  })

  it('toQuantity keeps three decimals', () => {
    expect(toQuantity('1.23456').toFixed()).toBe('1.235')
  })

  it('sumMoney accumulates in Decimal', () => {
    expect(sumMoney(['0.1', '0.2']).toFixed()).toBe('0.3')
  })

  it('sumQuantity accumulates in Decimal', () => {
    expect(sumQuantity(['1.1', '2.2']).toFixed()).toBe('3.3')
  })

  it('sum helpers treat blanks as zero', () => {
    expect(sumMoney([null, '', '5']).toFixed()).toBe('5')
    expect(sumQuantity([undefined, '5']).toFixed()).toBe('5')
  })
})

describe('decimalToString', () => {
  it('avoids exponent notation', () => {
    expect(decimalToString('10000000')).toBe('10000000')
  })

  it('renders zero as "0"', () => {
    expect(decimalToString('0')).toBe('0')
    expect(decimalToString(null)).toBe('0')
  })
})

describe('buildInvoiceKey', () => {
  it('is case- and whitespace-insensitive so one invoice cannot be entered twice', () => {
    expect(buildInvoiceKey('  INV-01 ')).toBe('inv-01')
    expect(buildInvoiceKey('inv-01')).toBe('inv-01')
  })
})

describe('otherProductNameIsValid', () => {
  it('rejects a blank name', () => {
    expect(otherProductNameIsValid('   ')).toBe('Enter the product name')
    expect(otherProductNameIsValid(null)).toBe('Enter the product name')
  })

  it('rejects a name over 120 characters', () => {
    expect(otherProductNameIsValid('x'.repeat(121))).toBe('Max 120 characters')
  })

  it('accepts a normal name', () => {
    expect(otherProductNameIsValid('Curcumin 95%')).toBeUndefined()
  })
})