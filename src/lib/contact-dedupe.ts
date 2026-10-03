/**
 * Contact de-duplication helpers.
 *
 * A contact is considered a DUPLICATE when another contact in the SAME
 * organization shares the same email (after normalisation — trim + lowercase).
 * Phone and mobile values are NOT part of the uniqueness rule.
 *
 * Normalisation is captured in a single `emailKey` column so that Postgres
 * NULL semantics work in our favour: when the email is empty/whitespace the
 * key is NULL (many NULLs allowed), so contacts without an email are never
 * blocked.
 *
 * No `server-only` marker — these are pure functions usable from tests and
 * the backfill script alike.
 */

/** Trim + lower-case an email address. Returns '' for empty/null/undefined. */
export function normalizeEmail(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (trimmed === '') return ''
  return trimmed.toLowerCase()
}

/**
 * Build the canonical email dedupe key for a contact.
 *
 * Returns the trimmed + lower-cased email, or `null` when the email is
 * empty/null/whitespace. The `@@unique([organizationId, emailKey])` index treats
 * NULLs as distinct, so contacts without an email are never blocked.
 */
export function buildContactEmailKey(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email)
  return normalized || null
}

/**
 * Error message returned when a duplicate email is detected.
 * Names the existing contact so the user can identify the conflict.
 */
export function duplicateContactEmailMessage(existingContactName: string): string {
  return `A contact with this email already exists (${existingContactName}).`
}
