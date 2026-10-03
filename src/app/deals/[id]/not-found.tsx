import Link from 'next/link'
import { FileX, ArrowLeft, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center mx-auto">
          <FileX className="h-6 w-6 text-white/30" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Not found</h2>
          <p className="text-sm text-white/50 mt-1">
            This record doesn&apos;t exist, was deleted, or you don&apos;t have access to it.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => history.back()} className="inline-flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Go back
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
