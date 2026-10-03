import 'server-only'
import { BaseTemplate, TextTemplate } from './base'

export interface DealStageChangedTemplateProps {
  dealName: string
  dealValue?: number
  currency?: string
  fromStage: string
  toStage: string
  changedByName: string
  dealUrl: string
  organizationName: string
}

export function DealStageChangedTemplate({
  dealName,
  dealValue,
  currency = 'INR',
  fromStage,
  toStage,
  changedByName,
  dealUrl,
  organizationName,
}: DealStageChangedTemplateProps): { html: string; text: string } {
  const valueText = dealValue
    ? ` (${currency} ${dealValue.toLocaleString()})`
    : ''

  const stageLabels: Record<string, string> = {
    NEW_LEAD: 'New Lead',
    CONTACTED: 'Contacted',
    QUALIFIED: 'Qualified',
    PROPOSAL: 'Proposal',
    NEGOTIATION: 'Negotiation',
    WON: 'Won',
    LOST: 'Lost',
  }

  const fromLabel = stageLabels[fromStage] || fromStage
  const toLabel = stageLabels[toStage] || toStage

  const html = BaseTemplate({
    title: 'Deal Stage Updated',
    preheader: `${changedByName} moved "${dealName}" from ${fromLabel} to ${toLabel}`,
    children: `
      <p>Hi there,</p>
      <p><strong>${changedByName}</strong> has updated a deal in <strong>${organizationName}</strong>.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; font-size: 15px;"><strong>Deal:</strong> ${dealName}${valueText}</p>
        <p style="margin: 0 0 8px; font-size: 14px;">
          <strong>Stage:</strong> 
          <span style="color: #64748b;">${fromLabel}</span> 
          <span style="color: #7c3aed; margin: 0 8px;">→</span> 
          <span style="color: #16a34a; font-weight: 600;">${toLabel}</span>
        </p>
        <p style="margin: 0; font-size: 14px; color: #64748b;">Updated by: ${changedByName}</p>
      </div>
      
      <p>View the deal to see the latest updates and next steps.</p>
    `,
    cta: {
      text: 'View Deal',
      url: dealUrl,
    },
  })

  const text = TextTemplate({
    title: 'Deal Stage Updated',
    children: `Hi there,\n\n${changedByName} has updated a deal in ${organizationName}.\n\nDeal: ${dealName}${valueText}\nStage: ${fromLabel} → ${toLabel}\nUpdated by: ${changedByName}\n\nView the deal for latest updates.`,
    cta: {
      text: 'View Deal',
      url: dealUrl,
    },
  })

  return { html, text }
}