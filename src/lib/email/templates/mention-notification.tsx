import 'server-only'
import { BaseTemplate, TextTemplate } from './base'

export interface MentionNotificationTemplateProps {
  mentionedByName: string
  contextType: 'comment' | 'task' | 'note' | 'report'
  contextTitle: string
  contextPreview: string
  contextUrl: string
  organizationName: string
}

export function MentionNotificationTemplate({
  mentionedByName,
  contextType,
  contextTitle,
  contextPreview,
  contextUrl,
  organizationName,
}: MentionNotificationTemplateProps): { html: string; text: string } {
  const typeLabels: Record<string, string> = {
    comment: 'comment',
    task: 'task',
    note: 'note',
    report: 'report',
  }

  const typeLabel = typeLabels[contextType] || contextType

  const html = BaseTemplate({
    title: 'You Were Mentioned',
    preheader: `${mentionedByName} mentioned you in a ${typeLabel}`,
    children: `
      <p>Hi there,</p>
      <p><strong>${mentionedByName}</strong> mentioned you in a <strong>${typeLabel}</strong> in <strong>${organizationName}</strong>.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; font-size: 15px;"><strong>${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}:</strong> ${contextTitle}</p>
        <p style="margin: 0; font-size: 14px; color: #64748b;">${contextPreview}</p>
      </div>
      
      <p>Click below to view the full context and respond.</p>
    `,
    cta: {
      text: 'View Mention',
      url: contextUrl,
    },
  })

  const text = TextTemplate({
    title: 'You Were Mentioned',
    children: `Hi there,\n\n${mentionedByName} mentioned you in a ${typeLabel} in ${organizationName}.\n\n${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}: ${contextTitle}\n${contextPreview}\n\nView the full context to respond.`,
    cta: {
      text: 'View Mention',
      url: contextUrl,
    },
  })

  return { html, text }
}