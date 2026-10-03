'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { hashPassword } from 'better-auth/crypto'
import { createLocalAccountIssuer } from '@better-auth/core/db'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { logAudit } from '@/lib/audit-log'
import { sendUserInviteEmail } from '@/lib/email'

const ROLE_TYPES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES_MANAGER', 'SALES_EXECUTIVE', 'MARKETING', 'HR', 'FINANCE', 'VIEWER'] as const

const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  email: z.string().trim().email('Enter a valid email'),
  role: z.enum(ROLE_TYPES),
  designation: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  teamId: z.string().trim().optional(),
})

const updateUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  role: z.enum(ROLE_TYPES),
  designation: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  teamId: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'INVITED']),
})

export interface UserFormState {
  error?: string
  fieldErrors?: Record<string, string>
  tempPassword?: string
  success?: boolean
}

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'
  let pw = ''
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)]
  return pw
}

export async function createUserAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  await validateCsrf()
  const session = await assertPermission('users.create')
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) return { fieldErrors: { email: 'A user with this email already exists' } }

  // Enforce company domain — admin-created users must also be @kawmanexact.com
  if (!data.email.endsWith('@kawmanexact.com')) {
    return { fieldErrors: { email: 'Only @kawmanexact.com email addresses are allowed' } }
  }

  const role = await prisma.role.findUnique({ where: { name: data.role } })
  if (!role) return { error: 'That role does not exist yet — run the permission seed first.' }

  const tempPassword = generateTempPassword()
  const passwordHash = await hashPassword(tempPassword)

  const newUser = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      designation: data.designation || null,
      phone: data.phone || null,
      departmentId: data.departmentId || null,
      teamId: data.teamId || null,
      organizationId: session.user.organizationId,
      emailVerified: true,
      status: 'ACTIVE',
    },
  })
  await prisma.account.create({
    data: {
      userId: newUser.id,
      accountId: newUser.id,
      providerId: 'credential',
      // better-auth's sign-in handler only matches a credential account
      // when BOTH providerId === 'credential' AND issuer === this exact
      // value (see node_modules/better-auth/dist/api/routes/sign-in.mjs).
      // The normal self-signup path sets this automatically via
      // internalAdapter.createAccount(); this manual admin-created path
      // was skipping it, so `issuer` stayed null and login always fell
      // through to "Invalid email or password" no matter how correct the
      // temp password was.
      issuer: createLocalAccountIssuer('credential'),
      password: passwordHash,
    },
  })
  await prisma.userRole.create({ data: { userId: newUser.id, roleId: role.id } })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'ADMIN_CHANGES',
    resource: 'user',
    resourceId: newUser.id,
    metadata: { event: 'user_created', role: data.role, email: data.email },
  })

  // Best-effort — don't fail user creation if the invite email can't be
  // sent (e.g. no provider configured yet). The admin still sees the temp
  // password on screen either way.
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login`
  const organizationName = session.user.organization?.name || 'Kawman ExAct'
  const invitedByName = session.user.name || 'Admin'
  await sendUserInviteEmail(data.email, data.name, tempPassword, loginUrl, organizationName, invitedByName).catch((err) => {
    console.error('[admin/users] Failed to send invite email:', err)
  })

  revalidatePath('/admin/users')
  return { tempPassword }
}

export async function updateUserAction(id: string, _prev: UserFormState, formData: FormData): Promise<UserFormState> {
  await validateCsrf()
  const session = await assertPermission('users.update')
  const parsed = updateUserSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const target = await prisma.user.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!target) return { error: 'User not found.' }

  const role = await prisma.role.findUnique({ where: { name: data.role } })
  if (!role) return { error: 'That role does not exist.' }

  await prisma.user.update({
    where: { id },
    data: {
      name: data.name,
      designation: data.designation || null,
      phone: data.phone || null,
      departmentId: data.departmentId || null,
      teamId: data.teamId || null,
      status: data.status,
    },
  })

  await prisma.userRole.deleteMany({ where: { userId: id } })
  await prisma.userRole.create({ data: { userId: id, roleId: role.id } })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'ROLE_CHANGE',
    resource: 'user',
    resourceId: id,
    metadata: { event: 'user_updated', role: data.role, status: data.status },
  })

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${id}`)
  return { success: true }
}

export async function deleteUserAction(id: string): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await assertPermission('users.delete')
  if (id === session.user.id) return { error: "You can't delete your own account." }
  const target = await prisma.user.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!target) return { error: 'User not found.' }

  await prisma.$transaction(async (tx) => {
    await tx.user.delete({ where: { id } })

    await tx.auditLog.create({
      data: {
        organizationId: session.user.organizationId,
        actorId: session.user.id,
        action: 'USER_DELETION',
        resource: 'user',
        resourceId: id,
        metadata: { email: target.email },
      },
    })
  })

  revalidatePath('/admin/users')
  return { success: true }
}