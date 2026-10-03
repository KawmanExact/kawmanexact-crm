'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldAlert, X } from 'lucide-react'

const SECTION_LABELS: Record<string, string> = {
  'users.view': 'User Management',
  'users.create': 'User Management',
  'users.update': 'User Management',
  'users.delete': 'User Management',
  'roles.view': 'Roles & Permissions',
  'roles.update': 'Roles & Permissions',
  'organizations.view': 'Organizations',
  'settings.manage': 'System Settings',
  'files.manage': 'Storage',
  'audit_logs.view': 'Logs',
  'dashboard.view': 'Admin Dashboard',
  'team.view': 'My Team',
  'team.view_all': 'Team Reports',
  'reports.submit': 'Daily Reports',
  'reports.view_all': 'Team Insights',
}

function labelForPermission(key: string): string {
  if (SECTION_LABELS[key]) return SECTION_LABELS[key]
  // e.g. "leads.create" → "Leads"
  const prefix = key.split('.')[0]
  if (!prefix) return 'this section'
  return prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

export function ForbiddenBanner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const section = searchParams.get('section')
  const [dismissed, setDismissed] = useState(false)

  // Clear query params after showing — so refresh doesn't re-trigger.
  // We do it on mount regardless of dismissed, but only when error=forbidden.
  useEffect(() => {
    if (error !== 'forbidden') return
    // Delay replace until after first paint so the banner is visible.
    const t = setTimeout(() => {
      router.replace('/dashboard')
    }, 300)
    return () => clearTimeout(t)
  }, [error, router])

  if (error !== 'forbidden' || dismissed) return null

  const sectionName = section ? labelForPermission(section) : 'this section'

  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
      role="alert"
    >
      <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
      <p className="flex-1 leading-5">
        You don&apos;t have access to <span className="font-semibold text-amber-100">{sectionName}</span>. Please
        contact your admin to request access.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md p-1 text-amber-300/70 hover:text-amber-100 hover:bg-amber-500/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
