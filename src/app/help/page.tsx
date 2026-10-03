import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { Search, Bell, SunMoon, LayoutDashboard, Keyboard } from 'lucide-react'

export const metadata = { title: 'Help | Kawman ExAct' }

export default function HelpPage() {
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Help" subtitle="Shortcuts and how to use the workspace" />
        <div className="grid gap-4">
          <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Keyboard className="h-4 w-4 text-white/40" /> Keyboard</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-white/60">
              <li><kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-xs">⌘K</kbd> / <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-xs">Ctrl+K</kbd> — Open global search (leads, companies, contacts, deals, meetings, files)</li>
              <li><kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-xs">Esc</kbd> — Close search / drawer</li>
            </ul>
          </Card>
          <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Search className="h-4 w-4 text-white/40" /> Search</h3>
            <p className="mt-2 text-sm text-white/60">Click the search bar or press <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-xs">⌘K</kbd> anywhere. Type at least 2 characters — results are org-scoped and grouped by type. Arrow keys + Enter to jump.</p>
          </Card>
          <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Bell className="h-4 w-4 text-white/40" /> Notifications</h3>
            <p className="mt-2 text-sm text-white/60">Bell icon shows unread count (refreshes every 60s). Open the menu to see the latest 6, click an item to mark it read, or open <a href="/notifications" className="text-purple-300 hover:underline">View all notifications</a> for the full history.</p>
          </Card>
          <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><SunMoon className="h-4 w-4 text-white/40" /> Theme</h3>
            <p className="mt-2 text-sm text-white/60">Use the 3-way toggle (Light / Dark / System) in the header. Choice is persisted and drives the <code className="text-purple-300">next-themes</code> provider. The canvas is dark-first, so Light mostly affects the <code className="text-white/50">html</code> class for future design-token work.</p>
          </Card>
          <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><LayoutDashboard className="h-4 w-4 text-white/40" /> More</h3>
            <ul className="mt-2 space-y-1 text-sm text-white/60">
              <li>Sidebar collapse is on desktop (panel icon). On mobile use the hamburger.</li>
              <li>Account menu → Profile / Settings / Sign out.</li>
            </ul>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}
