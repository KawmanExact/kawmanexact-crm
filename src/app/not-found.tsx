import Link from 'next/link'
import { SearchX, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mx-auto">
          <SearchX className="h-6 w-6 text-white/40" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Page not found</h2>
          <p className="text-sm text-white/50 mt-1">
            The page you&apos;re looking for doesn&apos;t exist or was moved.
          </p>
        </div>
        <Button asChild className="gap-1.5">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Go to dashboard
          </Link>
        </Button>
      </div>
    </div>
  )
}
