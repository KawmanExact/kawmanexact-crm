import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getCompanyById } from '@/services/company.service'
import { getOrgUserOptions } from '@/services/user.service'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { canManageAssignments } from '@/lib/record-scope'
import { formatCurrency } from '@/lib/utils'
import { CompanyDetailForm } from './company-detail-form'
import type { UserOption } from '@/services/user.service'
import { isOk } from '@/lib/result'

export const metadata = { title: 'Company Detail | Kawman ExAct' }

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [company, ownersResult] = await Promise.all([getCompanyById(id), getOrgUserOptions()])
  if (!company) notFound()
  const owners = isOk(ownersResult) ? ownersResult.data : []

  const session = await requireApiSession()
  const canAssign = canManageAssignments(session.user)
  const currentUser: UserOption = { id: session.user.id, name: session.user.name ?? 'Me' }
  const [leads, contacts, deals, activities] = await Promise.all([
    prisma.lead.findMany({
      where: { companyId: id, organizationId: session.user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, status: true, value: true },
    }),
    prisma.contact.findMany({
      where: { companyId: id, organizationId: session.user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, designation: true, email: true },
    }),
    prisma.deal.findMany({
      where: { companyId: id, organizationId: session.user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, value: true, stage: true },
    }),
    prisma.activity.findMany({
      where: { companyId: id, organizationId: session.user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { actor: { select: { name: true } } },
    }),
  ])

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader title={company.name} subtitle={company.industry} />
        <CompanyDetailForm company={company} owners={owners} canAssign={canAssign} currentUser={currentUser} />

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h3 className="text-sm font-medium text-white mb-3">Leads</h3>
            {leads.length === 0 && <p className="text-sm text-white/40">No leads yet.</p>}
            <ul className="space-y-2">
              {leads.map((l) => (
                <li key={l.id} className="flex justify-between text-sm">
                  <Link href={`/leads/${l.id}`} className="text-white/70 hover:text-purple-300 truncate pr-2">
                    {l.name}
                  </Link>
                  <span className="text-white/40 shrink-0">{l.status.replace('_', ' ')}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h3 className="text-sm font-medium text-white mb-3">Contacts</h3>
            {contacts.length === 0 && <p className="text-sm text-white/40">No contacts yet.</p>}
            <ul className="space-y-2">
              {contacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/contacts/${c.id}`} className="text-sm text-white/70 hover:text-purple-300">
                    {c.name}
                    {c.designation && <span className="text-white/40"> — {c.designation}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

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
      </div>
    </MainLayout>
  )
}
