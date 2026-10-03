
'use client'

import { useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import { X, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'

type Notif = {
  id: string
  type: string
  title: string
  message: string
  data: { userId?: string; dailyReportId?: string; visitId?: string; assignedById?: string; scheduledAt?: string } | null
  createdAt: string
  isRead: boolean
}

function hrefFor(n: Notif): string | null {
  if (n.type === 'VISIT_ASSIGNED' && n.data?.visitId) return '/field-sales/assigned'
  if (n.type === 'DAILY_REPORT_SUBMITTED' && n.data?.userId) return '/admin/my-team/' + n.data.userId
  return null
}

function getTypeIcon(type: string) {
  const icons: Record<string, React.ReactNode> = {
    NEW_LEAD: <span className='text-purple-400'>👤</span>,
    DEAL_UPDATED: <span className='text-blue-400'>💼</span>,
    MEETING_REMINDER: <span className='text-emerald-400'>📅</span>,
    FOLLOW_UP_DUE: <span className='text-orange-400'>⏰</span>,
    FILE_SHARED: <span className='text-cyan-400'>📎</span>,
    FILE_UPLOADED: <span className='text-cyan-400'>📁</span>,
    AI_REPORT_READY: <span className='text-fuchsia-400'>🤖</span>,
    CHECK_IN_COMPLETED: <span className='text-emerald-400'>✅</span>,
    SECURITY_EVENT: <span className='text-red-400'>🔒</span>,
    DAILY_REPORT_SUBMITTED: <span className='text-indigo-400'>📝</span>,
    VISIT_ASSIGNED: <span className='text-amber-400'>📍</span>,
  }
  return icons[type] || <span className='text-white/40'>🔔</span>
}

export function NotificationsClient({ initial }: { initial: Notif[] }) {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<Notif[]>(initial)
  const [clearing, setClearing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(initial.length)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const unread = items.filter((n) => !n.isRead).length

  async function remove(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id))
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch {}
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  async function clearAll() {
    if (items.length === 0 || clearing) return
    setClearing(true)
    setItems([])
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    } catch {}
    setClearing(false)
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  async function markAsRead(ids: string[]) {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: ids, markAll: false }),
      })
      setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n)))
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    } catch {}
  }

  async function markAllAsRead() {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      })
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    } catch {}
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch('/api/notifications?limit=20&offset=' + offset)
      if (res.ok) {
        const data = await res.json()
        const newItems = ((data.notifications || []) as Notif[]).map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          data: n.data,
          createdAt: n.createdAt,
          isRead: n.isRead,
        }))
        if (newItems.length > 0) {
          setItems((prev) => [...prev, ...newItems])
          setOffset((prev) => prev + newItems.length)
        }
        setHasMore(data.hasMore ?? false)
      }
    } catch {}
    setLoadingMore(false)
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
        <div className='flex items-center gap-3'>
          <p className='text-xs text-white/40'>
            {unread} unread · {items.length} total
          </p>
          {unread > 0 && (
            <Button
              variant='ghost'
              size='sm'
              onClick={markAllAsRead}
              className='h-7 text-xs gap-1.5 text-white/60 hover:text-white'
            >
              Mark all read
            </Button>
          )}
        </div>
        {items.length > 0 && (
          <Button
            variant='ghost'
            size='sm'
            onClick={clearAll}
            disabled={clearing}
            className='h-7 text-xs gap-1.5 text-white/60 hover:text-white'
          >
            <Trash2 className='h-3.5 w-3.5' />
            {clearing ? 'Clearing…' : 'Clear all'}
          </Button>
        )}
      </div>

      <div className='rounded-xl border border-white/[0.08] divide-y divide-white/[0.06] bg-white/[0.02] overflow-hidden'>
        {items.length === 0 && (
          <p className='text-sm text-white/40 p-6 text-center'>You&apos;re all caught up — no notifications yet.</p>
        )}
        {items.map((n) => {
          const href = hrefFor(n)
          const isExpanded = expandedIds.has(n.id)

          return (
            <div
              key={n.id}
              className={'p-4 flex items-start gap-3 group ' + (!n.isRead ? 'bg-purple-500/[0.03]' : '') + ' hover:bg-white/[0.04] transition-colors'}
            >
              <div className='flex flex-col items-center shrink-0'>
                <span className={'mt-1.5 h-2 w-2 rounded-full shrink-0 ' + (!n.isRead ? 'bg-purple-400' : 'bg-white/15')} />
                {!n.isRead && (
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-6 w-6 mt-1 p-0 text-white/30 hover:text-white'
                    onClick={() => markAsRead([n.id])}
                    aria-label='Mark as read'
                  >
                    <span className='h-3.5 w-3.5' />
                  </Button>
                )}
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex items-start gap-2'>
                  <span className='mt-0.5'>{getTypeIcon(n.type)}</span>
                  <div className='flex-1 min-w-0'>
                    <p className={'text-sm font-medium text-white ' + (!n.isRead ? '' : 'text-white/70')}>{n.title}</p>
                    <p className='text-sm text-white/55 mt-0.5'>{n.message}</p>
                    <p className='text-xs text-white/35 mt-1'>{formatRelativeTime(n.createdAt)}</p>
                    {isExpanded && n.data && (
                      <div className='mt-2 p-2 bg-white/[0.03] rounded text-xs text-white/50'>
                        <pre>{JSON.stringify(n.data, null, 2)}</pre>
                      </div>
                    )}
                    {href && (
                      <p className='text-xs text-indigo-300 mt-1.5'>Click to view →</p>
                    )}
                  </div>
                </div>
              </div>
              <div className='flex items-center gap-1 shrink-0'>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7 text-white/30 hover:text-white hover:bg-white/10'
                  onClick={() => toggleExpand(n.id)}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7 text-white/30 hover:text-white hover:bg-white/10'
                  onClick={() => remove(n.id)}
                  aria-label='Dismiss notification'
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            </div>
          )
        })}
        {hasMore && (
          <div className='p-4 text-center border-t border-white/[0.06]'>
            <Button
              variant='ghost'
              size='sm'
              onClick={loadMore}
              disabled={loadingMore}
              className='w-full'
            >
              {loadingMore ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin mr-2' />
                  Loading...
                </>
              ) : (
                'Load more'
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
