/**
 * Product catalog — the organisation's sellable products.
 *
 * Used by the sales entry form dropdowns and matched by the lead importer's
 * "Products Discussed" column. Products referenced by sales are deactivated
 * (`isActive = false`) rather than deleted so historic sales lines keep their
 * product row and their report labels never go blank.
 *
 * Every query is scoped by organizationId.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { toMoney } from '@/lib/sales-money'
import type { ProductAttributes, ProductOption, ProductRow } from '@/types/sales'
import { STANDARD_PRODUCTS, PRODUCT_OTHER_OPTION } from '@/lib/products'

/**
 * Postgres treats NULLs as distinct in a unique index, so
 * @@unique([organizationId, name, variant]) does NOT block two products that
 * share a name and both have a NULL variant. This check closes that gap the
 * same way findOrCreateCompanyByName does for companies.
 */
export function normalizeProductText(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function mapAttributes(value: unknown): ProductAttributes | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  )
  if (entries.length === 0) return null
  return Object.fromEntries(entries.map(([k, v]) => [k, String(v)]))
}

type ProductWithCount = Prisma.ProductGetPayload<{
  include: { _count: { select: { salesTransactions: true } } }
}>

function mapProduct(row: ProductWithCount): ProductRow {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    grade: row.grade,
    variant: row.variant,
    unit: row.unit,
    defaultUnitPrice: row.defaultUnitPrice ? toMoney(row.defaultUnitPrice).toNumber() : null,
    unitCost: row.unitCost ? toMoney(row.unitCost).toNumber() : null,
    unitPrice: row.unitPrice ? toMoney(row.unitPrice).toNumber() : null,
    description: row.description,
    attributes: mapAttributes(row.attributes),
    isActive: row.isActive,
    salesCount: row._count.salesTransactions,
    createdAt: row.createdAt.toISOString(),
  }
}

export interface ProductFilters {
  q?: string
  category?: string
  /** undefined = all, true = only active, false = only inactive. */
  isActive?: boolean
}

export async function getProducts(filters: ProductFilters = {}): Promise<ProductRow[]> {
  const session = await requireApiSession()
  const where: Prisma.ProductWhereInput = { organizationId: session.user.organizationId }

  if (filters.isActive !== undefined) where.isActive = filters.isActive
  if (filters.category) where.category = filters.category
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: 'insensitive' } },
      { sku: { contains: filters.q, mode: 'insensitive' } },
      { variant: { contains: filters.q, mode: 'insensitive' } },
      { description: { contains: filters.q, mode: 'insensitive' } },
    ]
  }

  const rows = await prisma.product.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { variant: 'asc' }],
    include: { _count: { select: { salesTransactions: true } } },
  })
  return rows.map(mapProduct)
}

/** Active products only, for dropdowns. */
export async function getActiveProductOptions(): Promise<ProductOption[]> {
  await requireApiSession()
  
  // Map standardized products to ProductOption format
  const standardProducts: ProductOption[] = (STANDARD_PRODUCTS as readonly string[]).map((fullName: string, index: number) => {
    // Extract variant from product name if present
    const knownVariants = ['75%', '15%', 'RD', 'WD', 'WS', 'CWD', 'CWS', '0.1%', '1%', '10% / 20% Emulsion']
    let name = fullName
    let variant: string | null = null
    
    for (const v of knownVariants) {
      if (fullName.endsWith(` ${v}`)) {
        name = fullName.slice(0, -v.length - 1).trim()
        variant = v
        break
      }
    }
    
    // Handle special cases with " - "
    if (!variant && fullName.includes(' - ')) {
      const parts = fullName.split(' - ')
      if (parts.length === 2) {
        name = parts[0].trim()
        variant = parts[1].trim()
      }
    }
    
    // Assign category based on product
    let category: string
    if (['VitExAct™ B12 0.1%', 'VitExAct™ B12 1%', 'CoQExAct™', 'CoQExAct™ 10% / 20% Emulsion'].includes(fullName)) {
      category = 'Nutraceutical'
    } else if (['CafRelExAct™', 'DHA ExAct™ - CWD', 'SoluExAct™ MCT - CWS'].includes(fullName)) {
      category = 'Food & Beverage'
    } else {
      category = 'Nutraceutical'
    }
    
    return {
      id: `std-${index}`, // Stable ID for standardized products
      name,
      variant,
      category,
      unit: 'kg',
      defaultUnitPrice: null,
      unitCost: null,
      unitPrice: null,
    }
  })
  
  // Add the "Other" option
  standardProducts.push({
    id: PRODUCT_OTHER_OPTION,
    name: PRODUCT_OTHER_OPTION,
    variant: null,
    category: null,
    unit: 'kg',
    defaultUnitPrice: null,
    unitCost: null,
    unitPrice: null,
  })
  
  return standardProducts
}

export async function getProductById(id: string): Promise<ProductRow | null> {
  const session = await requireApiSession()
  const row = await prisma.product.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: { _count: { select: { salesTransactions: true } } },
  })
  return row ? mapProduct(row) : null
}

/** Distinct categories already in use, for the filter dropdown. */
export async function getProductCategories(): Promise<string[]> {
  const session = await requireApiSession()
  const rows = await prisma.product.findMany({
    where: { organizationId: session.user.organizationId },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  })
  return rows.map((r) => r.category).filter((c): c is string => !!c && c.trim() !== '')
}

export class ProductConflictError extends Error {}

