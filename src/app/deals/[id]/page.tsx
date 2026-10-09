import { notFound } from 'next/navigation'
import { Plus } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Badge } from '@/components/ui/badge'
import { getDealById } from '@/services/deal.service'
import { getOrgUserOptions } from '@/services/user.service'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { canManageAssignments } from '@/lib/record-scope'
import { formatCurrency } from '@/lib/utils'
import { DealDetailForm } from './deal-detail-form'
import type { UserOption } from '@/services/user.service'
import { isOk } from '@/lib/result'

export const metadata = { title: 'Deal Detail | Kawman ExAct' }

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [deal, ownersResult] = await Promise.all([
    getDealById(id),
    getOrgUserOptions(),
  ])
  if (!deal) notFound()
  const owners = isOk(ownersResult) ? ownersResult.data : []

  const session = await requireApiSession()
  const canAssign = canManageAssignments(session.user)
  const currentUser: UserOption = { id: session.user.id, name: session.user.name ?? 'Me' }
  const [activities, followUps] = await Promise.all([
    prisma.activity.findMany({
      where: { dealId: id, organizationId: session.user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { actor: { select: { name: true } } },
    }),
    prisma.followUp.findMany({
      where: { dealId: id, organizationId: session.user.organizationId },
      orderBy: { dueDate: 'asc' },
    }),
  ])

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader title={deal.name} subtitle={`${deal.company} · ${formatCurrency(deal.value)}`} />
        <DealDetailForm deal={deal} owners={owners} canAssign={canAssign} currentUser={currentUser} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white">Follow-ups</h3>
              <a href={`/follow-ups?dealId=${id}`} className="text-xs text-purple-300 hover:underline flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> New follow-up
              </a>
            </div>
            {followUps.length === 0 && <p className="text-sm text-white/40">No follow-ups scheduled.</p>}
            <ul className="space-y-2">
              {followUps.map((f) => (
                <li key={f.id} className="flex justify-between text-sm">
                  <span className="text-white/70">{f.title}</span>
                  <span className="flex items-center gap-2 text-white/40">
                    <Badge
                      variant={
                        f.status === 'COMPLETED'
                          ? 'success'
                          : f.status === 'CANCELLED'
                            ? 'neutral'
                            : f.status === 'OVERDUE'
                              ? 'danger'
                              : 'info'
                      }
                    >
                      {f.status}
                    </Badge>
                    {new Date(f.dueDate).toLocaleDateString('en-IN')}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h3 className="text-sm font-medium text-white mb-3">Activity</h3>
            {activities.length === 0 && <p className="text-sm text-white/40">No activity yet.</p>}
            <ul className="space-y-2">
              {activities.map((a) => (
                <li key={a.id} className="text-sm text-white/70">
                  <span className="text-white/40">{a.createdAt.toLocaleString('en-IN')}</span> — {a.description}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
