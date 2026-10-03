'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { logAudit } from '@/lib/audit-log'

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  industry: z.string().trim().optional(),
  website: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  address: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  dateFormat: z.string().trim().optional(),
  logo: z.string().trim().url('Enter a valid URL').optional().or(z.literal('')),
})

export interface OrgFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
}

export async function updateOrganizationAction(_prev: OrgFormState, formData: FormData): Promise<OrgFormState> {
  await validateCsrf()
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('organizations.update')) {
    return { error: 'You do not have permission to do this.' }
  }

  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: {
      name: data.name,
      industry: data.industry || null,
      website: data.website || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      timezone: data.timezone || undefined,
      currency: data.currency || undefined,
      dateFormat: data.dateFormat || undefined,
      logo: data.logo || null,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'ADMIN_CHANGES',
    resource: 'organization',
    resourceId: session.user.organizationId,
    metadata: { event: 'organization_updated' },
  })

  revalidatePath('/admin/organizations')
  return { success: true }
}
