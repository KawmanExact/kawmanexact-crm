import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getTodayReportDraft } from '@/services/daily-report.service'
import { isAIConfigured } from '@/lib/ai'
import { DailyReportForm } from './daily-report-form'

export const metadata = { title: "Submit Daily Report | Kawman ExAct" }

export default async function DailyReportPage() {
  const [draftResult, aiConfigured] = await Promise.all([getTodayReportDraft(), Promise.resolve(isAIConfigured())])
  const draft = draftResult.success ? draftResult.data : { tasksCompletedCount: 0, crmRecordsUpdatedCount: 0, leadsWorkedOnCount: 0, filesUploadedCount: 0, activeWorkingTimeMinutes: 0, existingReport: null }
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Submit Today's Report" subtitle="Pre-filled from your CRM activity today — edit before submitting" />
        <DailyReportForm draft={draft} aiConfigured={aiConfigured} />
      </div>
    </MainLayout>
  )
}
