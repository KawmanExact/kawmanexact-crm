import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getContactById } from '@/services/contact.service'
import { getOrgUserOptions } from '@/services/user.service'
import { getCompanyOptions } from '@/services/company.service'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { canManageAssignments } from '@/lib/record-scope'
import { formatCurrency } from '@/lib/utils'
import { ContactDetailForm } from './contact-detail-form'
import type { UserOption } from '@/services/user.service'
import { isOk } from '@/lib/result'

export const metadata = { title: 'Contact Detail | Kawman ExAct' }

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [contact, ownersResult] = await Promise.all([
    getContactById(id),
    getOrgUserOptions(),
  ])
  if (!contact) notFound()
  const owners = isOk(ownersResult) ? ownersResult.data : []

  const session = await requireApiSession()
  const canAssign = canManageAssignments(session.user)
  const currentUser: UserOption = { id: session.user.id, name: session.user.name ?? 'Me' }
  const [companyOptions, deals, activities, followUps] = await Promise.all([
    getCompanyOptions(),
    prisma.deal.findMany({
      where: { contactId: id, organizationId: session.user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, value: true },
    }),
    prisma.activity.findMany({
      where: { contactId: id, organizationId: session.user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { actor: { select: { name: true } } },
    }),
    prisma.followUp.findMany({
      where: {
        organizationId: session.user.organizationId,
        OR: [
          { contactId: id },
          { deal: { contactId: id } },
        ],
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
      include: { deal: { select: { id: true, name: true } } },
    }),
  ])

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title={contact.name}
          subtitle={
            contact.companyId ? (
              <Link href={`/companies/${contact.companyId}`} className="hover:text-purple-300 transition-colors">
                {contact.company}
              </Link>
            ) : (
              contact.company
            )
          }
        />
        <ContactDetailForm contact={contact} owners={owners} canAssign={canAssign} currentUser={currentUser} companies={companyOptions} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h3 className="text-sm font-medium text-white mb-3">Deals</h3>
            {deals.length === 0 && <p className="text-sm text-white/40">No deals yet.</p>}
            <ul className="space-y-2">
              {deals.map((d) => (
                <li key={d.id} className="flex justify-between text-sm">
                  <Link href={`/deals/${d.id}`} className="text-white/70 hover:text-purple-300 truncate pr-2">
                    {d.name}
                  </Link>
                  <span className="text-white/40 shrink-0">{formatCurrency(Number(d.value))}</span>
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

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white">Follow-ups</h3>
            <Button size="sm" variant="ghost" className="gap-1.5" asChild>
              <a href={`/follow-ups?contactId=${id}`}>
                <Plus className="h-3.5 w-3.5" /> New follow-up
              </a>
            </Button>
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
      </div>
    </MainLayout>
  )
}
