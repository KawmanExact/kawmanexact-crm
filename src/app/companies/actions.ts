'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { logAudit } from '@/lib/audit-log'
import { canManageAssignments } from '@/lib/record-scope'

const companySchema = z.object({
  name: z.string().trim().min(2, 'Company name is required'),
  industry: z.string().trim().optional(),
  website: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  employees: z.coerce.number().int().min(0).optional(),
  revenue: z.coerce.number().min(0).optional(),
  ownerId: z.string().trim().optional(),
})

export interface CompanyFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
  createdId?: string
}

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

export async function createCompanyAction(_prev: CompanyFormState, formData: FormData): Promise<CompanyFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['companies.create'].name)
  const parsed = companySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data
  if (!canManageAssignments(session.user)) data.ownerId = session.user.id
  const company = await prisma.company.create({
    data: {
      name: data.name,
      industry: data.industry || null,
      website: data.website || null,
      phone: data.phone || null,
      email: data.email || null,
      city: data.city || null,
      state: data.state || null,
      employees: data.employees ?? null,
      revenue: data.revenue ?? null,
      organizationId: session.user.organizationId,
      ownerId: data.ownerId || session.user.id,
    },
  })
  await prisma.activity.create({
    data: {
      type: 'COMPANY_CREATED',
      description: `${session.user.name} added company "${company.name}"`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      companyId: company.id,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Company',
    resourceId: company.id,
    metadata: { name: company.name, industry: company.industry },
  })

  revalidatePath('/companies')
  return { success: true, createdId: company.id }
}

export async function updateCompanyAction(
  id: string,
  _prev: CompanyFormState,
  formData: FormData
): Promise<CompanyFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['companies.update'].name)
  const parsed = companySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }

  const existing = await prisma.company.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Company not found.' }

  const data = parsed.data
  if (!canManageAssignments(session.user)) data.ownerId = session.user.id
  await prisma.company.update({
    where: { id },
    data: {
      name: data.name,
      industry: data.industry || null,
      website: data.website || null,
      phone: data.phone || null,
      email: data.email || null,
      city: data.city || null,
      state: data.state || null,
      employees: data.employees ?? null,
      revenue: data.revenue ?? null,
      ownerId: data.ownerId || existing.ownerId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'Company',
    resourceId: id,
    metadata: { name: data.name, changes: Object.keys(data) },
  })

  revalidatePath('/companies')
  revalidatePath(`/companies/${id}`)
  return { success: true }
}

export async function deleteCompanyAction(id: string): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['companies.delete'].name)
  const existing = await prisma.company.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Company not found.' }
  await prisma.company.delete({ where: { id } })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'DELETE',
    resource: 'Company',
    resourceId: id,
    metadata: { name: existing.name },
  })

  revalidatePath('/companies')
  return { success: true }
}
