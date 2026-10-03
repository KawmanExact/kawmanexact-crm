import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { User, Shield, ChevronRight } from 'lucide-react'

export const metadata = { title: 'Settings | Kawman ExAct' }

export default function SettingsPage() {
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Settings" subtitle="Manage your workspace preferences" />
        <div className="grid gap-3">
          <Link href="/settings/profile" className="block">
            <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4 hover:bg-white/[0.04] hover:border-white/[0.12] transition-colors group">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
                  <User className="h-4 w-4 text-purple-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">My Profile</p>
                  <p className="text-xs text-white/40">Name, email, phone, avatar and password</p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/40 transition-colors" />
              </div>
            </Card>
          </Link>
          <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4 opacity-60">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <Shield className="h-4 w-4 text-white/40" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Workspace Settings</p>
                <p className="text-xs text-white/40">Admin-only — manage organization, users and roles in <Link href="/admin/settings" className="text-purple-300 hover:underline">Admin → System Settings</Link></p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}
