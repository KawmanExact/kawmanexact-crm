import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getCalendarEvents } from '@/services/calendar.service'
import { CalendarView } from './calendar-view'

export const metadata = { title: 'Calendar | Kawman ExAct' }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const now = new Date()

  const yearParam = Number(first(params.year))
  const monthParam = Number(first(params.month))
  const year = Number.isInteger(yearParam) && yearParam > 0 ? yearParam : now.getFullYear()
  const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : now.getMonth() + 1

  const events = await getCalendarEvents(year, month)

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Calendar" subtitle="Meetings, field visits, and follow-ups in one place" />
        <CalendarView year={year} month={month} events={events} />
      </div>
    </MainLayout>
  )
}
