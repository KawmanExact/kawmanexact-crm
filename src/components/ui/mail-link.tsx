'use client'

import type { ReactNode } from 'react'

interface MailLinkProps {
  email: string | null | undefined
  className?: string
  children?: ReactNode
  subject?: string
  body?: string
}

/**
 * Renders an email address as a clickable `mailto:` link that opens the
 * user's default desktop mail app (e.g. Zoho Mail desktop).
 *
 * When the email is empty, null, `"—"` or whitespace, renders `"—"` as
 * plain text instead of a link.
 */
export function MailLink({ email, className, children, subject, body }: MailLinkProps) {
  if (!email || email === '—' || email.trim() === '') {
    return <span className={className ?? ''}>—</span>
  }

  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (body) params.set('body', body)
  const query = params.toString()
  const href = query ? `mailto:${email}?${query}` : `mailto:${email}`

  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      className={[
        'text-current',
        'hover:text-white/70',
        'hover:underline',
        'break-all',
        'min-w-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title={email}
    >
      {children ?? email}
    </a>
  )
}
