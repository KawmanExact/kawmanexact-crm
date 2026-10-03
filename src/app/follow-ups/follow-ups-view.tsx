'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Check, X, AlertTriangle } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { FollowUpRow, LinkOption } from '@/services/followup.service'
import { createFollowUpAction, completeFollowUpAction, reopenFollowUpAction, deleteFollowUpAction } from './actions'

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: 'info',
  COMPLETED: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
}

const LINK_HREF: Record<'lead' | 'company' | 'deal', string> = {
  lead: '/leads',
  company: '/companies',
  deal: '/deals',
}

type StatusFilter = 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'CANCELLED'

export function FollowUpsView({
  followUps,
  linkOptions,
}: {
  followUps: FollowUpRow[]
  linkOptions: { leads: LinkOption[]; companies: LinkOption[]; deals: LinkOption[] }
}) {
  const [showForm, setShowForm] = useState(false)
  const [status, setStatus] = useState<StatusFilter>('ACTIVE')

  const filtered = useMemo(() => {
    return followUps.filter((f) => {
      if (status === 'ACTIVE') return f.status !== 'COMPLETED' && f.status !== 'CANCELLED'
      return f.status === status
    })
  }, [followUps, status])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-white/[0.08] p-0.5 text-xs">
          {(['ACTIVE', 'PENDING', 'COMPLETED', 'CANCELLED'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                status === s ? 'bg-purple-600 text-white' : 'text-white/50 hover:text-white'
              }`}
            >
              {s === 'ACTIVE' ? 'Active' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowForm((v) => !v)} className="ml-auto gap-1.5">
          <Plus className="h-4 w-4" />
          New follow-up
        </Button>
      </div>

      {showForm && <NewFollowUpForm linkOptions={linkOptions} onDone={() => setShowForm(false)} />}

      <Card className="bg-[#0a111c]/80 border-white/[0.08] divide-y divide-white/[0.05]">
        {filtered.length === 0 && <p className="text-sm text-white/40 p-6 text-center">No follow-ups here.</p>}
        {filtered.map((f) => (
          <FollowUpRowItem key={f.id} followUp={f} />
        ))}
      </Card>
    </div>
  )
}

function FollowUpRowItem({ followUp }: { followUp: FollowUpRow }) {
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div className="flex items-start gap-3 p-4">
      <button
        onClick={() =>
          startTransition(() => {
            if (followUp.status === 'COMPLETED') reopenFollowUpAction(followUp.id)
            else completeFollowUpAction(followUp.id)
          })
        }
        disabled={pending}
        title={followUp.status === 'COMPLETED' ? 'Mark as pending' : 'Mark as complete'}
        className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
          followUp.status === 'COMPLETED'
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-white/25 text-transparent hover:border-emerald-400'
        }`}
      >
        <Check className="h-3 w-3" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-sm font-medium ${followUp.status === 'COMPLETED' ? 'text-white/40 line-through' : 'text-white'}`}>
            {followUp.title}
          </p>
          <Badge variant={followUp.isOverdue ? 'danger' : STATUS_VARIANT[followUp.status]}>
            {followUp.isOverdue ? 'Overdue' : followUp.status.charAt(0) + followUp.status.slice(1).toLowerCase()}
          </Badge>
          {followUp.linkedTo && (
            <Link
              href={`${LINK_HREF[followUp.linkedTo.type]}/${followUp.linkedTo.id}`}
              className="text-xs text-purple-400 hover:underline"
            >
              {followUp.linkedTo.label}
            </Link>
          )}
        </div>
        {followUp.description && <p className="text-xs text-white/40 mt-1">{followUp.description}</p>}
        <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40">
          <span className="flex items-center gap-1">
            {followUp.isOverdue && <AlertTriangle className="h-3 w-3 text-red-400" />}
            Due {formatDate(followUp.dueDate)}
          </span>
          <span>·</span>
          <span>{followUp.ownerName}</span>
        </div>
      </div>

      <button
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
        className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 transition-colors"
        title="Delete"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this follow-up?"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={pending}
        onConfirm={() => startTransition(() => deleteFollowUpAction(followUp.id))}
      />
    </div>
  )
}

function NewFollowUpForm({
  linkOptions,
  onDone,
}: {
  linkOptions: { leads: LinkOption[]; companies: LinkOption[]; deals: LinkOption[] }
  onDone: () => void
}) {
  const [linkType, setLinkType] = useState<'none' | 'lead' | 'company' | 'deal'>('none')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const options =
    linkType === 'lead'
      ? linkOptions.leads
      : linkType === 'company'
        ? linkOptions.companies
        : linkType === 'deal'
          ? linkOptions.deals
          : []

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4">
      <form
        action={(formData) => {
          setError(null)
          startTransition(async () => {
            const result = await createFollowUpAction({}, formData)
            if (result.error) setError(result.error)
            else if (result.fieldErrors) setError(Object.values(result.fieldErrors)[0])
            else onDone()
          })
        }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm text-white/70">Title *</label>
          <input
            name="title"
            required
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            placeholder="Call about renewal terms"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-white/70">Due date *</label>
          <input
            name="dueDate"
            type="datetime-local"
            required
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-white/70">Priority</label>
          <select
            name="priority"
            defaultValue="MEDIUM"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-white/70">Link to</label>
          <select
            name="linkType"
            value={linkType}
            onChange={(e) => setLinkType(e.target.value as typeof linkType)}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="none">Nothing</option>
            <option value="lead">A lead</option>
            <option value="company">A company</option>
            <option value="deal">A deal</option>
          </select>
        </div>

        {linkType !== 'none' && (
          <div className="space-y-1.5">
            <label className="text-sm text-white/70">Which one?</label>
            <select
              name="linkId"
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm text-white/70">Notes</label>
          <textarea
            name="description"
            rows={2}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}

        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending} loading={pending} className="gap-1.5">
            {pending ? (
              'Saving…'
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Create follow-up
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  )
}
