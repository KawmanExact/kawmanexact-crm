import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { DataAnalysisPanel } from '@/components/ai/data-analysis-panel'
import { isAIConfigured } from '@/lib/ai'

export const metadata = { title: 'Data Analysis | Kawman ExAct' }

export default function AIDataAnalysisPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Data Analysis" subtitle="Ask questions about your live CRM data and get grounded answers" />
        <DataAnalysisPanel aiConfigured={isAIConfigured()} />
      </div>
    </MainLayout>
  )
}
