'use server'

import { validateCsrf } from '@/lib/csrf'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

export async function revokeSessionAction(sessionId: string): Promise<void> {
  await validateCsrf()
  const session = await requireApiSession()
  await prisma.session.deleteMany({ where: { id: sessionId, userId: session.user.id } })
  revalidatePath('/admin/settings')
}
