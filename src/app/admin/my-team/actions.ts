'use server'

import { validateCsrf } from '@/lib/csrf'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { logAudit } from '@/lib/audit-log'
import { submitDailyReport } from '@/services/daily-report.service'

const submitDailyReportSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  workDescription: z.string().trim().max(5000).optional(),
  completedWork: z.string().trim().max(5000).optional(),
  pendingWork: z.string().trim().max(5000).optional(),
  blockers: z.string().trim().max(5000).optional(),
  tomorrowPlan: z.string().trim().max(5000).optional(),
  tasksCompletedCount: z.coerce.number().int().min(0).max(1000).optional(),
  crmRecordsUpdatedCount: z.coerce.number().int().min(0).max(10000).optional(),
  leadsWorkedOnCount: z.coerce.number().int().min(0).max(10000).optional(),
  filesUploadedCount: z.coerce.number().int().min(0).max(10000).optional(),
  activeWorkingTimeMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  targetUserId: z.string().trim().optional(),
})

export interface DailyReportFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
  reportId?: string
}

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

export async function submitDailyReportAction(
  _prev: DailyReportFormState,
  formData: FormData,
): Promise<DailyReportFormState> {
  await validateCsrf()
  const session = await assertPermission('reports.submit')
  const parsed = submitDailyReportSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data
  const targetUserId = data.targetUserId || undefined
  if (targetUserId && targetUserId !== session.user.id && !(session.user.permissions as string[]).includes('team.view_all')) {
    return { error: 'You do not have permission to submit for another user.' }
  }
  try {
    const result = await submitDailyReport({
      date: new Date(data.date),
      workDescription: data.workDescription,
      completedWork: data.completedWork,
      pendingWork: data.pendingWork,
      blockers: data.blockers,
      tomorrowPlan: data.tomorrowPlan,
      tasksCompletedCount: data.tasksCompletedCount,
      crmRecordsUpdatedCount: data.crmRecordsUpdatedCount,
      leadsWorkedOnCount: data.leadsWorkedOnCount,
      filesUploadedCount: data.filesUploadedCount,
      activeWorkingTimeMinutes: data.activeWorkingTimeMinutes,
      targetUserId,
    })

    if (!result.success) return { error: result.error }
    const row = result.data

    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'CREATE',
      resource: 'daily_report',
      resourceId: row.id,
      metadata: { event: 'daily_report_submitted', date: data.date, userId: row.userId },
    })

    // Fire-and-forget AI summary (best-effort, don't block the response)
    // The actual AI call is triggered via the REST route so the client can show progress;
    // we kick it here only if AI is configured — the route itself gates on isAIConfigured().
    revalidatePath('/admin/my-team')
    revalidatePath('/admin/my-team/reports')
    revalidatePath(`/admin/my-team/${row.userId}`)
    revalidatePath('/dashboard')
    return { success: true, reportId: row.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to submit report' }
  }
}

const markReviewedSchema = z.object({
  dailyReportId: z.string().min(1),
})

export async function markReportReviewedAction(
  _prev: DailyReportFormState,
  formData: FormData,
): Promise<DailyReportFormState> {
  await validateCsrf()
  const session = await assertPermission('team.view_all')
  const parsed = markReviewedSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Invalid report id' }
  }
  const report = await prisma.dailyReport.findFirst({
    where: { id: parsed.data.dailyReportId, organizationId: session.user.organizationId },
  })
  if (!report) return { error: 'Report not found' }

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'daily_report',
    resourceId: report.id,
    metadata: { event: 'daily_report_reviewed', userId: report.userId, date: report.date.toISOString().slice(0, 10) },
  })

  revalidatePath('/admin/my-team/reports')
  revalidatePath(`/admin/my-team/${report.userId}`)
  return { success: true, reportId: report.id }
}
