import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DashboardGate() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-5">
        <ShieldAlert className="h-7 w-7 text-amber-400" />
      </div>
      <h2 className="text-xl font-semibold text-white">Dashboard access restricted</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-white/60">
        You don&apos;t have access to dashboards. Dashboards are available to <span className="font-medium text-white/80">Admin</span> and{' '}
        <span className="font-medium text-white/80">Super Admin</span> only. Please contact your admin to request
        access.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="outline" className="border-white/10 bg-white/[0.04] text-white hover:bg-white/10">
          <Link href="/leads">Go to Leads</Link>
        </Button>
        <Button asChild className="bg-purple-600 hover:bg-purple-700 text-white">
          <Link href="/files/my-files">Go to My Files</Link>
        </Button>
      </div>
      <p className="mt-4 text-xs text-white/35">If you believe this is a mistake, ask your admin to grant you the <span className="font-mono text-white/60">dashboard.view</span> permission.</p>
    </div>
  )
}
