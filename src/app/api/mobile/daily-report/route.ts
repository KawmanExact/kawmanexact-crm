import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { mobileGuard } from '@/lib/mobile-api'
import { getTodayReportDraft } from '@/services/daily-report.service'

/** Today's daily-report draft for the mobile user — prefilled counts so the
 * "Submit Daily Report" screen can show activity summary. */
export async function GET() {
  const g = await mobileGuard('field_visits.view')
  if ('error' in g) return g.error

  const draftResult = await getTodayReportDraft()
  if (!draftResult.success) return NextResponse.json({ error: draftResult.error }, { status: 500 })
  const draft = draftResult.data

  return NextResponse.json({
    draft: {
      tasksCompletedCount: draft.tasksCompletedCount,
      crmRecordsUpdatedCount: draft.crmRecordsUpdatedCount,
      leadsWorkedOnCount: draft.leadsWorkedOnCount,
      filesUploadedCount: draft.filesUploadedCount,
      activeWorkingTimeMinutes: draft.activeWorkingTimeMinutes,
      visitReportsCount: draft.visitReportsCount,
      checkInsCount: draft.checkInsCount,
      existingReport: draft.existingReport
        ? {
            id: draft.existingReport.id,
            workDescription: draft.existingReport.workDescription,
            completedWork: draft.existingReport.completedWork,
            pendingWork: draft.existingReport.pendingWork,
            blockers: draft.existingReport.blockers,
            tomorrowPlan: draft.existingReport.tomorrowPlan,
            tasksCompletedCount: draft.existingReport.tasksCompletedCount,
            crmRecordsUpdatedCount: draft.existingReport.crmRecordsUpdatedCount,
            leadsWorkedOnCount: draft.existingReport.leadsWorkedOnCount,
            filesUploadedCount: draft.existingReport.filesUploadedCount,
            activeWorkingTimeMinutes: draft.existingReport.activeWorkingTimeMinutes,
            status: draft.existingReport.status,
            updatedAt: draft.existingReport.updatedAt.toISOString(),
          }
        : null,
    },
  })
}

/** Submit (or save as draft) today's daily report from the mobile app. */
export async function POST(request: Request) {
  const g = await mobileGuard('reports.submit')
  if ('error' in g) return g.error
  const { session } = g

  const body = await request.json().catch(() => null)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const existing = await prisma.dailyReport.findFirst({
    where: { organizationId: session.user.organizationId, userId: session.user.id, date: { gte: today, lt: tomorrow } },
  })

  const data = {
    workDescription: body.workDescription ?? null,
    completedWork: body.completedWork ?? null,
    pendingWork: body.pendingWork ?? null,
    blockers: body.blockers ?? null,
    tomorrowPlan: body.tomorrowPlan ?? null,
    tasksCompletedCount: body.tasksCompletedCount ?? 0,
    crmRecordsUpdatedCount: body.crmRecordsUpdatedCount ?? 0,
    leadsWorkedOnCount: body.leadsWorkedOnCount ?? 0,
    filesUploadedCount: body.filesUploadedCount ?? 0,
    activeWorkingTimeMinutes: body.activeWorkingTimeMinutes ?? 0,
    status: 'SUBMITTED' as const,
  }

  const row = existing
    ? await prisma.dailyReport.update({ where: { id: existing.id }, data })
    : await prisma.dailyReport.create({
        data: { organizationId: session.user.organizationId, userId: session.user.id, date: today, ...data },
      })

  // Notify every ADMIN / SUPER_ADMIN in the org on first transition to SUBMITTED.
  // Best-effort: never block the response.
  const shouldNotify = !existing || existing.status !== 'SUBMITTED'
  if (shouldNotify) {
    try {
      const { createNotification } = await import('@/services/notification.service')
      const adminRoleIds = await prisma.role.findMany({
        where: { name: { in: ['ADMIN', 'SUPER_ADMIN'] as never[] } },
        select: { id: true },
      })
      if (adminRoleIds.length) {
        const adminUserIds = await prisma.userRole.findMany({
          where: { roleId: { in: adminRoleIds.map((r) => r.id) }, user: { organizationId: session.user.organizationId } },
          select: { userId: true },
        })
        const uniqueAdminUserIds = [...new Set(adminUserIds.map((r) => r.userId))]
        if (uniqueAdminUserIds.length) {
          const employeeName = session.user.name ?? session.user.email
          const dateLabel = today.toISOString().slice(0, 10)
          await Promise.all(
            uniqueAdminUserIds.map((adminUserId) =>
              createNotification({
                organizationId: session.user.organizationId,
                userId: adminUserId,
                type: 'DAILY_REPORT_SUBMITTED' as never,
                title: 'Daily report submitted',
                message: `${employeeName} submitted their report for ${dateLabel}`,
                data: { dailyReportId: row.id, userId: session.user.id } as never,
              })
            )
          )
        }
      }
    } catch (err) {
      console.error('[daily-report/mobile] notify admins failed (ignored):', err)
    }
  }

  return NextResponse.json({ id: row.id, status: row.status, updatedAt: row.updatedAt.toISOString() }, { status: 201 })
}
