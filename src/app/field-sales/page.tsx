import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { FieldVisitsTable } from '@/components/field-sales/field-visits-table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getFieldVisitsPage, type FieldVisitSortKey } from '@/services/field-visit.service'
import type { VisitStatus } from '@/types/field-sales'
import { requireSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'

export const metadata = { title: 'Field Visits | Kawman ExAct' }

const STATUSES: VisitStatus[] = ['SCHEDULED', 'ON_THE_WAY', 'CHECKED_IN', 'IN_MEETING', 'COMPLETED', 'CANCELLED']
const SORT_KEYS: FieldVisitSortKey[] = ['scheduledAt', 'title', 'createdAt']

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function FieldVisitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  const permissions = session.user.permissions as string[]
  const canEdit = permissions.includes(PERMISSIONS['field_visits.update'].name)

  const params = await searchParams

  const search = first(params.q)
  const statusParam = first(params.status)
  const status = STATUSES.includes(statusParam as VisitStatus) ? (statusParam as VisitStatus) : undefined
  const sortParam = first(params.sort)
  const sortKey = SORT_KEYS.includes(sortParam as FieldVisitSortKey) ? (sortParam as FieldVisitSortKey) : undefined
  const dirParam = first(params.dir)
  const sortDir = dirParam === 'asc' ? 'asc' : dirParam === 'desc' ? 'desc' : undefined
  const pageParam = Number(first(params.page))
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined

  const result = await getFieldVisitsPage({ search, status, sortKey, sortDir, page })

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Field Visits"
          subtitle={`${result.total} visits tracked`}
          action={
            <Button asChild className="gap-1.5">
              <Link href="/field-sales/new">
                <Plus className="h-4 w-4" />
                Schedule Visit
              </Link>
            </Button>
          }
        />
        <FieldVisitsTable result={result} canEdit={canEdit} />
      </div>
    </MainLayout>
  )
}
