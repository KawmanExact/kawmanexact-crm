// Meetings domain types. Mirror prisma/schema.prisma (Meeting, MeetingParticipant,
// MeetingRecording, MeetingTranscript, MeetingSummary).

export type MeetingType = 'IN_PERSON' | 'VIDEO_CALL' | 'PHONE'
export type MeetingStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'PROCESSING' | 'FAILED'

export interface MeetingListItem {
  id: string
  title: string
  type: MeetingType
  status: MeetingStatus
  scheduledAt: string
  createdAt: string
  duration: number | null
  companyName: string | null
  createdBy: string
  participantCount: number
  hasRecording: boolean
  hasTranscript: boolean
  hasSummary: boolean
}

export interface MeetingRecording {
  id: string
  secureUrl: string
  duration: number | null
  fileSize: string | null
  createdAt: string
}

export interface MeetingSummaryData {
  id: string
  summary: string
  discussionPoints: string[]
  requirements: string[]
  objections: string[]
  buyingSignals: string[]
  riskSignals: string[]
  actionItems: string[]
  nextSteps: string[]
  isEdited: boolean
  createdAt: string
}

export interface MeetingDetail {
  id: string
  title: string
  type: MeetingType
  status: MeetingStatus
  scheduledAt: string
  duration: number | null
  location: string | null
  meetingLink: string | null
  notes: string | null
  companyName: string | null
  contactName: string | null
  dealName: string | null
  createdBy: string
  participants: { id: string; name: string; role: string }[]
  recordings: MeetingRecording[]
  transcript: { id: string; content: string; language: string; createdAt: string } | null
  summary: MeetingSummaryData | null
}
