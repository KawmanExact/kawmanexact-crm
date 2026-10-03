import { notFound } from 'next/navigation'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/session'
import { OrgForm } from './org-form'

export const metadata = { title: 'Organization Settings | Kawman ExAct Admin' }

export default async function AdminOrganizationPage() {
  const session = await requirePermission('organizations.view')
  const organization = await prisma.organization.findUnique({ where: { id: session.user.organizationId } })
  if (!organization) notFound()

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Organization" subtitle="Your workspace profile" />
        <OrgForm organization={organization} />
      </div>
    </MainLayout>
  )
}
