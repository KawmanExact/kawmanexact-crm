import 'server-only'
import { BaseTemplate, TextTemplate } from './base'

export interface PasswordResetTemplateProps {
  resetUrl: string
  userName?: string
  expiresInHours?: number
}

export function PasswordResetTemplate({
  resetUrl,
  userName,
  expiresInHours = 1,
}: PasswordResetTemplateProps): { html: string; text: string } {
  const greeting = userName ? `Hi ${userName},` : 'Hello,'

  const html = BaseTemplate({
    title: 'Reset your password',
    preheader: 'Your password reset link expires in 1 hour',
    children: `
      <p>${greeting}</p>
      <p>We received a request to reset your password for your Kawman ExAct account. This link expires in ${expiresInHours} hour${expiresInHours > 1 ? 's' : ''}.</p>
      <p>If you didn't request this, you can safely ignore this email. Your password won't change until you click the link below and create a new one.</p>
    `,
    cta: {
      text: 'Reset Password',
      url: resetUrl,
    },
    footer: 'This link will expire for security reasons. If you need a new one, please request another password reset.',
  })

  const text = TextTemplate({
    title: 'Reset your Kawman ExAct password',
    children: `${greeting}\n\nWe received a request to reset your password. This link expires in ${expiresInHours} hour${expiresInHours > 1 ? 's' : ''}.\n\nIf you didn't request this, you can safely ignore this email.`,
    cta: {
      text: 'Reset Password',
      url: resetUrl,
    },
  })

  return { html, text }
}