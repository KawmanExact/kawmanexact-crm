import 'server-only'
import { prisma } from '@/lib/db'
import { logAudit } from '@/lib/audit-log'
import { logger } from '@/lib/logger'

type SessionLike = { userId?: string }

/**
 * `databaseHooks.session.create.before` — looks up the user by the
 * session's userId and returns `false` unless their status is `ACTIVE`.
 * Blocks INACTIVE / SUSPENDED / INVITED users from obtaining a session.
 */
export async function sessionCreateBefore(session: SessionLike): Promise<boolean | void> {
  const userId = session.userId
  if (!userId) return false
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  })
  if (!dbUser || dbUser.status !== 'ACTIVE') return false
}

/**
 * `databaseHooks.session.create.after` — best-effort LOGIN audit entry
 * for every successful session creation (password + OAuth). Wrapped in
 * try/catch so a failed audit write never blocks the session.
 */
export async function sessionCreateAfter(session: SessionLike): Promise<void> {
  try {
    const userId = session.userId
    if (!userId) return
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    })
    if (!dbUser) return
    await logAudit({
      organizationId: dbUser.organizationId,
      actorId: userId,
      action: 'LOGIN',
      resource: 'session',
    })
  } catch (err) {
    logger.error('session.create.after audit log failed', {}, err as Error)
  }
}
