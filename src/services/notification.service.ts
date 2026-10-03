import 'server-only'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma'
import { queueEmail } from '@/services/queue.service'
import {
  LeadAssignedTemplate,
  DealStageChangedTemplate,
  MeetingReminderTemplate,
  DailyReportReminderTemplate,
  FieldVisitAssignedTemplate,
  AIReportReadyTemplate,
  FileSharedTemplate,
  MentionNotificationTemplate,
} from '@/lib/email/templates'
import type {
  LeadAssignedTemplateProps,
  DealStageChangedTemplateProps,
  MeetingReminderTemplateProps,
  DailyReportReminderTemplateProps,
  FieldVisitAssignedTemplateProps,
  AIReportReadyTemplateProps,
  FileSharedTemplateProps,
  MentionNotificationTemplateProps,
} from '@/lib/email/templates'
import { sendEmail } from '@/lib/email'

/**
 * Notification Service
 * 
 * Centralized notification dispatch supporting:
 * - In-app notifications (queued)
 * - Email notifications (queued)
 * - Template-based emails
 * - User preferences (future)
 */

export interface NotificationInput {
  organizationId: string
  userId: string
  type: Prisma.NotificationCreateInput['type']
  title: string
  message: string
  data?: Prisma.InputJsonValue
  sendEmail?: boolean
  emailTemplate?: 'lead-assigned' | 'deal-stage-changed' | 'meeting-reminder' | 'daily-report-reminder' | 'field-visit-assigned' | 'ai-report-ready' | 'file-shared' | 'mention'
  emailData?: Record<string, unknown>
}

/**
 * Create an in-app notification
 *
 * Writes directly to the database so notifications are immediately visible
 * without depending on a running Redis worker. Email dispatch is still
 * queued (and falls back gracefully when Redis is unavailable).
 */
export async function createNotification(args: NotificationInput): Promise<string | null> {
  const { organizationId, userId, type, title, message, data, sendEmail, emailTemplate, emailData } = args

  // Create in-app notification directly in the database
  const notification = await prisma.notification.create({
    data: {
      organizationId,
      userId,
      type,
      title,
      message,
      data: data as Prisma.InputJsonValue,
    },
  })

  // Queue email if requested (best-effort; no-op when Redis is unavailable)
  if (sendEmail && emailTemplate && emailData) {
    await queueEmailNotification(userId, emailTemplate, emailData)
  }

  return notification.id
}

/**
 * Create multiple notifications at once (bulk)
 */
export async function createBulkNotifications(notifications: NotificationInput[]): Promise<(string | null)[]> {
  return Promise.all(notifications.map((n) => createNotification(n)))
}

/**
 * Queue an email notification using templates
 */
async function queueEmailNotification(
  userId: string,
  template: NotificationInput['emailTemplate'],
  data: Record<string, unknown>
): Promise<string | null> {
  // Get user email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  })

  if (!user?.email) {
    console.warn(`[NOTIFICATION] User ${userId} has no email, skipping email notification`)
    return null
  }

  let emailHtml = ''
  let emailText = ''
  let subject = ''

  switch (template) {
    case 'lead-assigned': {
      const { html, text } = LeadAssignedTemplate(data as unknown as LeadAssignedTemplateProps)
      emailHtml = html
      emailText = text
      subject = `New Lead Assigned: ${data.leadName}`
      break
    }
    case 'deal-stage-changed': {
      const { html, text } = DealStageChangedTemplate(data as unknown as DealStageChangedTemplateProps)
      emailHtml = html
      emailText = text
      subject = `Deal Updated: ${data.dealName}`
      break
    }
    case 'meeting-reminder': {
      const { html, text } = MeetingReminderTemplate(data as unknown as MeetingReminderTemplateProps)
      emailHtml = html
      emailText = text
      subject = `Meeting Reminder: ${data.meetingTitle}`
      break
    }
    case 'daily-report-reminder': {
      const { html, text } = DailyReportReminderTemplate(data as unknown as DailyReportReminderTemplateProps)
      emailHtml = html
      emailText = text
      subject = data.isDraft ? 'Complete Your Daily Report' : 'Daily Report Reminder'
      break
    }
    case 'field-visit-assigned': {
      const { html, text } = FieldVisitAssignedTemplate(data as unknown as FieldVisitAssignedTemplateProps)
      emailHtml = html
      emailText = text
      subject = `Field Visit Assigned: ${data.visitTitle}`
      break
    }
    case 'ai-report-ready': {
      const { html, text } = AIReportReadyTemplate(data as unknown as AIReportReadyTemplateProps)
      emailHtml = html
      emailText = text
      subject = `AI Report Ready: ${data.reportTitle}`
      break
    }
    case 'file-shared': {
      const { html, text } = FileSharedTemplate(data as unknown as FileSharedTemplateProps)
      emailHtml = html
      emailText = text
      subject = `File Shared: ${data.fileName}`
      break
    }
    case 'mention': {
      const { html, text } = MentionNotificationTemplate(data as unknown as MentionNotificationTemplateProps)
      emailHtml = html
      emailText = text
      subject = `You Were Mentioned in ${data.contextType}`
      break
    }
    default:
      console.warn(`[NOTIFICATION] Unknown email template: ${template}`)
      return null
  }

  // Queue the email
  return queueEmail({
    to: user.email,
    subject,
    html: emailHtml,
    text: emailText,
    metadata: {
      userId,
      type: template,
    },
  })
}

