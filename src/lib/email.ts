import 'server-only'

/**
 * Transactional email, abstracted behind one function so call sites never
 * need to know which provider is behind it (audit: "Add Email Service").
 *
 * Provider: SMTP via nodemailer. A single transporter is lazily created
 * and cached for the lifetime of the process. Configure with SMTP_HOST,
 * SMTP_PORT (default 465 — 465 = implicit TLS, 587 = STARTTLS),
 * SMTP_USER, SMTP_PASS and EMAIL_FROM; see .env.example.
 *
 * Fallback: if the SMTP_* vars are missing, emails are logged to the server
 * console instead of failing outright, so every flow that sends mail
 * (password reset, user invites) stays fully testable in dev without an
 * account or without the send actually reaching an address that may not
 * exist.
 */

import nodemailer, { type Transporter } from 'nodemailer'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  /** Plain-text fallback; auto-derived from html (very roughly) if omitted. */
  text?: string
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM)
}

let cachedTransporter: Transporter | null = null

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  const port = Number(process.env.SMTP_PORT || 465)
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user, pass },
  })
  return cachedTransporter
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Send email directly (synchronous)
 * Use for immediate sends like password reset
 */
export async function sendEmail(input: SendEmailInput): Promise<{ delivered: boolean }> {
  const transporter = getTransporter()
  const from = process.env.EMAIL_FROM

  if (!transporter || !from) {
    const missing = [
      !process.env.SMTP_HOST && 'SMTP_HOST',
      !process.env.SMTP_USER && 'SMTP_USER',
      !process.env.SMTP_PASS && 'SMTP_PASS',
      !from && 'EMAIL_FROM',
    ]
      .filter(Boolean)
      .join(', ')
    // Verbose in dev so the missing-config mode is impossible to miss
    console.warn(
      `[email:dev] ✗ NOT SENT — missing ${missing}. To: ${input.to} | Subject: "${input.subject}" | Mode: dev-log (set SMTP_* + EMAIL_FROM to actually deliver).`
    )
    return { delivered: false }
  }

  try {
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
    })
    console.log(`[email] ✓ Sent via SMTP | To: ${input.to} | Subject: "${input.subject}"`)
    return { delivered: true }
  } catch (err) {
    console.error(
      `[email] ✗ SMTP send failed: ${err instanceof Error ? err.message : String(err)} | To: ${input.to} | Subject: "${input.subject}"`
    )
    return { delivered: false }
  }
}

// ============================================================
// Template System — using React-style templates in templates/
// ============================================================

// Re-export templates
export {
  PasswordResetTemplate,
  UserInviteTemplate,
  LeadAssignedTemplate,
  DealStageChangedTemplate,
  MeetingReminderTemplate,
  DailyReportReminderTemplate,
  FieldVisitAssignedTemplate,
  AIReportReadyTemplate,
  FileSharedTemplate,
  MentionNotificationTemplate,
} from './email/templates'

// Re-export types
export type {
  PasswordResetTemplateProps,
  UserInviteTemplateProps,
  LeadAssignedTemplateProps,
  DealStageChangedTemplateProps,
  MeetingReminderTemplateProps,
  DailyReportReminderTemplateProps,
  FieldVisitAssignedTemplateProps,
  AIReportReadyTemplateProps,
  FileSharedTemplateProps,
  MentionNotificationTemplateProps,
} from './email/templates'

// ============================================================
// High-level email functions (use templates + sendEmail)
// ============================================================

import { PasswordResetTemplate } from './email/templates/password-reset'
import { UserInviteTemplate } from './email/templates/user-invite'

export async function sendPasswordResetEmail(to: string, resetUrl: string, userName?: string) {
  const { html, text } = PasswordResetTemplate({ resetUrl, userName })
  return sendEmail({ to, subject: 'Reset your Kawman ExAct password', html, text })
}

export async function sendUserInviteEmail(
  to: string,
  name: string,
  tempPassword: string,
  loginUrl: string,
  organizationName: string,
  invitedByName?: string
) {
  const { html, text } = UserInviteTemplate({
    loginUrl,
    userName: name,
    tempPassword,
    organizationName,
    invitedByName,
  })
  return sendEmail({ to, subject: `Welcome to ${organizationName}`, html, text })
}
