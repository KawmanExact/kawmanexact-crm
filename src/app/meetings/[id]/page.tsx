import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, Clock, MapPin, Video as VideoIcon, Building2, User as UserIcon, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getMeetingById } from '@/services/meeting.service'
import { isAIConfigured } from '@/lib/ai'
import { TranscriptPanel } from '@/components/meetings/transcript-panel'
import { RecordingPanel } from '@/components/meetings/recording-panel'
import { MomPanel } from '@/components/meetings/mom-panel'
import { MeetingStatusSelect } from './meeting-status-select'
import { MeetingHeaderActions } from '@/components/meetings/meeting-header-actions'
import { retryMeetingVideoProcessingAction } from '../actions'

export const metadata = { title: 'Meeting | Kawman ExAct' }

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const meeting = await getMeetingById(id)
  if (!meeting) notFound()

  const hasTranscriptOrNotes = Boolean(meeting.transcript?.content?.trim() || meeting.notes?.trim())
  const isProcessing = meeting.status === 'PROCESSING'
  const isFailed = meeting.status === 'FAILED'

  return (
    <MainLayout>
      <div className="space-y-6 max-w-5xl">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <Link href="/meetings">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to meetings
          </Link>
        </Button>

        <PageHeader
          title={meeting.title}
          subtitle={`Created by ${meeting.createdBy}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <MeetingHeaderActions meetingId={meeting.id} title={meeting.title} />
              <MeetingStatusSelect meetingId={meeting.id} status={meeting.status} />
              {isFailed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await retryMeetingVideoProcessingAction(meeting.id)
                    window.location.reload()
                  }}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry processing
                </Button>
              )}
            </div>
          }
        />

        {isProcessing && (
          <Card className="bg-purple-500/10 border-purple-500/20 p-5">
            <div className="flex items-center gap-3 text-purple-300">
              <Loader2 className="h-5 w-5 animate-spin" />
              <div>
                <p className="font-medium">Processing video…</p>
                <p className="text-sm text-white/60">Transcribing audio and generating MoM. This may take a few minutes.</p>
              </div>
            </div>
          </Card>
        )}

        {isFailed && (
          <Card className="bg-red-500/10 border-red-500/20 p-5">
            <div className="flex items-center gap-3 text-red-300">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="font-medium">Video processing failed</p>
                <p className="text-sm text-white/60">The video could not be transcribed or the MoM generation failed. Click &quot;Retry processing&quot; to try again.</p>
              </div>
            </div>
          </Card>
        )}

        <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {meeting.scheduledAt && (
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="When">
              {format(new Date(meeting.scheduledAt), 'EEEE, d MMM yyyy · h:mm a')}
            </InfoRow>
          )}
          {meeting.duration && (
            <InfoRow icon={<Clock className="h-4 w-4" />} label="Duration">
              {meeting.duration} minutes
            </InfoRow>
          )}
          {meeting.location && (
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location">
              {meeting.location}
            </InfoRow>
          )}
          {meeting.meetingLink && (
            <InfoRow icon={<VideoIcon className="h-4 w-4" />} label="Meeting link">
              <a href={meeting.meetingLink} target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300">
                {meeting.meetingLink}
              </a>
            </InfoRow>
          )}
          {meeting.companyName && (
            <InfoRow icon={<Building2 className="h-4 w-4" />} label="Company">
              {meeting.companyName}
              {meeting.contactName ? ` · ${meeting.contactName}` : ''}
            </InfoRow>
          )}
          <InfoRow icon={<UserIcon className="h-4 w-4" />} label="Participants">
            {meeting.participants.map((p) => p.name).join(', ')}
          </InfoRow>
          {meeting.notes && (
            <div className="sm:col-span-2">
              <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Notes</p>
              <p className="text-white/70">{meeting.notes}</p>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
            <TranscriptPanel meetingId={meeting.id} initialContent={meeting.transcript?.content ?? ''} />
          </Card>
          <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
            <RecordingPanel meetingId={meeting.id} recordings={meeting.recordings} />
          </Card>
        </div>

        <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
          <MomPanel
            meetingId={meeting.id}
            summary={meeting.summary}
            canGenerate={hasTranscriptOrNotes}
            aiConfigured={isAIConfigured()}
          />
        </Card>
      </div>
    </MainLayout>
  )
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-white/30 mt-0.5">{icon}</span>
      <div>
        <p className="text-white/40 text-xs uppercase tracking-wide">{label}</p>
        <p className="text-white/80 mt-0.5">{children}</p>
      </div>
    </div>
  )
}