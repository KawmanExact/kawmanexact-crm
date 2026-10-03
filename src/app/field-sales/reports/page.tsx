import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ClipboardCheck, Plus } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { getVisitReports } from '@/services/field-visit.service'
import { getSession } from '@/lib/session'
import { ExportMenu } from '@/components/report-engine/export-menu'
import { buildFieldVisitReportsReport } from '@/lib/report-engine/builders/field-visits'
import { FieldSalesDailySummaryButton } from './summary-button'

export const metadata = { title: 'Visit Reports | Kawman ExAct' }

export default async function VisitReportsPage() {
  const [reports, session] = await Promise.all([getVisitReports(), getSession()])
  const sessionUser = session?.user as unknown as { name?: string; email?: string; organization?: { name?: string } | null } | undefined
  const exportReport = buildFieldVisitReportsReport({
    reports: reports as unknown as import('@/lib/report-engine/builders/field-visits').VisitReportRow[],
    generatedBy: sessionUser?.name ?? sessionUser?.email,
    organizationName: sessionUser?.organization?.name ?? undefined,
  })

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Visit Reports"
          subtitle={`${reports.length} reports submitted — what was discussed on site`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <FieldSalesDailySummaryButton />
              {reports.length > 0 ? <ExportMenu report={exportReport} /> : null}
              <Button asChild className="gap-1.5">
                <Link href="/field-sales/reports/new">
                  <Plus className="h-4 w-4" /> New Field Report
                </Link>
              </Button>
            </div>
          }
        />

        {reports.length === 0 ? (
          <Card className="bg-[#0a111c]/80 border-white/[0.08] py-14 text-center">
            <ClipboardCheck className="h-6 w-6 text-white/30 mx-auto mb-2" />
            <p className="text-white/40 text-sm">No visit reports submitted yet</p>
            <p className="text-white/30 text-xs mt-1">Tap New Field Report to write what was discussed — it will link to Submit Daily Report.</p>
            <Button asChild className="mt-4 gap-1.5">
              <Link href="/field-sales/reports/new">
                <Plus className="h-4 w-4" /> New Field Report
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {reports.map((r) => (
              <Card key={r.id} className="bg-[#0a111c]/80 border-white/[0.08] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-white font-medium">{r.visitTitle}</p>
                    {r.companyName && <p className="text-white/40 text-xs mt-0.5">{r.companyName}</p>}
                  </div>
                  <p className="text-xs text-white/40 whitespace-nowrap">
                    {r.createdBy} · {format(new Date(r.createdAt), 'd MMM yyyy')}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <ReportField label="Purpose" value={r.purpose} />
                  {r.discussion && <ReportField label="Discussion" value={r.discussion} />}
                  {r.requirements && <ReportField label="Requirements" value={r.requirements} />}
                  {r.competitorInfo && <ReportField label="Competitor info" value={r.competitorInfo} />}
                  {r.customerFeedback && <ReportField label="Customer feedback" value={r.customerFeedback} />}
                  {r.nextSteps && <ReportField label="Next steps" value={r.nextSteps} />}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-white/40 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className="text-white/70">{value}</p>
    </div>
  )
}
