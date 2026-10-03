'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, ArrowUpDown, Pencil, Power, Trash2, Plus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatCurrency } from '@/lib/utils'
import type { ProductRow } from '@/types/sales'
import {
  addOtherProductToCatalogAction,
  deleteProductAction,
  setProductActiveAction,
} from '@/app/sales-tracking/products/actions'

type SortKey = 'name' | 'sku' | 'category' | 'grade' | 'unit' | 'defaultUnitPrice' | 'salesCount' | 'isActive'

const SORT_KEYS: SortKey[] = ['name', 'sku', 'category', 'grade', 'unit', 'defaultUnitPrice', 'salesCount', 'isActive']

const SORT_ACCESSOR: Record<SortKey, (p: ProductRow) => string | number | boolean | null> = {
  name: (p) => p.name,
  sku: (p) => p.sku ?? '',
  category: (p) => p.category ?? '',
  grade: (p) => p.grade ?? '',
  unit: (p) => p.unit,
  defaultUnitPrice: (p) => p.defaultUnitPrice ?? -1,
  salesCount: (p) => p.salesCount,
  isActive: (p) => (p.isActive ? 1 : 0),
}

/**
 * Product catalog table. Search / category / active filters are server-side in
 * the URL (the page runs the Prisma query); column sorting is client-side over
 * the whole catalog, which is a small reference list rather than a fact table.
 *
 * Mirrors the leads-table structure (dark theme, whitelisted sort keys,
 * server-filtered) rather than introducing a table abstraction the repo does
 * not otherwise use.
 */