/**
 * Send email directly (bypassing queue) - for critical emails like password reset
 */
export async function sendDirectEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<{ delivered: boolean }> {
  return sendEmail({ to, subject, html, text })
}

/**
 * Get user notifications with pagination
 */
export async function getUserNotifications(args: {
  userId: string
  organizationId: string
  limit?: number
  offset?: number
  unreadOnly?: boolean
}) {
  const { userId, organizationId, limit = 20, offset = 0, unreadOnly = false } = args

  const where: Prisma.NotificationWhereInput = {
    userId,
    organizationId,
    ...(unreadOnly && { isRead: false }),
  }

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { userId, organizationId, isRead: false },
    }),
  ])

  return {
    notifications,
    total,
    unreadCount,
    hasMore: offset + notifications.length < total,
  }
}

/**
 * Mark notifications as read
 */
export async function markNotificationsRead(args: {
  userId: string
  organizationId: string
  notificationIds?: string[]
  markAll?: boolean
}) {
  const { userId, organizationId, notificationIds, markAll } = args

  if (markAll) {
    return prisma.notification.updateMany({
      where: { userId, organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
  }

  if (notificationIds?.length) {
    return prisma.notification.updateMany({
      where: { id: { in: notificationIds }, userId, organizationId },
      data: { isRead: true, readAt: new Date() },
    })
  }

  return { count: 0 }
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string, userId: string, organizationId: string) {
  return prisma.notification.delete({
    where: { id: notificationId, userId, organizationId },
  })
}

export async function deleteAllNotifications(userId: string, organizationId: string) {
  return prisma.notification.deleteMany({
    where: { userId, organizationId },
  })
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(userId: string, organizationId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, organizationId, isRead: false },
  })
}

/**
 * Notification triggers - call these from services when events occur
 */

export async function notifyLeadAssigned(args: {
  organizationId: string
  userId: string
  leadId: string
  leadName: string
  leadCompany?: string
  assignedByName: string
  leadUrl: string
}) {
  const { organizationId, userId, leadId, leadName, leadCompany, assignedByName, leadUrl } = args

  await createNotification({
    organizationId,
    userId,
    type: 'NEW_LEAD',
    title: 'New Lead Assigned',
    message: `${assignedByName} assigned you "${leadName}"${leadCompany ? ` at ${leadCompany}` : ''}`,
    data: { leadId, leadName, leadCompany, assignedByName, leadUrl },
    sendEmail: true,
    emailTemplate: 'lead-assigned',
    emailData: { leadName, leadCompany, assignedByName, leadUrl, organizationName: '' },
  })
}

export async function notifyDealStageChanged(args: {
  organizationId: string
  userId: string
  dealId: string
  dealName: string
  dealValue?: number
  currency?: string
  fromStage: string
  toStage: string
  changedByName: string
  dealUrl: string
}) {
  const { organizationId, userId, dealId, dealName, dealValue, currency, fromStage, toStage, changedByName, dealUrl } = args

  const stageLabels: Record<string, string> = {
    NEW_LEAD: 'New Lead',
    CONTACTED: 'Contacted',
    QUALIFIED: 'Qualified',
    PROPOSAL: 'Proposal',
    NEGOTIATION: 'Negotiation',
    WON: 'Won',
    LOST: 'Lost',
  }

  await createNotification({
    organizationId,
    userId,
    type: 'DEAL_UPDATED',
    title: 'Deal Stage Updated',
    message: `${changedByName} moved "${dealName}" from ${stageLabels[fromStage] || fromStage} to ${stageLabels[toStage] || toStage}`,
    data: { dealId, dealName, dealValue, currency, fromStage, toStage, changedByName, dealUrl },
    sendEmail: true,
    emailTemplate: 'deal-stage-changed',
    emailData: { dealName, dealValue, currency, fromStage, toStage, changedByName, dealUrl, organizationName: '' },
  })
}

export async function notifyMeetingReminder(args: {
  organizationId: string
  userId: string
  meetingId: string
  meetingTitle: string
  meetingType: 'IN_PERSON' | 'VIDEO_CALL' | 'PHONE'
  startTime: Date
  durationMinutes: number
  location?: string
  videoUrl?: string
  attendees: string[]
  meetingUrl: string
  reminderMinutes: number
}) {
  const { organizationId, userId, meetingId, meetingTitle, meetingType, startTime, durationMinutes, location, videoUrl, attendees, meetingUrl, reminderMinutes } = args

  await createNotification({
    organizationId,
    userId,
    type: 'MEETING_REMINDER',
    title: `Meeting in ${reminderMinutes} minutes`,
    message: `"${meetingTitle}" starts at ${startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
    data: { meetingId, meetingTitle, meetingType, startTime, durationMinutes, location, videoUrl, attendees, meetingUrl, reminderMinutes },
    sendEmail: true,
    emailTemplate: 'meeting-reminder',
    emailData: { meetingTitle, meetingType, startTime, durationMinutes, location, videoUrl, attendees, meetingUrl, organizationName: '', reminderMinutes },
  })
}

export async function notifyDailyReportReminder(args: {
  organizationId: string
  userId: string
  date: Date
  reportUrl: string
  isDraft?: boolean
}) {
  const { organizationId, userId, date, reportUrl, isDraft } = args

  await createNotification({
    organizationId,
    userId,
    type: 'DAILY_REPORT_SUBMITTED',
    title: isDraft ? 'Complete Your Daily Report' : 'Daily Report Reminder',
    message: isDraft
      ? `You have a draft report for ${date.toLocaleDateString()}`
      : `Don't forget to submit your daily report for ${date.toLocaleDateString()}`,
    data: { date, reportUrl, isDraft },
    sendEmail: true,
    emailTemplate: 'daily-report-reminder',
    emailData: { userName: '', date, reportUrl, organizationName: '', isDraft },
  })
}

export async function notifyFieldVisitAssigned(args: {
  organizationId: string
  userId: string
  visitId: string
  visitTitle: string
  companyName: string
  address: string
  scheduledAt: Date
  assignedByName: string
  visitUrl: string
}) {
  const { organizationId, userId, visitId, visitTitle, companyName, address, scheduledAt, assignedByName, visitUrl } = args

  await createNotification({
    organizationId,
    userId,
    type: 'VISIT_ASSIGNED',
    title: 'Field Visit Assigned',
    message: `${assignedByName} assigned you a visit to ${companyName}`,
    data: { visitId, visitTitle, companyName, address, scheduledAt, assignedByName, visitUrl },
    sendEmail: true,
    emailTemplate: 'field-visit-assigned',
    emailData: { visitTitle, companyName, address, scheduledAt, assignedByName, visitUrl, organizationName: '' },
  })
}

export async function notifyAIReportReady(args: {
  organizationId: string
  userId: string
  reportId: string
  reportTitle: string
  reportType: string
  generatedByName: string
  reportUrl: string
  summary?: string
}) {
  const { organizationId, userId, reportId, reportTitle, reportType, generatedByName, reportUrl, summary } = args

  await createNotification({
    organizationId,
    userId,
    type: 'AI_REPORT_READY',
    title: 'AI Report Ready',
    message: `Your ${reportType} report "${reportTitle}" has been generated`,
    data: { reportId, reportTitle, reportType, generatedByName, reportUrl, summary },
    sendEmail: true,
    emailTemplate: 'ai-report-ready',
    emailData: { reportTitle, reportType, generatedByName, reportUrl, organizationName: '', summary },
  })
}

export async function notifyFileShared(args: {
  organizationId: string
  userId: string
  fileId: string
  fileName: string
  fileType: string
  fileSize: number
  sharedByName: string
  permission: 'VIEWER' | 'EDITOR' | 'MANAGER'
  fileUrl: string
  message?: string
}) {
  const { organizationId, userId, fileId, fileName, fileType, fileSize, sharedByName, permission, fileUrl, message } = args

  await createNotification({
    organizationId,
    userId,
    type: 'FILE_SHARED',
    title: 'File Shared with You',
    message: `${sharedByName} shared "${fileName}" with ${permission === 'VIEWER' ? 'view' : permission === 'EDITOR' ? 'edit' : 'full'} access`,
    data: { fileId, fileName, fileType, fileSize, sharedByName, permission, fileUrl, message },
    sendEmail: true,
    emailTemplate: 'file-shared',
    emailData: { fileName, fileType, fileSize, sharedByName, permission, fileUrl, organizationName: '', message },
  })
}

export async function notifyMention(args: {
  organizationId: string
  userId: string
  mentionedByName: string
  contextType: 'comment' | 'task' | 'note' | 'report'
  contextTitle: string
  contextPreview: string
  contextUrl: string
}) {
  const { organizationId, userId, mentionedByName, contextType, contextTitle, contextPreview, contextUrl } = args

  await createNotification({
    organizationId,
    userId,
    type: 'FILE_SHARED',
    title: 'You Were Mentioned',
    message: `${mentionedByName} mentioned you in a ${contextType}`,
    data: { mentionedByName, contextType, contextTitle, contextPreview, contextUrl },
    sendEmail: true,
    emailTemplate: 'mention',
    emailData: { mentionedByName, contextType, contextTitle, contextPreview, contextUrl, organizationName: '' },
  })
}
