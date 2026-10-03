import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getFieldVisits } from '@/services/field-visit.service'
import { isAIConfigured } from '@/lib/ai'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { VisitReportForm } from '../report-form'

export const metadata = { title: 'New Field Report | Kawman ExAct' }

function startOfDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export default async function NewVisitReportPage() {
  const session = await requireApiSession()
  const [visits, aiConfigured] = await Promise.all([getFieldVisits(), Promise.resolve(isAIConfigured())])

  const today = startOfDay(new Date())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const existingDaily = await prisma.dailyReport.findFirst({
    where: { organizationId: session.user.organizationId, userId: session.user.id, date: { gte: today, lt: tomorrow } },
    select: { id: true },
  })

  // Show most recent 80 visits for the picker — enough for a rep's active pipeline
  const pickerVisits = visits.slice(0, 80).map((v) => ({
    id: v.id,
    title: v.title,
    company: v.company,
    scheduledAt: v.scheduledAt,
  }))

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader
          title="New Field Report"
          subtitle="Write what was discussed on site — this links to Submit Daily Report and powers the AI sales summary."
        />
        <VisitReportForm visits={pickerVisits} aiConfigured={aiConfigured} dailyReportExists={!!existingDaily} />
      </div>
    </MainLayout>
  )
}