export function ProductsTable({
  products,
  categories,
  otherNames,
  canManage,
}: {
  products: ProductRow[]
  categories: string[]
  otherNames: Array<{ name: string; count: number }>
  canManage: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sortParam = searchParams.get('sort') as SortKey | null
  const sortKey: SortKey = sortParam && SORT_KEYS.includes(sortParam) ? sortParam : 'name'
  const sortDir: 'asc' | 'desc' = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (query !== (searchParams.get('q') ?? '')) updateParams({ q: query || null })
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function toggleSort(key: SortKey) {
    if (key === sortKey) updateParams({ sort: key, dir: sortDir === 'asc' ? 'desc' : 'asc' })
    else updateParams({ sort: key, dir: 'asc' })
  }

  const sorted = [...products].sort((a, b) => {
    const av = SORT_ACCESSOR[sortKey](a)
    const bv = SORT_ACCESSOR[sortKey](b)
    let cmp = 0
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
    else cmp = String(av).localeCompare(String(bv))
    return sortDir === 'asc' ? cmp : -cmp
  })

  const category = searchParams.get('category') ?? ''
  const active = searchParams.get('active') ?? ''
  const hasFilters = Boolean(searchParams.get('q')?.trim() || category || active)

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-white/[0.06]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, SKU, variant..."
            aria-label="Search products"
            className="pl-9"
          />
        </div>
        <select
          value={category}
          onChange={(event) => updateParams({ category: event.target.value || null })}
          aria-label="Filter by category"
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={active}
          onChange={(event) => updateParams({ active: event.target.value || null })}
          aria-label="Filter by status"
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="">Active &amp; inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <span className="text-xs text-white/35 sm:ml-auto">
          {products.length} product{products.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
              <SortableHeader label="Product" sortKey="name" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="SKU" sortKey="sku" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Category" sortKey="category" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Grade" sortKey="grade" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Unit" sortKey="unit" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Default Price" sortKey="defaultUnitPrice" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Used In" sortKey="salesCount" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Status" sortKey="isActive" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((product) => (
              <tr key={product.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                <td className="px-4 py-3">
                  {canManage ? (
                    <Link
                      href={`/sales-tracking/products/${product.id}`}
                      className="font-medium text-white hover:text-purple-300 transition-colors"
                    >
                      {product.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-white">{product.name}</span>
                  )}
                  {product.variant && <p className="text-xs text-white/40">{product.variant}</p>}
                </td>
                <td className="px-4 py-3 text-white/55">{product.sku ?? '—'}</td>
                <td className="px-4 py-3 text-white/70">{product.category ?? '—'}</td>
                <td className="px-4 py-3 text-white/55">{product.grade ?? '—'}</td>
                <td className="px-4 py-3 text-white/55">{product.unit}</td>
                <td className="px-4 py-3 text-white">
                  {product.defaultUnitPrice === null ? '—' : formatCurrency(product.defaultUnitPrice)}
                </td>
                <td className="px-4 py-3 text-white/55">
                  {product.salesCount === 0
                    ? '—'
                    : `${product.salesCount} sale${product.salesCount === 1 ? '' : 's'}`}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={product.isActive ? 'success' : 'neutral'}>
                    {product.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && <ProductRowActions product={product} />}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center">
                  {hasFilters ? (
                    <span className="text-white/40">No products match your filters.</span>
                  ) : (
                    <span className="flex flex-col items-center gap-3">
                      <span className="text-white/40">No products in the catalog yet.</span>
                      {canManage && (
                        <Link
                          href="/sales-tracking/products/new"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add your first product
                        </Link>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <OtherProductsPanel names={otherNames} canManage={canManage} />
    </Card>
  )
}

/** Activate / deactivate / delete, with delete behind ConfirmDialog. */
function ProductRowActions({ product }: { product: ProductRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function run(action: () => Promise<{ success?: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild variant="ghost" size="icon" className="h-7 w-7" title={`Edit ${product.name}`}>
        <Link href={`/sales-tracking/products/${product.id}`} aria-label={`Edit ${product.name}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={pending}
        title={product.isActive ? 'Deactivate' : 'Reactivate'}
        aria-label={product.isActive ? `Deactivate ${product.name}` : `Reactivate ${product.name}`}
        onClick={() => run(() => setProductActiveAction(product.id, !product.isActive))}
      >
        <Power className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-red-400 hover:text-red-300"
        disabled={pending}
        title="Delete"
        aria-label={`Delete ${product.name}`}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      {error && (
        <span role="alert" className="text-xs text-red-400 max-w-[16rem] text-right">
          {error}
        </span>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${product.name}"?`}
        description={
          product.salesCount > 0
            ? `This product is used by ${product.salesCount} sales line(s), so delete will be refused. Deactivate it instead so past sales keep their label.`
            : 'This cannot be undone. Deactivating instead keeps it available for past reports.'
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={pending}
        onConfirm={() => run(() => deleteProductAction(product.id))}
      />
    </div>
  )
}

/**
 * Stretch feature: the distinct typed "Other" product names in use across
 * sales, each with an "Add to catalog" button so the catalog grows from real
 * usage instead of a spreadsheet. The list arrives as a prop from the server
 * page (services are server-only) and refreshes via router.refresh().
 */
function OtherProductsPanel({
  names,
  canManage,
}: {
  names: Array<{ name: string; count: number }>
  canManage: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)

  async function addToCatalog(name: string) {
    setPendingName(name)
    setError(null)
    try {
      const result = await addOtherProductToCatalogAction(name)
      if (result.error) setError(result.error)
      else router.refresh()
    } catch {
      setError('Could not add that product.')
    } finally {
      setPendingName(null)
    }
  }

  return (
    <div className="border-t border-white/[0.06] p-4">
      <h2 className="text-sm font-medium text-white/80">&ldquo;Other&rdquo; products used in sales</h2>
      <p className="mt-0.5 text-xs text-white/40">
        Names typed freehand on a sales line. Add the ones you sell regularly so they appear in the
        catalog dropdown.
      </p>

      {names.length === 0 && <p className="mt-3 text-xs text-white/40">No &ldquo;Other&rdquo; products used yet.</p>}

      {names.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {names.map((entry) => (
            <li
              key={entry.name}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-3 pr-1 text-xs text-white/70"
            >
              <span className="text-white/80">{entry.name}</span>
              <span className="text-white/35">
                {entry.count} sale{entry.count === 1 ? '' : 's'}
              </span>
              {canManage && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  disabled={pendingName === entry.name}
                  onClick={() => void addToCatalog(entry.name)}
                >
                  {pendingName === entry.name ? 'Adding…' : 'Add to catalog'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  dir: 'asc' | 'desc'
  onClick: (key: SortKey) => void
}) {
  const isActive = sortKey === activeKey
  return (
    <th className="px-4 py-3 font-medium whitespace-nowrap" aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onClick(sortKey)} className="flex items-center gap-1 hover:text-white transition-colors">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${isActive ? 'text-purple-400' : 'text-white/25'}`} />
      </button>
    </th>
  )
}
