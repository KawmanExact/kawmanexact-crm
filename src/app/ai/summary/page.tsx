import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { ReportsPanel } from '@/components/ai/reports-panel'
import { listReportsByType, REPORT_TYPES } from '@/services/ai.service'
import { isAIConfigured } from '@/lib/ai'

export const metadata = { title: 'AI Summary | Kawman ExAct' }

export default async function AISummaryPage() {
  const summaryMeta = REPORT_TYPES.find((r) => r.type === 'EXECUTIVE_SUMMARY')!
  const reports = await listReportsByType('EXECUTIVE_SUMMARY')

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="AI Summary" subtitle="A one-page, leadership-ready snapshot of your business" />
        <ReportsPanel
          reportTypes={[{ type: summaryMeta.type, title: summaryMeta.title, description: summaryMeta.description }]}
          initialReports={reports}
          aiConfigured={isAIConfigured()}
        />
      </div>
    </MainLayout>
  )
}
