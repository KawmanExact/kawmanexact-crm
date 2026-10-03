import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/session'

export const metadata = { title: 'Storage | Kawman ExAct Admin' }

export default async function AdminStoragePage() {
  const session = await requirePermission('files.manage')
  const [fileAgg, recordingAgg, versionAgg, byUploader] = await Promise.all([
    prisma.file.aggregate({ where: { organizationId: session.user.organizationId, uploadedById: session.user.id }, _sum: { fileSize: true }, _count: true }),
    prisma.meetingRecording.aggregate({ where: { meeting: { organizationId: session.user.organizationId } }, _sum: { fileSize: true } }),
    prisma.fileVersion.aggregate({ where: { file: { organizationId: session.user.organizationId, uploadedById: session.user.id } }, _sum: { fileSize: true } }),
    prisma.file.groupBy({
      by: ['uploadedById'],
      where: { organizationId: session.user.organizationId, uploadedById: session.user.id },
      _sum: { fileSize: true },
      _count: { _all: true },
    }),
  ])

  const fileBytes = Number(fileAgg._sum.fileSize ?? 0)
  const recordingBytes = Number(recordingAgg._sum.fileSize ?? 0)
  const versionBytes = Number(versionAgg._sum.fileSize ?? 0)
  const usedBytes = fileBytes + recordingBytes + versionBytes
  const usedGb = usedBytes / 1024 ** 3
  const totalGb = 100
  const pct = Math.min(100, Math.round((usedGb / totalGb) * 100))

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Storage" subtitle={`${fileAgg._count} file${fileAgg._count === 1 ? '' : 's'} stored`} />

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-white/60">{usedGb.toFixed(2)} GB used</span>
            <span className="text-white/40">{totalGb} GB plan limit</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {byUploader.length > 0 ? (
          <div className="rounded-xl border border-white/[0.08] overflow-hidden">
            <div className="bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white">Usage by uploader</div>
            <div className="divide-y divide-white/[0.06]">
              {byUploader.map((row) => (
                <div key={row.uploadedById} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-white/70">{row.uploadedById}</span>
                  <span className="text-white/50">
                    {(Number(row._sum.fileSize ?? 0) / 1024 ** 2).toFixed(1)} MB · {row._count._all} files
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 text-sm text-white/50">
            No files uploaded yet — the file management module (Cloudinary upload, sharing, permissions) isn&apos;t
            built out yet. This page will fill in automatically once it is.
          </div>
        )}
      </div>
    </MainLayout>
  )
}
