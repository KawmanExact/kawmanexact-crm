import 'server-only'
import { BaseTemplate, TextTemplate } from './base'

export interface DailyReportReminderTemplateProps {
  userName: string
  date: Date
  reportUrl: string
  organizationName: string
  isDraft?: boolean
}

export function DailyReportReminderTemplate({
  userName,
  date,
  reportUrl,
  organizationName,
  isDraft = false,
}: DailyReportReminderTemplateProps): { html: string; text: string } {
  const formatDate = (date: Date) => date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const html = BaseTemplate({
    title: isDraft ? 'Complete Your Daily Report' : 'Daily Report Reminder',
    preheader: `Don't forget to submit your daily report for ${formatDate(date)}`,
    children: `
      <p>Hi ${userName},</p>
      <p>${isDraft ? 'You have a draft daily report' : "It's time to submit your daily report"} for <strong>${formatDate(date)}</strong> in <strong>${organizationName}</strong>.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; font-size: 15px;"><strong>Date:</strong> ${formatDate(date)}</p>
        <p style="margin: 0; font-size: 14px; color: #64748b;">${isDraft ? 'Resume your draft and submit' : 'Log your activities, meetings, and achievements'}</p>
      </div>
      
      <p>${isDraft ? 'Your draft is waiting - pick up where you left off.' : 'Daily reports help your team stay aligned and track progress. Takes just a few minutes.'}</p>
    `,
    cta: {
      text: isDraft ? 'Continue Draft' : 'Submit Report',
      url: reportUrl,
    },
  })

  const text = TextTemplate({
    title: isDraft ? 'Complete Your Daily Report' : 'Daily Report Reminder',
    children: `Hi ${userName},\n\n${isDraft ? 'You have a draft daily report' : "It's time to submit your daily report"} for ${formatDate(date)} in ${organizationName}.\n\n${isDraft ? 'Your draft is waiting - pick up where you left off.' : 'Daily reports help your team stay aligned and track progress.'}`,
    cta: {
      text: isDraft ? 'Continue Draft' : 'Submit Report',
      url: reportUrl,
    },
  })

  return { html, text }
}