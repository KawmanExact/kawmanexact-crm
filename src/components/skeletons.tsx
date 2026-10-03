import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'

/** Header row: title + subtitle placeholder, matching PageHeader's layout. */
export function PageHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-28 rounded-lg" />
    </div>
  )
}

/** Generic list/table page: header + a filter bar + N row placeholders. Used by Leads, Companies, Contacts, Follow-ups, etc. */
export function TablePageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <Card className="bg-[#0a111c]/80 border-white/[0.08]">
        <div className="flex items-center gap-3 p-4 border-b border-white/[0.06]">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="divide-y divide-white/[0.04]">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-1/5" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/** Dashboard-style page: header + a row of KPI cards + two content panels. Used by Dashboard, CRM Dashboard, Sales Reports. */
export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5 bg-[#0a111c]/80 border-white/[0.08] space-y-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-12" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4 bg-[#0a111c]/80 border-white/[0.08] h-64">
          <Skeleton className="h-full w-full" />
        </Card>
        <Card className="p-4 bg-[#0a111c]/80 border-white/[0.08] h-64">
          <Skeleton className="h-full w-full" />
        </Card>
      </div>
    </div>
  )
}

/** Record detail page: header + a form-shaped card + N related-record panels. Used by Company/Contact/Deal detail pages. */
export function DetailPageSkeleton({ panels = 3 }: { panels?: number }) {
  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeaderSkeleton />
      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </Card>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${panels > 2 ? 'xl:grid-cols-4' : ''} gap-6`}>
        {Array.from({ length: panels }).map((_, i) => (
          <Card key={i} className="p-4 bg-[#0a111c]/80 border-white/[0.08] space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </Card>
        ))}
      </div>
    </div>
  )
}

/** Kanban-style page: header + N columns of card stacks. Used by Deals. */
export function KanbanPageSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, col) => (
          <div key={col} className="space-y-3">
            <Skeleton className="h-5 w-20" />
            {Array.from({ length: 3 }).map((_, card) => (
              <Card key={card} className="p-3 bg-[#0a111c]/80 border-white/[0.08] space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
