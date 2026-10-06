import { redirect } from 'next/navigation'
import { requireApiSession } from '@/lib/session'
import { prisma } from '@/lib/db'

/**
 * Deals and leads are the same record now — the Deal row carries every field
 * the lead form used to collect. Old `/leads/{id}` links (emails, bookmarks,
 * notifications) still resolve: this finds the deal that absorbed that lead and
 * sends the user to it.
 */
export default async function LegacyLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireApiSession()
  const deal = await prisma.deal.findFirst({
    where: { leadId: id, organizationId: session.user.organizationId },
    select: { id: true },
  })
  if (deal) redirect(`/deals/${deal.id}`)
  redirect('/deals')
}