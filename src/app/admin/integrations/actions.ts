'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { logAudit } from '@/lib/audit-log'

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) {
    throw new Error('You do not have permission to do this.')
  }
  return session
}

const createSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  type: z.enum(['webhook', 'slack', 'calendar', 'email']),
  value: z.string().trim().min(1, 'This field is required'),
})

export interface IntegrationFormState {
  error?: string
  fieldErrors?: Record<string, string>
}

const CONFIG_KEY: Record<string, string> = {
  webhook: 'url',
  slack: 'channel',
  calendar: 'url',
  email: 'email',
}

export async function createIntegrationAction(
  _prev: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  await validateCsrf()
  const session = await assertPermission('organizations.update')
  const parsed = createSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data
  const configKey = CONFIG_KEY[data.type]

  const existing = await prisma.integration.findFirst({
    where: { organizationId: session.user.organizationId, name: data.name },
  })
  if (existing) return { fieldErrors: { name: 'An integration with this name already exists.' } }

  await prisma.integration.create({
    data: {
      name: data.name,
      type: data.type,
      config: { [configKey]: data.value },
      isActive: true,
      organizationId: session.user.organizationId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'ADMIN_CHANGES',
    resource: 'integration',
    metadata: { event: 'integration_created', name: data.name, type: data.type },
  })

  revalidatePath('/admin/integrations')
  return {}
}

export async function toggleIntegrationAction(id: string, isActive: boolean): Promise<void> {
  await validateCsrf()
  const session = await assertPermission('organizations.update')
  await prisma.integration.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: { isActive },
  })
  revalidatePath('/admin/integrations')
}

export async function deleteIntegrationAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission('organizations.update')
  await prisma.integration.deleteMany({ where: { id, organizationId: session.user.organizationId } })
  revalidatePath('/admin/integrations')
}
