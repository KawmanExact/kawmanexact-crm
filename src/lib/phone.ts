import type { CountryCode } from 'libphonenumber-js'
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

/** Country assumed for numbers that carry no country code (national format). */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'IN'

/**
 * Normalise a phone/mobile value to E.164 (+{country_code}{number}) for any
 * country, falling back to the original trimmed value when it can't be parsed.
 *
 * Candidates (first that parses AND validates wins):
 *  1. v starts with "+":   parsed as-is (already international).
 *  2. v starts with "00":  "00" international dial prefix -> "+" + remainder.
 *  3. Otherwise:
 *     a. parsed as a national number of `defaultCountry`;
 *  4. International number that lost its leading "+" (digits only).
 * Never guesses: unparseable values are returned unchanged (no leading-zero
 * landlines, no foreign numbers, no spaces/dashes, no empty).
 * Idempotent: withCountryCode(withCountryCode(x)) === withCountryCode(x).
 */
export function withCountryCode(value: string, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY): string {
  const v = value.trim()
  if (v === '') return v

  // 1. Already international.
  if (v.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(v)
    if (parsed?.isValid()) return parsed.number
  }

  // 2. "00" international dial prefix.
  if (v.startsWith('00')) {
    const parsed = parsePhoneNumberFromString('+' + v.slice(2))
    if (parsed?.isValid()) return parsed.number
  }

  // 3. National format of the default country.
  {
    const parsed = parsePhoneNumberFromString(v, defaultCountry)
    if (parsed?.isValid()) return parsed.number
  }

  // 4. International number that lost its leading "+" (digits only).
  {
    const parsed = parsePhoneNumberFromString('+' + v.replace(/\D/g, ''))
    if (parsed?.isValid()) return parsed.number
  }

  return v
}
