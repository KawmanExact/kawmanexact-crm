import { describe, it, expect } from 'vitest'
import { normalizeProductText, splitNameAndVariant } from './product.service'

describe('normalizeProductText', () => {
  it('trims a value and keeps it', () => {
    expect(normalizeProductText('  CarniExAct ')).toBe('CarniExAct')
  })

  it('maps every empty-ish value to null', () => {
    // Postgres treats NULLs as distinct in a unique index, so an empty string
    // must never be stored as if it were a real variant.
    expect(normalizeProductText('')).toBeNull()
    expect(normalizeProductText('   ')).toBeNull()
    expect(normalizeProductText(null)).toBeNull()
    expect(normalizeProductText(undefined)).toBeNull()
  })

  it('does not alter case, so the stored name matches what the user typed', () => {
    expect(normalizeProductText('BranChExAct')).toBe('BranChExAct')
  })
})

describe('splitNameAndVariant', () => {
  it('splits a trailing grade into the variant', () => {
    expect(splitNameAndVariant('AlphaExAct 1% RD')).toEqual({
      name: 'AlphaExAct 1%',
      variant: 'RD',
    })
  })

  it('splits a bare grade suffix', () => {
    expect(splitNameAndVariant('BranChExAct RD')).toEqual({
      name: 'BranChExAct',
      variant: 'RD',
    })
  })

  it('is case-insensitive about the grade suffix', () => {
    expect(splitNameAndVariant('AlphaExAct wd')).toEqual({
      name: 'AlphaExAct',
      variant: 'wd',
    })
  })

  it('leaves a name with no known grade suffix alone', () => {
    expect(splitNameAndVariant('Curcumin 95%')).toEqual({
      name: 'Curcumin 95%',
      variant: null,
    })
  })

  it('does not split a word that merely ends in the letters', () => {
    // "Brewed" ends in "wd" only as part of a longer token — the regex requires
    // a whitespace boundary, so it must not be mistaken for a grade.
    expect(splitNameAndVariant('Cold Brewed')).toEqual({
      name: 'Cold Brewed',
      variant: null,
    })
  })

  it('trims the input first', () => {
    expect(splitNameAndVariant('  CarniExAct  ')).toEqual({ name: 'CarniExAct', variant: null })
  })
})