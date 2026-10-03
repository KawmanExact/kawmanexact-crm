'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { getInitials } from '@/lib/utils'
import { Search, Check, X } from 'lucide-react'
import type { TeamMemberRow, ActivityLevel } from '@/services/team.service'

const ACTIVITY_VARIANT: Record<ActivityLevel, 'success' | 'warning' | 'danger' | 'neutral'> = {
  high: 'success',   // green
  medium: 'warning', // amber/orange
  low: 'danger',     // red-ish via app's danger token (distinct from success/warning)
  none: 'neutral',   // gray
}

const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
}

export default function MembersTableClient({
  members,
}: {
  members: TeamMemberRow[]
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter((m) => {
      if (statusFilter === 'online' && !m.isOnline) return false
      if (statusFilter === 'offline' && m.isOnline) return false
      if (!q) return true
      return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    })
  }, [members, query, statusFilter])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee..."
            className="pl-9"
            aria-label="Search employee by name"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-white/60">
          <span className="shrink-0">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'online' | 'offline')}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            aria-label="Filter by online status"
          >
            <option value="all" className="bg-[#0a111c]">All Status</option>
            <option value="online" className="bg-[#0a111c]">Online</option>
            <option value="offline" className="bg-[#0a111c]">Offline</option>
          </select>
        </label>
        {(query || statusFilter !== 'all') && (
          <p className="text-xs text-white/40 self-center">
            Showing {filtered.length} of {members.length}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-white/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Department / Team</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Active time</th>
                <th className="px-4 py-3 font-medium text-center">Today&apos;s Report</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-white/40">
                    No members match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/my-team/${u.id}`} className="flex items-center gap-3 group">
                        <div className="h-8 w-8 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-semibold shrink-0">
                          {getInitials(u.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white group-hover:text-purple-300 transition-colors">{u.name}</p>
                          <p className="text-white/40 text-xs truncate">{u.email}</p>
                          {u.designation && <p className="text-white/30 text-xs truncate">{u.designation}</p>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {u.department ?? '—'}
                      {u.team && <span className="text-white/35"> / {u.team}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${u.isOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-white/25'}`} aria-hidden />
                        <span className={u.isOnline ? 'text-emerald-300' : 'text-white/50'}>{u.isOnline ? 'Online' : 'Offline'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/60 font-mono text-xs">{u.activeTimeToday}</td>
                    <td className="px-4 py-3 text-center">
                      {u.hasSubmittedTodayReport ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" title="Submitted today" aria-label="Submitted today">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.04] text-white/30 border border-white/10" title="Not submitted today" aria-label="Not submitted today">
                          <X className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ACTIVITY_VARIANT[u.activityLevel]}>{ACTIVITY_LABEL[u.activityLevel]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
