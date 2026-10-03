'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { recalculateLeadScore, recalculateAllLeadScores } from '@/services/lead.service'
import { parseCSV } from '@/lib/csv'
import { logAudit } from '@/lib/audit-log'
import { canManageAssignments } from '@/lib/record-scope'
import { findOrCreateCompanyByName } from '@/services/company.service'

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  company: z.string().trim().optional(),
  companyId: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  source: z.string().trim().optional(),
  segment: z.string().trim().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']).optional(),
  score: z.coerce.number().int().min(0).max(100).optional(),
  value: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
  ownerId: z.string().trim().optional(),
})

export interface LeadFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
  createdId?: string
}

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) {
    throw new Error('You do not have permission to do this.')
  }
  return session
}

export async function createLeadAction(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.create'].name)

  const parsed = leadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }

  const data = parsed.data
  if (!canManageAssignments(session.user)) data.ownerId = session.user.id
  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        name: data.name,
        company: data.company || null,
        companyId: data.companyId || null,
        email: data.email || null,
        phone: data.phone || null,
        source: data.source || 'Other',
        segment: data.segment || null,
        score: data.score ?? 0,
        value: data.value ?? null,
        notes: data.notes || null,
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || session.user.id,
        lastActivityAt: new Date(),
      },
    })

    await tx.activity.create({
      data: {
        type: 'LEAD_CREATED',
        description: `${session.user.name} created lead "${created.name}"`,
        organizationId: session.user.organizationId,
        actorId: session.user.id,
        leadId: created.id,
      },
    })

    await tx.auditLog.create({
      data: {
        organizationId: session.user.organizationId,
        actorId: session.user.id,
        action: 'CREATE',
        resource: 'Lead',
        resourceId: created.id,
        metadata: { name: created.name, source: created.source } as never,
      },
    })

    return created
  })

  // Notify the owner when a lead is created and assigned to someone else
  if (lead.ownerId !== session.user.id) {
    try {
      const { createNotification } = await import('@/services/notification.service')
      const assignerName = session.user.name ?? session.user.email ?? 'A team member'
      await createNotification({
        organizationId: session.user.organizationId,
        userId: lead.ownerId,
        type: 'NEW_LEAD' as never,
        title: 'New Lead Assigned',
        message: `${assignerName} assigned you "${lead.name}"${lead.company ? ` at ${lead.company}` : ''}`,
        data: { leadId: lead.id, leadName: lead.name, leadCompany: lead.company ?? null, assignedById: session.user.id, leadUrl: `/leads/${lead.id}` } as never,
      })
    } catch (notifyErr) {
      console.error('[createLeadAction] notification failed (ignored):', notifyErr)
    }
  }

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { success: true, createdId: lead.id }
}

export async function updateLeadAction(id: string, _prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.update'].name)

  const parsed = leadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }

  const existing = await prisma.lead.findFirst({
    where: { id, organizationId: session.user.organizationId },
  })
  if (!existing) return { error: 'Lead not found.' }

  const data = parsed.data
  if (!canManageAssignments(session.user)) data.ownerId = session.user.id
  await prisma.lead.update({
    where: { id },
    data: {
      name: data.name,
      company: data.company || null,
      email: data.email || null,
      phone: data.phone || null,
      source: data.source || undefined,
      segment: data.segment || null,
      status: data.status,
      score: data.score,
      value: data.value,
      notes: data.notes,
      lastActivityAt: new Date(),
    },
  })

  if (data.status && data.status !== existing.status) {
    await prisma.activity.create({
      data: {
        type: 'LEAD_STATUS_CHANGED',
        description: `${session.user.name} moved "${existing.name}" to ${data.status}`,
        organizationId: session.user.organizationId,
        actorId: session.user.id,
        leadId: id,
      },
    })
  }

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'Lead',
    resourceId: id,
    metadata: { name: data.name, changes: Object.keys(data) },
  })

  revalidatePath('/leads')
  revalidatePath(`/leads/${id}`)
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteLeadAction(id: string): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.delete'].name)
  const existing = await prisma.lead.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Lead not found.' }
  await prisma.lead.delete({ where: { id } })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'DELETE',
    resource: 'Lead',
    resourceId: id,
    metadata: { name: existing.name },
  })

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function convertLeadToDealAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['deals.create'].name)
  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: { companyRef: true },
  })
  if (!lead) return

  let companyId: string | null = lead.companyId
  if (!companyId) {
    const resolved = await findOrCreateCompanyByName({
      name: lead.company || lead.name,
      organizationId: session.user.organizationId,
      ownerId: lead.ownerId,
    })
    companyId = resolved?.id ?? null
    if (companyId) await prisma.lead.update({ where: { id }, data: { companyId } })
  }

  const deal = await prisma.deal.create({
    data: {
      name: `${lead.company || lead.name} — Opportunity`,
      value: lead.value ?? 0,
      stage: 'NEW_LEAD',
      organizationId: session.user.organizationId,
      ownerId: lead.ownerId,
      companyId,
      leadId: lead.id,
    },
  })

  await prisma.lead.update({ where: { id }, data: { status: 'QUALIFIED', lastActivityAt: new Date() } })
  await prisma.activity.create({
    data: {
      type: 'DEAL_UPDATED',
      description: `${session.user.name} converted lead "${lead.name}" into a deal`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      leadId: lead.id,
      dealId: deal.id,
    },
  })

  revalidatePath('/leads')
  revalidatePath('/deals')
  revalidatePath('/dashboard')
  redirect(`/deals?highlight=${deal.id}`)
}

