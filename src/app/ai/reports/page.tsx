import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { ReportsPanel } from '@/components/ai/reports-panel'
import { listReports, REPORT_TYPES } from '@/services/ai.service'
import { isAIConfigured } from '@/lib/ai'

export const metadata = { title: 'AI Reports | Kawman ExAct' }

export default async function AIReportsPage() {
  const reports = await listReports()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="AI Reports" subtitle="Generate data-grounded reports from your live CRM data" />
        <ReportsPanel
          reportTypes={REPORT_TYPES.map((r) => ({ type: r.type, title: r.title, description: r.description }))}
          initialReports={reports}
          aiConfigured={isAIConfigured()}
        />
      </div>
    </MainLayout>
  )
}
