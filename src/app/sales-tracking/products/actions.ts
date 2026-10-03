'use server'

/**
 * Product catalog server actions.
 *
 * Same house pattern as src/app/leads/actions.ts and src/app/deals/actions.ts:
 * `validateCsrf()` first, a local `assertPermission` (requirePermission would
 * redirect mid-action), zod issues returned as `fieldErrors`, and a logAudit
 * entry for every write.
 */
import { revalidatePath } from 'next/cache'
import { validateCsrf } from '@/lib/csrf'
import { requireApiSession } from '@/lib/session'
import { logAudit } from '@/lib/audit-log'
import { PERMISSIONS } from '@/lib/permissions-data'
import { z } from 'zod'
import {
  createProduct,
  createProductFromOtherName,
  deactivateProduct,
  deleteProduct,
  ProductConflictError,
  reactivateProduct,
  updateProduct,
} from '@/services/product.service'
import { OTHER_PRODUCT_NAME_MAX } from '@/lib/sales-money'
import type { ProductAttributes } from '@/types/sales'

export interface ProductFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
  savedId?: string
}

/** Optional key/value metadata rows edited on the catalog form. */
export interface ProductAttributeRow {
  key: string
  value: string
}

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required'),
  sku: z.string().trim().optional().default(''),
  category: z.string().trim().optional().default(''),
  grade: z.string().trim().optional().default(''),
  variant: z.string().trim().optional().default(''),
  unit: z.string().trim().min(1, 'Unit is required').max(20, 'Unit is too long').default('kg'),
  defaultUnitPrice: z.coerce.number().min(0, 'Default unit price cannot be negative').optional(),
  description: z.string().trim().optional().default(''),
  isActive: z.coerce.boolean().optional(),
})

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) {
    throw new Error('You do not have permission to do this.')
  }
  return session
}

/**
 * Collapse the add/remove metadata rows into a plain object. Blank keys are
 * dropped; a blank value is kept as an empty string so the user can see the key
 * exists. A repeated key keeps the last value entered.
 */
export function collectAttributes(
  rows: ProductAttributeRow[] | undefined
): ProductAttributes | null {
  if (!rows || rows.length === 0) return null
  const out: ProductAttributes = {}
  for (const row of rows) {
    const key = row.key?.trim()
    if (!key) continue
    out[key] = (row.value ?? '').trim()
  }
  return Object.keys(out).length > 0 ? out : null
}

function parseAttributesField(raw: FormDataEntryValue | null): ProductAttributes | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return collectAttributes(parsed as ProductAttributeRow[])
  } catch {
    return null
  }
}

export async function saveProductAction(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['products.manage'].name)

  const id = String(formData.get('id') ?? '').trim()
  const attributes = parseAttributesField(formData.get('attributes'))

  const parsed = productSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }

  const data = parsed.data

  try {
    const product = id
      ? await updateProduct(id, {
          name: data.name,
          sku: data.sku || null,
          category: data.category || null,
          grade: data.grade || null,
          variant: data.variant || null,
          unit: data.unit,
          defaultUnitPrice: data.defaultUnitPrice ?? null,
          description: data.description || null,
          attributes,
          isActive: data.isActive,
        })
      : await createProduct({
          name: data.name,
          sku: data.sku || null,
          category: data.category || null,
          grade: data.grade || null,
          variant: data.variant || null,
          unit: data.unit,
          defaultUnitPrice: data.defaultUnitPrice ?? null,
          description: data.description || null,
          attributes,
        })

    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: id ? 'UPDATE' : 'CREATE',
      resource: 'Product',
      resourceId: product.id,
      metadata: { name: product.name, variant: product.variant, attributes },
    })

    revalidatePath('/sales-tracking/products')
    revalidatePath('/sales-tracking')
    return { success: true, savedId: product.id }
  } catch (err) {
    if (err instanceof ProductConflictError) return { error: err.message, fieldErrors: { name: err.message } }
    return { error: err instanceof Error ? err.message : 'Could not save the product.' }
  }
}

export async function setProductActiveAction(
  id: string,
  isActive: boolean
): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['products.manage'].name)

  try {
    if (isActive) await reactivateProduct(id)
    else await deactivateProduct(id)
    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'UPDATE',
      resource: 'Product',
      resourceId: id,
      metadata: { isActive },
    })
    revalidatePath('/sales-tracking/products')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not update the product.' }
  }
}

export async function deleteProductAction(
  id: string
): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['products.manage'].name)

  try {
    const result = await deleteProduct(id)
    if (!result.deleted) return { error: result.reason }
    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'DELETE',
      resource: 'Product',
      resourceId: id,
    })
    revalidatePath('/sales-tracking/products')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not delete the product.' }
  }
}

/** Stretch feature: promote a typed "Other" product into the catalog. */
export async function addOtherProductToCatalogAction(
  name: string
): Promise<{ success?: boolean; error?: string; savedId?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['products.manage'].name)

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Enter a product name.' }
  if (trimmed.length > OTHER_PRODUCT_NAME_MAX) return { error: 'Max 120 characters.' }

  try {
    const product = await createProductFromOtherName(trimmed)
    if (!product) return { error: `A product named "${trimmed}" already exists in this catalog.` }
    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'CREATE',
      resource: 'Product',
      resourceId: product.id,
      metadata: { name: product.name, variant: product.variant, fromOther: true },
    })
    revalidatePath('/sales-tracking/products')
    return { success: true, savedId: product.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not add the product.' }
  }
}
