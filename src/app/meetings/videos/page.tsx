import Link from 'next/link'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { Video, ExternalLink, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { getMeetings } from '@/services/meeting.service'

export const metadata = { title: 'Meeting Videos | Kawman ExAct' }

export default async function MeetingVideosPage() {
  const meetings = await getMeetings()
  const withRecording = meetings.filter((m) => m.hasRecording)
  const withoutRecording = meetings.filter((m) => !m.hasRecording && m.status === 'COMPLETED')

  return (
    <MainLayout>
      <div className="space-y-8">
        <PageHeader title="Meeting Videos" subtitle={`${withRecording.length} recordings linked`} />

        {meetings.length === 0 ? (
          <Card className="bg-[#0a111c]/80 border-white/[0.08] py-14 text-center">
            <Video className="h-6 w-6 text-white/30 mx-auto mb-2" />
            <p className="text-white/40 text-sm">No meetings yet</p>
          </Card>
        ) : (
          <>
            <div>
              <h2 className="text-sm font-semibold text-white/70 mb-3">Recorded meetings</h2>
              {withRecording.length === 0 ? (
                <p className="text-white/35 text-sm">No recordings linked yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {withRecording.map((m) => (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}`}
                      className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="h-9 w-9 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                        <Video className="h-4 w-4 text-blue-300" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">{m.title}</p>
                        <p className="text-white/40 text-xs mt-0.5">
                          {m.companyName ?? 'No company'} · {format(new Date(m.scheduledAt), 'd MMM yyyy')}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-white/30 ml-auto shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {withoutRecording.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-white/70 mb-3">Completed, no recording yet</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {withoutRecording.map((m) => (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] p-4 hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-white/70 font-medium truncate">{m.title}</p>
                        <p className="text-white/35 text-xs mt-0.5">{format(new Date(m.scheduledAt), 'd MMM yyyy')}</p>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-purple-400 shrink-0">
                        <Plus className="h-3 w-3" />
                        Add link
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  )
}
