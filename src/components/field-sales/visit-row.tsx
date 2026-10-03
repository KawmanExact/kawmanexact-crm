'use client'

import { format } from 'date-fns'
import Image from 'next/image'
import { MapPin, Building2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { DeleteRowButton } from '@/components/crm/delete-row-button'
import type { FieldVisit, VisitStatus } from '@/types/field-sales'
import { deleteFieldVisitAction } from '@/app/field-sales/actions'
import { CheckInDialog } from './check-in-dialog'

export const STATUS_LABEL: Record<VisitStatus, string> = {
  SCHEDULED: 'Scheduled',
  ON_THE_WAY: 'On the way',
  CHECKED_IN: 'Checked in',
  IN_MEETING: 'In meeting',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}
export const STATUS_VARIANT: Record<VisitStatus, BadgeVariant> = {
  SCHEDULED: 'neutral',
  ON_THE_WAY: 'info',
  CHECKED_IN: 'success',
  IN_MEETING: 'default',
  COMPLETED: 'success',
  CANCELLED: 'danger',
}

function StatusSelect({ status, onChange }: { status: VisitStatus; onChange?: (status: VisitStatus) => void }) {
  return (
    <select
      value={status}
      onChange={(e) => onChange?.(e.target.value as VisitStatus)}
      className="mt-1.5 h-7 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
    >
      {(Object.keys(STATUS_LABEL) as VisitStatus[]).map((s) => (
        <option key={s} value={s} className="bg-[#0d1622]">
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  )
}

interface VisitRowProps {
  visit: FieldVisit
  showAssignee?: boolean
  showVerification?: boolean
  showMapLink?: boolean
  onCheckInSuccess?: (verificationStatus: string) => void
  onStatusChange?: (status: VisitStatus) => void
}

export function VisitRow({
  visit,
  showAssignee = false,
  showVerification = true,
  showMapLink = false,
  onCheckInSuccess,
  onStatusChange,
}: VisitRowProps) {
  const verified = visit.lastCheckIn?.verificationStatus === 'VERIFIED'
  const hasPhoto = Boolean(visit.lastCheckIn?.photoUrl)
  const canCheckIn = visit.status !== 'COMPLETED' && visit.status !== 'CANCELLED' && !verified

  return (
    <tr key={visit.id} className="hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3">
        <p className="text-white font-medium">{visit.title}</p>
        <p className="text-white/40 text-xs mt-0.5">{visit.purpose}</p>
        {visit.address && (
          <p className="text-white/30 text-xs mt-0.5 flex items-center gap-1">
            <MapPin className="h-3 w-3" />{visit.address}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-white/70">
        {visit.company ? (
          <span className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-white/30" />{visit.company}
          </span>
        ) : (
          <span className="text-white/30">—</span>
        )}
      </td>
      {showAssignee && (
        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-semibold flex items-center justify-center">
              {visit.assigneeInitials}
            </span>
            <span className="text-white/70">{visit.assignee}</span>
          </span>
        </td>
      )}
      <td className="px-4 py-3 text-white/60">{format(new Date(visit.scheduledAt), 'd MMM, h:mm a')}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <Badge variant={STATUS_VARIANT[visit.status]}>{STATUS_LABEL[visit.status]}</Badge>
          <StatusSelect status={visit.status} onChange={onStatusChange} />
        </div>
      </td>
      {showVerification && (
        <td className="px-4 py-3">
          {visit.lastCheckIn ? (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${verified ? 'text-emerald-400' : 'text-amber-400'}`}>
                {verified ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                {visit.lastCheckIn.verificationStatus}
              </span>
              {hasPhoto && visit.lastCheckIn.photoUrl && (
                <a href={visit.lastCheckIn.photoUrl} target="_blank" rel="noreferrer" className="h-7 w-7 rounded overflow-hidden border border-white/10 inline-block">
                  <Image
                    src={visit.lastCheckIn.photoUrl}
                    alt="Check-in proof"
                    width={28}
                    height={28}
                    className="h-full w-full object-cover"
                  />
                </a>
              )}
            </div>
          ) : (
            <span className="text-xs text-white/30">Not verified yet</span>
          )}
        </td>
      )}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {canCheckIn && (
            <CheckInDialog
              visitId={visit.id}
              title="Check In"
              requireFaceVerify={false}
              onSuccess={onCheckInSuccess}
            />
          )}
          <DeleteRowButton
            action={deleteFieldVisitAction.bind(null, visit.id)}
            confirmLabel={`Delete "${visit.title}"? Its check-ins and reports will be removed.`}

          />
          {verified && <span className="text-xs text-emerald-400">Done ✓</span>}
          {showMapLink && (
            <a href="/field-sales/live-map" className="text-xs text-purple-400 hover:text-purple-300">
              Map
            </a>
          )}
        </div>
      </td>
    </tr>
  )
}