import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { VisitForm } from '../../new/visit-form'
import { getOrgUserOptions } from '@/services/user.service'
import type { UserOption } from '@/services/user.service'
import { isOk } from '@/lib/result'
import { requirePermission } from '@/lib/session'
import { canManageAssignments } from '@/lib/record-scope'
import { getFieldVisitById } from '@/services/field-visit.service'
import { PERMISSIONS } from '@/lib/permissions-data'

export const metadata = { title: 'Edit Visit | Kawman ExAct' }

export default async function EditFieldVisitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requirePermission(PERMISSIONS['field_visits.update'].name)
  const { id } = await params

  const [visit, ownersResult] = await Promise.all([
    getFieldVisitById(id),
    getOrgUserOptions(),
  ])
  if (!visit) notFound()

  const owners = isOk(ownersResult) ? ownersResult.data : []
  const canAssign = canManageAssignments(session.user)
  const currentUser: UserOption = { id: session.user.id, name: session.user.name ?? 'Me' }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader
          title="Edit Visit"
          subtitle={`Update "${visit.title}"`}
          action={
            <Link
              href="/field-sales"
              className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to field visits
            </Link>
          }
        />
        <VisitForm mode="edit" visit={visit} owners={owners} canAssign={canAssign} currentUser={currentUser} />
      </div>
    </MainLayout>
  )
}
