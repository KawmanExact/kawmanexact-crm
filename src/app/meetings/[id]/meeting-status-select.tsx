'use client'

import { useTransition } from 'react'
import { updateMeetingStatusAction } from '../actions'
import type { MeetingStatus } from '@/types/meetings'

const STATUS_LABEL: Record<MeetingStatus, string> = {
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  PROCESSING: 'Processing',
  FAILED: 'Failed',
}

const STATUS_OPTIONS: MeetingStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'PROCESSING', 'FAILED']

export function MeetingStatusSelect({ meetingId, status }: { meetingId: string; status: MeetingStatus }) {
  const [pending, startTransition] = useTransition()
  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => startTransition(() => updateMeetingStatusAction(meetingId, e.target.value as MeetingStatus))}
      className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
    >
      {(STATUS_OPTIONS).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  )
}
