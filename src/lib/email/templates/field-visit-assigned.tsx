import 'server-only'
import { BaseTemplate, TextTemplate } from './base'

export interface FieldVisitAssignedTemplateProps {
  visitTitle: string
  companyName: string
  address: string
  scheduledAt: Date
  assignedByName: string
  visitUrl: string
  organizationName: string
}

export function FieldVisitAssignedTemplate({
  visitTitle,
  companyName,
  address,
  scheduledAt,
  assignedByName,
  visitUrl,
  organizationName,
}: FieldVisitAssignedTemplateProps): { html: string; text: string } {
  const formatDateTime = (date: Date) => date.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  const html = BaseTemplate({
    title: 'Field Visit Assigned',
    preheader: `${assignedByName} assigned you a visit to ${companyName}`,
    children: `
      <p>Hi there,</p>
      <p><strong>${assignedByName}</strong> has assigned you a field visit in <strong>${organizationName}</strong>.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; font-size: 15px;"><strong>Visit:</strong> ${visitTitle}</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Company:</strong> ${companyName}</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Address:</strong> ${address}</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Scheduled:</strong> ${formatDateTime(scheduledAt)}</p>
        <p style="margin: 0; font-size: 14px; color: #64748b;">Assigned by: ${assignedByName}</p>
      </div>
      
      <p>Review the visit details and prepare for your meeting.</p>
    `,
    cta: {
      text: 'View Visit Details',
      url: visitUrl,
    },
  })

  const text = TextTemplate({
    title: 'Field Visit Assigned',
    children: `Hi there,\n\n${assignedByName} has assigned you a field visit in ${organizationName}.\n\nVisit: ${visitTitle}\nCompany: ${companyName}\nAddress: ${address}\nScheduled: ${formatDateTime(scheduledAt)}\nAssigned by: ${assignedByName}\n\nReview the visit details and prepare.`,
    cta: {
      text: 'View Visit Details',
      url: visitUrl,
    },
  })

  return { html, text }
}