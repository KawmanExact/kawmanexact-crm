import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { PaginatedMeetingsTable } from '@/components/meetings/meetings-table-paginated'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import Link from 'next/link'
import { getMeetingsPage, type MeetingSortKey } from '@/services/meeting.service'
import type { MeetingStatus } from '@/types/meetings'

export const metadata = { title: 'Meetings | Kawman ExAct' }

const STATUSES: MeetingStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
const SORT_KEYS: MeetingSortKey[] = ['scheduledAt', 'title', 'createdAt']

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  const search = first(params.q)
  const statusParam = first(params.status)
  const status = STATUSES.includes(statusParam as MeetingStatus) ? (statusParam as MeetingStatus) : undefined
  const sortParam = first(params.sort)
  const sortKey = SORT_KEYS.includes(sortParam as MeetingSortKey) ? (sortParam as MeetingSortKey) : undefined
  const dirParam = first(params.dir)
  const sortDir = dirParam === 'asc' ? 'asc' : dirParam === 'desc' ? 'desc' : undefined
  const pageParam = Number(first(params.page))
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined

  const result = await getMeetingsPage({ search, status, sortKey, sortDir, page })

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Meetings"
          subtitle={`${result.total} meetings`}
          action={
            <Button asChild className="gap-1.5">
              <Link href="/meetings/new">
                <Sparkles className="h-4 w-4" />
                New Meeting (MOM)
              </Link>
            </Button>
          }
        />
        <PaginatedMeetingsTable result={result} />
      </div>
    </MainLayout>
  )
}
