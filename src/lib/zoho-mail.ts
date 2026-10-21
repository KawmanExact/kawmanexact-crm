/**
 * Zoho Mail web compose URL builder.
 *
 * Clicking an email address in the CRM opens Zoho Mail's compose window (the
 * desktop web app) in a new tab with the recipient pre-filled. The base URL
 * is configurable via `NEXT_PUBLIC_ZOHO_MAIL_URL` (e.g. https://mail.zoho.in
 * for the Indian data center or https://mail.zoho.com for the US data center)
 * and defaults to https://mail.zoho.in to match the rest of the Zoho
 * integration.
 */
export function zohoMailComposeUrl(
  to: string,
  options?: { subject?: string; body?: string }
): string {
  if (!to) return ''

  const base =
    (process.env.NEXT_PUBLIC_ZOHO_MAIL_URL || 'https://mail.zoho.in').replace(/\/+$/, '')

  const params = new URLSearchParams()
  params.set('to', to)
  if (options?.subject) params.set('subject', options.subject)
  if (options?.body) params.set('body', options.body)

  return `${base}/mail/xb/new/compose?${params.toString()}`
}
