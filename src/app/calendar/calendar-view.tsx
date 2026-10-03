'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, CalendarClock, MapPin, ClipboardList } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { CalendarEvent, CalendarEventType } from '@/services/calendar.service'

const TYPE_ICON: Record<CalendarEventType, typeof CalendarClock> = {
  meeting: CalendarClock,
  visit: MapPin,
  followup: ClipboardList,
}

const TYPE_DOT: Record<CalendarEventType, string> = {
  meeting: 'bg-blue-400',
  visit: 'bg-emerald-400',
  followup: 'bg-orange-400',
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b)
}

export function CalendarView({ year, month, events }: { year: number; month: number; events: CalendarEvent[] }) {
  const router = useRouter()
  const today = new Date()
  const monthStart = new Date(year, month - 1, 1)
  const [selectedDate, setSelectedDate] = useState<Date>(
    monthStart.getFullYear() === today.getFullYear() && monthStart.getMonth() === today.getMonth() ? today : monthStart
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = dateKey(new Date(event.at))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    }
    return map
  }, [events])

  // Build a 6-week grid starting from the Sunday on/before the 1st.
  const gridStart = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(d.getDate() + i)
    return d
  })

  function goToMonth(delta: number) {
    const next = new Date(year, month - 1 + delta, 1)
    router.push(`/calendar?year=${next.getFullYear()}&month=${next.getMonth() + 1}`)
  }

  const selectedEvents = (eventsByDay.get(dateKey(selectedDate)) ?? []).sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">
            {monthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToMonth(-1)}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-white/50 hover:bg-white/[0.06] hover:text-white transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => goToMonth(1)}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-white/50 hover:bg-white/[0.06] hover:text-white transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="text-center text-xs text-white/35 font-medium py-1">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const inMonth = day.getMonth() === month - 1
            const dayEvents = eventsByDay.get(dateKey(day)) ?? []
            const isToday = isSameDay(day, today)
            const isSelected = isSameDay(day, selectedDate)

            return (
              <button
                key={dateKey(day)}
                onClick={() => setSelectedDate(day)}
                className={`aspect-square sm:aspect-auto sm:h-20 rounded-lg border p-1.5 text-left transition-colors flex flex-col ${
                  isSelected
                    ? 'border-purple-500/60 bg-purple-500/10'
                    : 'border-white/[0.05] hover:bg-white/[0.03]'
                } ${!inMonth ? 'opacity-30' : ''}`}
              >
                <span
                  className={`text-xs font-medium ${
                    isToday ? 'h-5 w-5 rounded-full bg-purple-600 text-white flex items-center justify-center' : 'text-white/70'
                  }`}
                >
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-auto">
                    {dayEvents.slice(0, 4).map((e) => (
                      <span key={`${e.type}-${e.id}`} className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[e.type]}`} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4">
        <h3 className="text-sm font-medium text-white mb-1">
          {selectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h3>
        <p className="text-xs text-white/40 mb-4">
          {selectedEvents.length} event{selectedEvents.length === 1 ? '' : 's'}
        </p>

        {selectedEvents.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-8">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-2">
            {selectedEvents.map((event) => {
              const Icon = TYPE_ICON[event.type]
              return (
                <li key={`${event.type}-${event.id}`}>
                  <Link
                    href={event.href}
                    className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 hover:bg-white/[0.05] transition-colors"
                  >
                    <Icon className="h-4 w-4 text-white/40 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-white truncate">{event.title}</p>
                        {event.isOverdue && <Badge variant="danger">Overdue</Badge>}
                      </div>
                      <p className="text-xs text-white/40 truncate">
                        {new Date(event.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                        {event.subtitle}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