// ============================================================
// Automatic lead scoring
// ============================================================

export interface RecalculateScoreState {
  error?: string
  score?: number
}

export async function recalculateLeadScoreAction(leadId: string): Promise<RecalculateScoreState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['leads.update'].name)
    const result = await recalculateLeadScore(leadId)
    revalidatePath('/leads')
    revalidatePath(`/leads/${leadId}`)
    return { score: result.score }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to recalculate score' }
  }
}

export interface RecalculateAllState {
  error?: string
  updated?: number
  total?: number
}

export async function recalculateAllLeadScoresAction(): Promise<RecalculateAllState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['leads.update'].name)
    const result = await recalculateAllLeadScores()
    revalidatePath('/leads')
    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to recalculate scores' }
  }
}

// ============================================================
// CSV import (audit: "Import / Export — Export permission exists, no
// implementation" — extended here to cover import too, per Step 28).
// Reuses leadSchema (the exact same validation as manual lead creation)
// row-by-row, so an imported lead is held to identical rules as one
// typed into the form — no separate, looser validation path.
// ============================================================

export interface LeadImportRowError {
  row: number
  message: string
}

export interface LeadImportResult {
  error?: string
  created: number
  skipped: number
  rowErrors: LeadImportRowError[]
}

const MAX_IMPORT_ROWS = 1000

export async function importLeadsAction(formData: FormData): Promise<LeadImportResult> {
  await validateCsrf()
  let session
  try {
    session = await assertPermission(PERMISSIONS['leads.create'].name)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Not authorized', created: 0, skipped: 0, rowErrors: [] }
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return { error: 'No file provided', created: 0, skipped: 0, rowErrors: [] }
  }

  const text = await file.text()
  const { rows } = parseCSV(text)

  if (rows.length === 0) {
    return { error: 'The file has no data rows.', created: 0, skipped: 0, rowErrors: [] }
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      error: `File has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS} per import. Split it into smaller files.`,
      created: 0,
      skipped: 0,
      rowErrors: [],
    }
  }

  // CSV headers map to the same field names the create-lead form posts
  // (name, company, email, phone, source, status, score, value, notes) —
  // documented in the template link the UI provides, so the mapping is
  // explicit and predictable rather than guessed.
  const rowErrors: LeadImportRowError[] = []
  const validRows: Array<ReturnType<typeof leadSchema.parse>> = []

  rows.forEach((row, index) => {
    // parseCSV always includes every header as a key, even when the cell
    // is blank (''), whereas leadSchema's `.optional()` fields expect a
    // genuinely absent key (undefined) — exactly how Object.fromEntries
    // on FormData naturally omits fields the user left blank. Strip
    // empty strings so a blank CSV cell behaves the same as an empty
    // form field, rather than failing validation for optional
    // enum/number fields that don't accept '' as a value.
    const normalized = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== ''))
    const parsed = leadSchema.safeParse(normalized)
    if (!parsed.success) {
      rowErrors.push({ row: index + 2, message: parsed.error.issues[0]?.message ?? 'Invalid row' }) // +2: 1-indexed + header row
    } else {
      validRows.push(parsed.data)
    }
  })

  if (validRows.length === 0) {
    return { error: 'No valid rows to import.', created: 0, skipped: rowErrors.length, rowErrors: rowErrors.slice(0, 20) }
  }

  // Resolve companyId references (by name) once, up front, rather than
  // per-row queries — a CSV naming an existing company by name should
  // link to it rather than always creating a bare lead.
  const companyNames = [...new Set(validRows.map((r) => r.company).filter((c): c is string => Boolean(c)))]
  // Resolve via shared helper — case-insensitive, org-scoped, auto-creates missing companies
  const companyIdByName = new Map<string, string>()
  for (const name of companyNames) {
    const resolved = await findOrCreateCompanyByName({ name, organizationId: session.user.organizationId, ownerId: session.user.id })
    if (resolved) {
      companyIdByName.set(name, resolved.id)
      // also map lowercased variant so CSV casing differences still hit the same record
      companyIdByName.set(name.toLowerCase(), resolved.id)
    }
  }

  const created = await prisma.$transaction(
    validRows.map((data) =>
      prisma.lead.create({
        data: {
          name: data.name,
          company: data.company || null,
          companyId: data.company ? (companyIdByName.get(data.company) ?? companyIdByName.get(data.company.toLowerCase()) ?? null) : null,
          email: data.email || null,
          phone: data.phone || null,
        source: data.source || 'Import',
        segment: data.segment || null,
        status: data.status,
          score: data.score ?? 0,
          value: data.value ?? null,
          notes: data.notes || null,
          organizationId: session.user.organizationId,
          ownerId: session.user.id,
          lastActivityAt: new Date(),
        },
      })
    )
  )

  await prisma.activity.create({
    data: {
      type: 'LEAD_CREATED',
      description: `${session.user.name} imported ${created.length} lead(s) from CSV`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
    },
  })

  revalidatePath('/leads')
  revalidatePath('/dashboard')

  return { created: created.length, skipped: rowErrors.length, rowErrors: rowErrors.slice(0, 20) }
}

