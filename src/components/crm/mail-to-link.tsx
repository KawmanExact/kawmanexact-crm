'use client'

import type { ReactNode } from 'react'
import { zohoMailComposeUrl } from '@/lib/zoho-mail'

interface MailToLinkProps {
  email: string
  children?: ReactNode
  className?: string
  title?: string
  subject?: string
  body?: string
}

/**
 * Renders an email address as a clickable link that opens Zoho Mail's
 * compose window (in a new tab) with the recipient pre-filled.
 *
 * Falls back to plain text when no email is provided.
 */
export function MailToLink({
  email,
  children,
  className,
  title,
  subject,
  body,
}: MailToLinkProps) {
  if (!email) {
    return <span className={className ?? ''}>{children ?? ''}</span>
  }

  const href = zohoMailComposeUrl(email, { subject, body })

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title ?? email}
    >
      {children ?? email}
    </a>
  )
}
