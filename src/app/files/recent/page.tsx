import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { FileGrid } from '@/components/files/file-grid'
import { getRecentFiles } from '@/services/file.service'
import { getOrgUserOptions } from '@/services/user.service'
import { isOk } from '@/lib/result'

export const metadata = { title: 'Recent Files | Kawman ExAct' }

export default async function RecentFilesPage() {
  const [files, usersResult] = await Promise.all([getRecentFiles(), getOrgUserOptions()])
  const users = isOk(usersResult) ? usersResult.data : []

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Recent" subtitle="Recently uploaded files across your organization" />
        <FileGrid files={files} users={users} emptyLabel="No files uploaded yet" />
      </div>
    </MainLayout>
  )
}
