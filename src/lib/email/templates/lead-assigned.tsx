import 'server-only'
import { BaseTemplate, TextTemplate } from './base'

export interface LeadAssignedTemplateProps {
  leadName: string
  leadCompany?: string
  assignedByName: string
  leadUrl: string
  organizationName: string
}

export function LeadAssignedTemplate({
  leadName,
  leadCompany,
  assignedByName,
  leadUrl,
  organizationName,
}: LeadAssignedTemplateProps): { html: string; text: string } {
  const companyText = leadCompany ? ` at ${leadCompany}` : ''

  const html = BaseTemplate({
    title: 'New Lead Assigned',
    preheader: `${assignedByName} assigned you a new lead: ${leadName}`,
    children: `
      <p>Hi there,</p>
      <p><strong>${assignedByName}</strong> has assigned you a new lead in <strong>${organizationName}</strong>.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; font-size: 15px;"><strong>Lead:</strong> ${leadName}${companyText}</p>
        <p style="margin: 0; font-size: 14px; color: #64748b;">Assigned by: ${assignedByName}</p>
      </div>
      
      <p>Review the lead details and start engaging with the prospect.</p>
    `,
    cta: {
      text: 'View Lead',
      url: leadUrl,
    },
  })

  const text = TextTemplate({
    title: 'New Lead Assigned',
    children: `Hi there,\n\n${assignedByName} has assigned you a new lead in ${organizationName}.\n\nLead: ${leadName}${companyText}\nAssigned by: ${assignedByName}\n\nReview the lead details and start engaging.`,
    cta: {
      text: 'View Lead',
      url: leadUrl,
    },
  })

  return { html, text }
}