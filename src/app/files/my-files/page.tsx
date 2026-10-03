import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { FileBreadcrumb } from '@/components/files/file-breadcrumb'
import { FolderGrid } from '@/components/files/folder-grid'
import { FileGrid } from '@/components/files/file-grid'
import { UploadButton } from '@/components/files/upload-button'
import { CreateFolderButton } from '@/components/files/create-folder-button'
import { getFolderContents, getFolderPath } from '@/services/file.service'
import { getOrgUserOptions } from '@/services/user.service'
import { isCloudinaryConfigured } from '@/lib/cloudinary'
import { isOk } from '@/lib/result'

export const metadata = { title: 'My Files | Kawman ExAct' }

export default async function MyFilesPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const { folder } = await searchParams
  const folderId = folder || null

  const [{ folders, files }, path, usersResult] = await Promise.all([
    getFolderContents(folderId),
    getFolderPath(folderId),
    getOrgUserOptions(),
  ])
  const users = isOk(usersResult) ? usersResult.data : []

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="My Files"
          subtitle={`${folders.length} folders · ${files.length} files`}
          action={
            <div className="flex items-center gap-2">
              <CreateFolderButton parentId={folderId} />
              <UploadButton folderId={folderId} cloudinaryConfigured={isCloudinaryConfigured()} />
            </div>
          }
        />
        <FileBreadcrumb path={path} />

        {!isCloudinaryConfigured() && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Cloudinary isn&apos;t configured yet. Set <code className="text-amber-100">CLOUDINARY_CLOUD_NAME</code>,{' '}
            <code className="text-amber-100">CLOUDINARY_API_KEY</code>, and{' '}
            <code className="text-amber-100">CLOUDINARY_API_SECRET</code> to enable uploads.
          </div>
        )}

        <FolderGrid folders={folders} users={users} />
        <FileGrid files={files} users={users} emptyLabel="No files here yet" />
      </div>
    </MainLayout>
  )
}
