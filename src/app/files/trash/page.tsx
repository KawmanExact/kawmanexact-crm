import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { FileGrid } from '@/components/files/file-grid'
import { getTrashedFiles } from '@/services/file.service'

export const metadata = { title: 'Recycle Bin | Kawman ExAct' }

export default async function TrashPage() {
  const files = await getTrashedFiles()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Recycle Bin" subtitle={`${files.length} files in trash`} />
        <FileGrid files={files} mode="trash" emptyLabel="Trash is empty" />
      </div>
    </MainLayout>
  )
}
