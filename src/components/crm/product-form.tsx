'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveProductAction, type ProductAttributeRow } from '@/app/sales-tracking/products/actions'
import type { ProductRow } from '@/types/sales'

const PRODUCT_CATEGORIES = ['Nutraceutical', 'Cosmetic', 'Food & Beverage']

const formSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required'),
  sku: z.string().trim(),
  category: z.string().trim(),
  grade: z.string().trim(),
  variant: z.string().trim(),
  unit: z.string().trim().min(1, 'Unit is required'),
  defaultUnitPrice: z
    .string()
    .trim()
    .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0), {
      message: 'Enter a number 0 or more, or leave blank',
    }),
  description: z.string().trim(),
  isActive: z.boolean(),
})

export type ProductFormValues = z.infer<typeof formSchema>

const EMPTY: ProductFormValues = {
  name: '',
  sku: '',
  category: '',
  grade: '',
  variant: '',
  unit: 'kg',
  defaultUnitPrice: '',
  description: '',
  isActive: true,
}

/**
 * Create/edit form for one catalog product.
 *
 * Extra metadata is edited as add/remove key + value rows and serialised into a
 * single hidden `attributes` JSON input, so the server action owns validation
 * and persistence (see collectAttributes).
 */
export function ProductForm({ product }: { product?: ProductRow }) {
  const router = useRouter()
  const isEdit = Boolean(product)
  const [serverState, setServerState] = useState<{ error?: string; fieldErrors?: Record<string, string> }>({})
  const [attributeRows, setAttributeRows] = useState<ProductAttributeRow[]>(() =>
    Object.entries(product?.attributes ?? {}).map(([key, value]) => ({ key, value }))
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: product
      ? {
          name: product.name,
          sku: product.sku ?? '',
          category: product.category ?? '',
          grade: product.grade ?? '',
          variant: product.variant ?? '',
          unit: product.unit,
          defaultUnitPrice:
            product.defaultUnitPrice === null ? '' : String(product.defaultUnitPrice),
          description: product.description ?? '',
          isActive: product.isActive,
        }
      : EMPTY,
  })

  /**
   * The browser validates with the same zod schema for instant feedback, then
   * the server action re-validates and is authoritative (it also rejects
   * duplicate catalog names, which the client cannot know).
   */
  const onSubmit = handleSubmit(async (values) => {
    setServerState({})
    const formData = new FormData()
    if (product) formData.set('id', product.id)
    formData.set('name', values.name)
    formData.set('sku', values.sku)
    formData.set('category', values.category)
    formData.set('grade', values.grade)
    formData.set('variant', values.variant)
    formData.set('unit', values.unit)
    formData.set('defaultUnitPrice', values.defaultUnitPrice)
    formData.set('description', values.description)
    formData.set('isActive', values.isActive ? 'on' : '')
    formData.set('attributes', JSON.stringify(attributeRows))

    const result = await saveProductAction({}, formData)
    if (result.error) {
      setServerState({ error: result.error, fieldErrors: result.fieldErrors })
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? 'Product updated' : 'Product added')
    router.push('/sales-tracking/products')
    router.refresh()
  })

  // Server-side field errors (duplicate name, etc.) win over the client ones.
  const serverError = serverState.fieldErrors?.name
  const nameError = serverError ?? errors.name?.message

  function addAttributeRow() {
    setAttributeRows((rows) => [...rows, { key: '', value: '' }])
  }

  function updateAttributeRow(index: number, patch: Partial<ProductAttributeRow>) {
    setAttributeRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function removeAttributeRow(index: number) {
    setAttributeRows((rows) => rows.filter((_, i) => i !== index))
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-3xl" noValidate>
      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <Field label="Product name" error={nameError} required>
          <Input
            {...register('name')}
            placeholder="VitExAct™ B12"
            aria-invalid={Boolean(nameError)}
            autoFocus={!product}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Variant" hint='e.g. "1% WD", "0.1% WS", "RD"'>
            <Input {...register('variant')} placeholder="1% WD" />
          </Field>
          <Field label="SKU" hint="Optional internal code">
            <Input {...register('sku')} placeholder="KB-0001" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Input {...register('category')} list="product-categories" placeholder="Nutraceutical" />
            <datalist id="product-categories">
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Grade" hint='e.g. "RD", "Food Grade"'>
            <Input {...register('grade')} placeholder="RD" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unit" hint="Ingredients are sold by kg" error={errors.unit?.message}>
            <Input {...register('unit')} placeholder="kg" />
          </Field>
          <Field
            label="Default unit price"
            hint="Optional. Prefills the sales form; leave blank if not agreed yet."
            error={errors.defaultUnitPrice?.message}
          >
            <Input
              {...register('defaultUnitPrice')}
              inputMode="decimal"
              placeholder="0.00"
              aria-invalid={Boolean(errors.defaultUnitPrice)}
            />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            {...register('description')}
            rows={3}
            placeholder="Optional notes about this product"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </Field>

        {product && (
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              {...register('isActive')}
              className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-purple-600"
            />
            Active — available in the sales product dropdown
          </label>
        )}
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-white/80">Extra metadata</h2>
            <p className="mt-0.5 text-xs text-white/40">
              Optional key/value rows stored with the product (dosage, solubility,
              packaging&hellip;). Blank keys are ignored.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addAttributeRow}>
            <Plus className="h-3.5 w-3.5" /> Add field
          </Button>
        </div>

        {attributeRows.length === 0 ? (
          <p className="text-xs text-white/35">No extra fields.</p>
        ) : (
          <ul className="space-y-2">
            {attributeRows.map((row, index) => (
              <li key={index} className="flex items-center gap-2">
                <Input
                  value={row.key}
                  onChange={(event) => updateAttributeRow(index, { key: event.target.value })}
                  placeholder="Key"
                  aria-label={`Metadata key ${index + 1}`}
                  className="max-w-[14rem]"
                />
                <Input
                  value={row.value}
                  onChange={(event) => updateAttributeRow(index, { value: event.target.value })}
                  placeholder="Value"
                  aria-label={`Metadata value ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-red-400 hover:text-red-300"
                  aria-label={`Remove metadata row ${index + 1}`}
                  onClick={() => removeAttributeRow(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={isSubmitting} className="gap-1.5">
          {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add product'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push('/sales-tracking/products')}
        >
          Cancel
        </Button>
        {serverState.fieldErrors && Object.keys(serverState.fieldErrors).length > 0 && (
          <p role="alert" className="text-xs text-red-400">
            {Object.values(serverState.fieldErrors)[0]}
          </p>
        )}
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-white/45">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-xs text-white/35">{hint}</span>}
      {error && <span className="block text-xs text-red-400">{error}</span>}
    </label>
  )
}
