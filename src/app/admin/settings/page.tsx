import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { DeleteRowButton } from '@/components/crm/delete-row-button'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/session'
import { revokeSessionAction } from './actions'

export const metadata = { title: 'Settings | Kawman ExAct Admin' }

export default async function AdminSettingsPage() {
  const session = await requirePermission('settings.manage')
  const sessions = await prisma.session.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
  })

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Settings" subtitle="Security & active sessions for your account" />

        <div className="rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white">Active sessions</div>
          <div className="divide-y divide-white/[0.06]">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-white/80">{s.userAgent ?? 'Unknown device'}</p>
                  <p className="text-xs text-white/40">
                    {s.ipAddress ?? 'Unknown IP'} · Active until {s.expiresAt.toLocaleDateString('en-IN')}
                    {s.token === session.session.token && <span className="text-emerald-400"> · this device</span>}
                  </p>
                </div>
                {s.token !== session.session.token && (
                  <DeleteRowButton
                    action={revokeSessionAction.bind(null, s.id)}
                    confirmLabel="Sign this device out?"
                  />
                )}
              </div>
            ))}
            {sessions.length === 0 && <p className="text-sm text-white/40 px-4 py-6">No active sessions.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 text-sm text-white/50">
          More workspace settings (branding, integrations, notification preferences) are on the roadmap — organization
          profile lives at <Link href="/admin/organizations" className="text-purple-400 hover:underline">Admin → Organization</Link> for now.
        </div>
      </div>
    </MainLayout>
  )
}
