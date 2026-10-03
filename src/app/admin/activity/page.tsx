import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Filter } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/session'
import { getSession } from '@/lib/session'
import { ExportMenu } from '@/components/report-engine/export-menu'
import { buildAuditLogReport } from '@/lib/report-engine/builders/audit-logs'
import { format } from 'date-fns'

export const metadata = { title: 'Activity Logs | Kawman ExAct Admin' }

const ACTION_VARIANT: Record<string, 'success' | 'neutral' | 'danger' | 'warning' | 'info'> = {
  LOGIN: 'success',
  LOGOUT: 'neutral',
  FAILED_LOGIN: 'danger',
  PASSWORD_CHANGE: 'warning',
  ROLE_CHANGE: 'info',
  PERMISSION_CHANGE: 'info',
  USER_DELETION: 'danger',
  FILE_DELETION: 'warning',
  FILE_SHARING: 'info',
  DATA_EXPORT: 'warning',
  ADMIN_CHANGES: 'info',
  SECURITY_CHANGES: 'danger',
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
}

const ACTIONS = Object.keys(ACTION_VARIANT)

function first(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v }

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePermission('audit_logs.view')
  const params = await searchParams
  const from = first(params.from)
  const to = first(params.to)
  const action = first(params.action)
  const actor = first(params.actor)
  const resource = first(params.resource)
  const page = Math.max(1, Number(first(params.page)) || 1)
  const pageSize = 50

  const where: Record<string, unknown> = {}
  // org scoping
  const session = await getSession()
  const organizationId = (session?.user as unknown as { organizationId?: string })?.organizationId
  if (organizationId) (where as Record<string, unknown>).organizationId = organizationId
  if (action && ACTIONS.includes(action)) (where as Record<string, unknown>).action = action
  if (actor) (where as Record<string, unknown>).actorId = actor
  if (resource) (where as Record<string, unknown>).resource = resource
  if (from || to) {
    ;(where as Record<string, unknown>).createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: where as never,
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where: where as never }),
  ])
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const sessionUser = session?.user as unknown as { name?: string; email?: string; organization?: { name?: string } | null } | undefined
  const exportReport = buildAuditLogReport({
    rows: logs.map((l) => ({
      createdAt: l.createdAt.toISOString(),
      action: l.action,
      actor: (l as unknown as { actor?: { name?: string | null } }).actor?.name ?? 'Unknown',
      actorEmail: (l as unknown as { actor?: { email?: string | null } }).actor?.email ?? '',
      resource: l.resource,
      resourceId: (l as unknown as { resourceId?: string | null }).resourceId ?? '',
      metadata: (l as unknown as { metadata?: unknown }).metadata ? JSON.stringify((l as unknown as { metadata: unknown }).metadata) : '',
    })),
    generatedBy: sessionUser?.name ?? sessionUser?.email,
    organizationName: sessionUser?.organization?.name ?? undefined,
    filters: {
      ...(from ? { From: from } : {}),
      ...(to ? { To: to } : {}),
      ...(action ? { Action: action } : {}),
      ...(actor ? { Actor: actor } : {}),
      ...(resource ? { Resource: resource } : {}),
    },
  })

  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  if (action) qs.set('action', action)

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Activity Logs"
          subtitle={`${total} events · page ${page} of ${pageCount} · scoped to your organization`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/api/admin/audit-logs/export?${qs.toString()}`}
                download
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/[0.08] hover:text-white"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </a>
              <ExportMenu report={exportReport} />
            </div>
          }
        />

        <form className="flex flex-wrap gap-2 items-end bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
          <label className="text-xs text-white/50">From <input name="from" type="date" defaultValue={from ?? ''} className="ml-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" /></label>
          <label className="text-xs text-white/50">To <input name="to" type="date" defaultValue={to ?? ''} className="ml-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" /></label>
          <label className="text-xs text-white/50">Action
            <select name="action" defaultValue={action ?? ''} className="ml-1 rounded-md border border-white/10 bg-[#0a111c] px-2 py-1 text-xs text-white">
              <option value="">All</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <Button type="submit" size="sm" variant="secondary" className="gap-1.5"><Filter className="h-3.5 w-3.5" /> Filter</Button>
          {(from || to || action || actor || resource) && (
            <a href="/admin/activity" className="text-xs text-white/40 hover:text-white underline">Clear</a>
          )}
        </form>

        <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#0a111c]/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.03] text-left text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Resource</th>
                <th className="px-4 py-2 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-2 text-white/60 whitespace-nowrap">{format(l.createdAt, 'd MMM yyyy, h:mm a')}</td>
                  <td className="px-4 py-2"><Badge variant={(ACTION_VARIANT[l.action] ?? 'info') as never}>{l.action}</Badge></td>
                  <td className="px-4 py-2 text-white/70">{l.resource}</td>
                  <td className="px-4 py-2 text-white/60">{(l as unknown as { actor?: { name?: string | null; email?: string | null } }).actor?.name ?? (l as unknown as { actor?: { name?: string | null; email?: string | null } }).actor?.email ?? '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-white/40">
                    No activity events match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between text-xs text-white/40">
            <span>Page {page} of {pageCount} · {total} total</span>
            <div className="flex gap-2">
              {page > 1 && <a href={`/admin/activity?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k,v]) => [k, first(v as string | string[] | undefined) ?? ''])), page: String(page-1)}).toString()}`} className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5 text-white/60">Prev</a>}
              {page < pageCount && <a href={`/admin/activity?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k,v]) => [k, first(v as string | string[] | undefined) ?? ''])), page: String(page+1)}).toString()}`} className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5 text-white/60">Next</a>}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
