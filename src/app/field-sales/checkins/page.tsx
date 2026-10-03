import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { UserCheck, MapPin, ImageIcon } from 'lucide-react'
import { format } from 'date-fns'
import { getCheckIns } from '@/services/field-visit.service'
import Image from 'next/image'

export const metadata = { title: 'Check-ins | Kawman ExAct' }

const VERIFICATION_VARIANT: Record<string, BadgeVariant> = {
  VERIFIED: 'success',
  OUT_OF_RANGE: 'warning',
  PENDING: 'neutral',
  REJECTED: 'danger',
}
const VERIFICATION_LABEL: Record<string, string> = {
  VERIFIED: 'Verified',
  OUT_OF_RANGE: 'Out of range',
  PENDING: 'Pending',
  REJECTED: 'Rejected',
}

export default async function CheckInsPage() {
  const checkIns = await getCheckIns()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Check-ins" subtitle={`${checkIns.length} check-ins recorded`} />

        <Card className="bg-[#0a111c]/80 border-white/[0.08]">
          {checkIns.length === 0 ? (
            <div className="py-14 text-center">
              <UserCheck className="h-6 w-6 text-white/30 mx-auto mb-2" />
              <p className="text-white/40 text-sm">No check-ins yet</p>
              <p className="text-white/25 text-xs mt-1">Check in from a visit with your camera + location to see it here and on the Live Map.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
                    <th className="px-4 py-3 font-medium">Visit</th>
                    <th className="px-4 py-3 font-medium">Rep</th>
                    <th className="px-4 py-3 font-medium">Photo</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {checkIns.map((c) => (
                    <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{c.visitTitle}</p>
                        {c.companyName && <p className="text-white/40 text-xs mt-0.5">{c.companyName}</p>}
                        {c.notes && <p className="text-white/30 text-xs mt-0.5 line-clamp-2">{c.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-semibold flex items-center justify-center">
                            {c.userInitials}
                          </span>
                          <span className="text-white/70">{c.user}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.photoUrl ? (
                           
                          <a href={c.photoUrl} target="_blank" rel="noreferrer">
                            <Image
                               src={c.photoUrl}
                               alt="Check-in photo"
                               width={48}
                               height={48}
                               className="h-12 w-12 rounded-lg object-cover border border-white/10 hover:opacity-90"
                             />
                          </a>
                        ) : (
                          <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-white/20">
                            <ImageIcon className="h-4 w-4" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={VERIFICATION_VARIANT[c.verificationStatus] ?? 'neutral'}>
                          {VERIFICATION_LABEL[c.verificationStatus] ?? c.verificationStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-white/50">{format(new Date(c.createdAt), 'd MMM, h:mm a')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
  )
}
