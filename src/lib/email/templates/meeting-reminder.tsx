import 'server-only'
import { BaseTemplate, TextTemplate } from './base'

export interface MeetingReminderTemplateProps {
  meetingTitle: string
  meetingType: 'IN_PERSON' | 'VIDEO_CALL' | 'PHONE'
  startTime: Date
  durationMinutes: number
  location?: string
  videoUrl?: string
  attendees: string[]
  meetingUrl: string
  organizationName: string
  reminderMinutes: number
}

export function MeetingReminderTemplate({
  meetingTitle,
  meetingType,
  startTime,
  durationMinutes,
  location,
  videoUrl,
  attendees,
  meetingUrl,
  organizationName,
  reminderMinutes,
}: MeetingReminderTemplateProps): { html: string; text: string } {
  const formatTime = (date: Date) => date.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  const typeLabels: Record<string, string> = {
    IN_PERSON: 'In Person',
    VIDEO_CALL: 'Video Call',
    PHONE: 'Phone Call',
  }

  const typeIcons: Record<string, string> = {
    IN_PERSON: '📍',
    VIDEO_CALL: '📹',
    PHONE: '📞',
  }

  const typeLabel = typeLabels[meetingType] || meetingType
  const typeIcon = typeIcons[meetingType] || '📅'

  const html = BaseTemplate({
    title: `Meeting Reminder: ${meetingTitle}`,
    preheader: `Starting in ${reminderMinutes} minutes - ${typeLabel}`,
    children: `
      <p>Hi there,</p>
      <p>This is a reminder for your upcoming meeting in <strong>${organizationName}</strong>.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600;">${typeIcon} ${meetingTitle}</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Type:</strong> ${typeLabel}</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Time:</strong> ${formatTime(startTime)} (${durationMinutes} min)</p>
        ${location ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>Location:</strong> ${location}</p>` : ''}
        ${videoUrl ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>Video Link:</strong> <a href="${videoUrl}" style="color: #7c3aed;">Join Video Call</a></p>` : ''}
        <p style="margin: 0; font-size: 14px;"><strong>Attendees:</strong> ${attendees.join(', ')}</p>
      </div>
      
      <p>Starting in <strong>${reminderMinutes} minutes</strong>. Please join on time.</p>
    `,
    cta: {
      text: 'View Meeting Details',
      url: meetingUrl,
    },
  })

  const text = TextTemplate({
    title: `Meeting Reminder: ${meetingTitle}`,
    children: `Hi there,\n\nThis is a reminder for your upcoming meeting in ${organizationName}.\n\n${typeIcon} ${meetingTitle}\nType: ${typeLabel}\nTime: ${formatTime(startTime)} (${durationMinutes} min)\n${location ? `Location: ${location}\n` : ''}${videoUrl ? `Video Link: ${videoUrl}\n` : ''}Attendees: ${attendees.join(', ')}\n\nStarting in ${reminderMinutes} minutes.`,
    cta: {
      text: 'View Meeting Details',
      url: meetingUrl,
    },
  })

  return { html, text }
}