import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { requireSession } from '@/lib/session'
import { NotificationsClient } from './notifications-client'
import { headers } from 'next/headers'

export const metadata = { title: 'Notifications | Kawman ExAct' }

export default async function NotificationsPage() {
  // Redirects to /login when there is no session.
  await requireSession()

  // Get session token from cookies for API call
  const headersList = await headers()
  const cookieHeader = headersList.get('cookie') || ''
  const sessionTokenMatch = cookieHeader.match(/better-auth\.session_token=([^;]+)/)
  const sessionToken = sessionTokenMatch ? sessionTokenMatch[1] : ''

  // Fetch initial notifications from server
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/notifications?limit=50`, {
    headers: { Cookie: `better-auth.session_token=${sessionToken}` },
    cache: 'no-store',
  })

  let initial: Array<{
    id: string
    type: string
    title: string
    message: string
    data: { userId?: string; dailyReportId?: string; visitId?: string } | null
    createdAt: string
    isRead: boolean
  }> = []

  if (res.ok) {
    const data = await res.json()
    initial = ((data.notifications || []) as Array<{
      id: string
      type: string
      title: string
      message: string
      data: { userId?: string; dailyReportId?: string; visitId?: string } | null
      createdAt: string
      isRead: boolean
    }>).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      data: n.data,
      createdAt: n.createdAt,
      isRead: n.isRead,
    }))
  }

  const unread = initial.filter((n) => !n.isRead).length

  return (
    <MainLayout>
      <div className="space-y-6 max-w-2xl">
        <PageHeader title="Notifications" subtitle={`${unread} unread · ${initial.length} total`} />
        <NotificationsClient initial={initial} />
      </div>
    </MainLayout>
  )
}
