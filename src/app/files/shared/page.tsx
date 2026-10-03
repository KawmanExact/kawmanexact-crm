import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { FileGrid } from '@/components/files/file-grid'
import { getSharedWithMe } from '@/services/file.service'

export const metadata = { title: 'Shared with Me | Kawman ExAct' }

export default async function SharedWithMePage() {
  const files = await getSharedWithMe()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Shared with Me" subtitle={`${files.length} files shared with you`} />
        <FileGrid files={files} emptyLabel="No one has shared a file with you yet" />
      </div>
    </MainLayout>
  )
}