/** Insert a product, rejecting a same-org duplicate (name, variant). */
export async function createProduct(input: {
  name: string
  sku?: string | null
  category?: string | null
  grade?: string | null
  variant?: string | null
  unit?: string | null
  defaultUnitPrice?: string | number | null
  unitCost?: string | number | null
  unitPrice?: string | number | null
  description?: string | null
  attributes?: ProductAttributes | null
}): Promise<ProductRow> {
  const session = await requireApiSession()
  const name = input.name.trim()
  const variant = normalizeProductText(input.variant)

  await assertProductUnique(session.user.organizationId, name, variant)

  const row = await prisma.product.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      sku: normalizeProductText(input.sku),
      category: normalizeProductText(input.category),
      grade: normalizeProductText(input.grade),
      variant,
      unit: normalizeProductText(input.unit) ?? 'kg',
      defaultUnitPrice: input.defaultUnitPrice ? toMoney(input.defaultUnitPrice) : null,
      unitCost: input.unitCost ? toMoney(input.unitCost) : null,
      unitPrice: input.unitPrice ? toMoney(input.unitPrice) : null,
      description: normalizeProductText(input.description),
      attributes: (input.attributes ?? null) as Prisma.InputJsonValue | undefined,
    },
    include: { _count: { select: { salesTransactions: true } } },
  })
  return mapProduct(row)
}

export async function updateProduct(
  id: string,
  input: {
    name: string
    sku?: string | null
    category?: string | null
    grade?: string | null
    variant?: string | null
    unit?: string | null
    defaultUnitPrice?: string | number | null
    unitCost?: string | number | null
    unitPrice?: string | number | null
    description?: string | null
    attributes?: ProductAttributes | null
    isActive?: boolean
  }
): Promise<ProductRow> {
  const session = await requireApiSession()
  const name = input.name.trim()
  const variant = normalizeProductText(input.variant)

  await assertProductUnique(session.user.organizationId, name, variant, id)

  const row = await prisma.product.update({
    where: { id, organizationId: session.user.organizationId },
    data: {
      name,
      sku: normalizeProductText(input.sku),
      category: normalizeProductText(input.category),
      grade: normalizeProductText(input.grade),
      variant,
      unit: normalizeProductText(input.unit) ?? 'kg',
      defaultUnitPrice: input.defaultUnitPrice ? toMoney(input.defaultUnitPrice) : null,
      unitCost: input.unitCost ? toMoney(input.unitCost) : null,
      unitPrice: input.unitPrice ? toMoney(input.unitPrice) : null,
      description: normalizeProductText(input.description),
      attributes: (input.attributes ?? null) as Prisma.InputJsonValue | undefined,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { _count: { select: { salesTransactions: true } } },
  })
  return mapProduct(row)
}

/** Deactivate instead of deleting when sales reference the product. */
export async function deactivateProduct(id: string): Promise<void> {
  const session = await requireApiSession()
  await prisma.product.update({
    where: { id, organizationId: session.user.organizationId },
    data: { isActive: false },
  })
}

export async function reactivateProduct(id: string): Promise<void> {
  const session = await requireApiSession()
  await prisma.product.update({
    where: { id, organizationId: session.user.organizationId },
    data: { isActive: true },
  })
}

/**
 * Hard delete, refused while any sales line references the product. Callers
 * should prefer deactivateProduct — this exists for catalog cleanup only.
 */
export async function deleteProduct(id: string): Promise<{ deleted: boolean; reason?: string }> {
  const session = await requireApiSession()
  const count = await prisma.salesTransaction.count({
    where: { organizationId: session.user.organizationId, productId: id },
  })
  if (count > 0) {
    return {
      deleted: false,
      reason: `This product is used by ${count} sales line${count === 1 ? '' : 's'}. Deactivate it instead so past sales keep their label.`,
    }
  }
  await prisma.product.delete({ where: { id, organizationId: session.user.organizationId } })
  return { deleted: true }
}

/** Create a catalog product from a typed "Other" product name. */
export async function createProductFromOtherName(name: string): Promise<ProductRow | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const session = await requireApiSession()

  const existing = await prisma.product.findFirst({
    where: { organizationId: session.user.organizationId, name: { equals: trimmed, mode: 'insensitive' } },
    include: { _count: { select: { salesTransactions: true } } },
  })
  if (existing) return mapProduct(existing)

  // The name may already carry a variant ("AlphaExAct™ 1% WD"); split it off so
  // the catalog gets the same (name, variant) shape as the seed data.
  const parts = splitNameAndVariant(trimmed)
  try {
    return await createProduct({ name: parts.name, variant: parts.variant })
  } catch (err) {
    if (err instanceof ProductConflictError) return null
    throw err
  }
}

/** "AlphaExAct™ 1% WD" -> name "AlphaExAct™", variant "1% WD". */
export function splitNameAndVariant(input: string): { name: string; variant: string | null } {
  const trimmed = input.trim()
  const match = /\s+(RD|WD|WS)$/i.exec(trimmed)
  if (match) {
    return { name: trimmed.slice(0, match.index).trim(), variant: trimmed.slice(match.index).trim() }
  }
  return { name: trimmed, variant: null }
}

async function assertProductUnique(
  organizationId: string,
  name: string,
  variant: string | null,
  excludeId?: string
): Promise<void> {
  const existing = await prisma.product.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: 'insensitive' },
      ...(variant === null ? { variant: null } : { variant: { equals: variant, mode: 'insensitive' } }),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, variant: true },
  })
  if (existing) {
    throw new ProductConflictError(
      `A product named "${existing.name}"${existing.variant ? ` (${existing.variant})` : ''} already exists in this catalog.`
    )
  }
}