// ============================================================
// Bulk actions (audit: "Bulk Actions — No bulk delete/update on any
// table"). All scoped to the caller's organization via a WHERE clause on
// every mutation — a selected id from another org (which shouldn't be
// reachable through the UI, but is trivially forgeable in a raw request)
// simply won't match any row and is silently skipped, never touched.
// ============================================================

export interface BulkActionState {
  error?: string
  updated?: number
}

export async function bulkDeleteLeadsAction(ids: string[]): Promise<BulkActionState> {
  if (ids.length === 0) return { updated: 0 }
  try {
    await validateCsrf()
    const session = await assertPermission(PERMISSIONS['leads.delete'].name)
    const result = await prisma.lead.deleteMany({ where: { id: { in: ids }, organizationId: session.user.organizationId } })

    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'DELETE',
      resource: 'Lead',
      metadata: { count: result.count, ids },
    })

    revalidatePath('/leads')
    revalidatePath('/dashboard')
    return { updated: result.count }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete leads' }
  }
}

export async function bulkUpdateLeadStatusAction(ids: string[], status: string): Promise<BulkActionState> {
  await validateCsrf()
  if (ids.length === 0) return { updated: 0 }
  const parsedStatus = z
    .enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'])
    .safeParse(status)
  if (!parsedStatus.success) return { error: 'Invalid status' }

  try {
    const session = await assertPermission(PERMISSIONS['leads.update'].name)
    const result = await prisma.lead.updateMany({
      where: { id: { in: ids }, organizationId: session.user.organizationId },
      data: { status: parsedStatus.data, lastActivityAt: new Date() },
    })

    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'UPDATE',
      resource: 'Lead',
      metadata: { count: result.count, status: parsedStatus.data, ids },
    })

    revalidatePath('/leads')
    revalidatePath('/dashboard')
    return { updated: result.count }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update leads' }
  }
}

export async function bulkReassignLeadsAction(ids: string[], ownerId: string): Promise<BulkActionState> {
  await validateCsrf()
  if (ids.length === 0) return { updated: 0 }
  if (!ownerId) return { error: 'Select a person to reassign to' }

  try {
    const session = await assertPermission(PERMISSIONS['leads.update'].name)
    if (!canManageAssignments(session.user)) return { error: 'Only admins can reassign leads to other users' }
    const owner = await prisma.user.findFirst({ where: { id: ownerId, organizationId: session.user.organizationId } })
    if (!owner) return { error: 'Selected owner not found' }

    // Fetch lead details for the notification before updating ownership
    const leadsToUpdate = await prisma.lead.findMany({
      where: { id: { in: ids }, organizationId: session.user.organizationId },
      select: { id: true, name: true, company: true },
    })

    const result = await prisma.lead.updateMany({
      where: { id: { in: ids }, organizationId: session.user.organizationId },
      data: { ownerId },
    })

    // Notify the new owner of each reassigned lead (bell notification)
    if (result.count > 0 && ownerId !== session.user.id) {
      try {
        const { createNotification } = await import('@/services/notification.service')
        const assignerName = session.user.name ?? session.user.email ?? 'A team member'
        await Promise.all(
          leadsToUpdate.map((lead) =>
            createNotification({
              organizationId: session.user.organizationId,
              userId: ownerId,
              type: 'NEW_LEAD' as never,
              title: 'Lead reassigned to you',
              message: `${assignerName} reassigned "${lead.name}"${lead.company ? ` at ${lead.company}` : ''} to you`,
              data: { leadId: lead.id, leadName: lead.name, leadCompany: lead.company ?? null, assignedById: session.user.id, leadUrl: `/leads/${lead.id}` } as never,
            })
          )
        )
      } catch (notifyErr) {
        console.error('[bulkReassignLeadsAction] notification failed (ignored):', notifyErr)
      }
    }

    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'UPDATE',
      resource: 'Lead',
      metadata: { count: result.count, ownerId, ids },
    })

    revalidatePath('/leads')
    revalidatePath('/dashboard')
    return { updated: result.count }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to reassign leads' }
  }
}
