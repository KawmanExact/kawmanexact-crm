'use server'

import { getSession } from '@/lib/session'
import { logAudit } from '@/lib/audit-log'

/** Best-effort post-login audit — never throws 500 (race: cookie may not be visible yet). */
export async function logLoginAction(): Promise<void> {
  const session = await getSession()
  if (!session) return
  try {
    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'LOGIN',
      resource: 'session',
    })
  } catch {
    // audit is best-effort — login must succeed even if audit write fails
  }
}
