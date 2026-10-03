'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, Globe, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DeleteRowButton } from '@/components/crm/delete-row-button'
import { formatCurrency } from '@/lib/utils'
import type { Company } from '@/types/crm'
import type { CompanyPage, CompanySortKey } from '@/services/company.service'
import { deleteCompanyAction } from '@/app/companies/actions'

/**
 * Server-side paginated / searched / sorted companies table. All
 * filtering happens in the DB query (see
 * services/company.service.ts#getCompaniesPage) — mirrors leads-table.tsx.
 */
export function CompaniesTable({ result }: { result: CompanyPage }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const statusFilter = (searchParams.get('status') as Company['status'] | null) ?? 'ALL'
  const sortKey = (searchParams.get('sort') as CompanySortKey | null) ?? 'createdAt'
  const sortDir = (searchParams.get('dir') as 'asc' | 'desc' | null) ?? 'desc'

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      if (!('page' in updates)) next.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (query !== (searchParams.get('q') ?? '')) {
        updateParams({ q: query || null })
      }
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function toggleSort(key: CompanySortKey) {
    if (sortKey === key) {
      updateParams({ sort: key, dir: sortDir === 'asc' ? 'desc' : 'asc' })
    } else {
      updateParams({ sort: key, dir: 'desc' })
    }
  }

  function goToPage(page: number) {
    updateParams({ page: String(page) })
  }

  const hasActiveFilters = Boolean(searchParams.get('q')?.trim() || (searchParams.get('status') && searchParams.get('status') !== 'ALL'))
  const { companies, total, page, pageCount } = result
  const rangeStart = total === 0 ? 0 : (page - 1) * result.pageSize + 1
  const rangeEnd = Math.min(page * result.pageSize, total)

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-white/[0.06]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search companies by name, city, industry..."
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => updateParams({ status: event.target.value === 'ALL' ? null : event.target.value })}
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <span className="text-xs text-white/35 sm:ml-auto">
          {total === 0 ? '0 companies' : `${rangeStart}–${rangeEnd} of ${total} companies`}
        </span>
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
              <SortableHeader label="Company" sortKey="name" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <SortableHeader label="Employees" sortKey="employees" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Revenue" sortKey="revenue" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/companies/${company.id}`} className="font-medium text-white hover:text-purple-300 transition-colors">
                    {company.name}
                  </Link>
                  <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5">
                    <Globe className="h-3 w-3" /> {company.website}
                  </p>
                </td>
                <td className="px-4 py-3 text-white/70">{company.industry}</td>
                <td className="px-4 py-3 text-white/60">{company.city}, {company.state}</td>
                <td className="px-4 py-3 text-white/70">{company.employees}</td>
                <td className="px-4 py-3 text-white font-medium">{formatCurrency(company.revenue)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-purple-600/25 flex items-center justify-center text-[10px] font-medium text-purple-300">
                      {company.ownerInitials}
                    </div>
                    <span className="text-white/70">{company.owner}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={company.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {company.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <DeleteRowButton
                    action={deleteCompanyAction.bind(null, company.id)}
                    confirmLabel={`Delete ${company.name}? This also removes its contacts and deals.`}
                  />
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  {hasActiveFilters ? (
                    <span className="text-white/40">No companies match your filters.</span>
                  ) : (
                    <span className="flex flex-col items-center gap-3">
                      <span className="text-white/40">No companies yet.</span>
                      <Link
                        href="/companies/new"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
                      >
                        Create your first company
                      </Link>
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden divide-y divide-white/[0.04]">
        {companies.map((company) => (
          <div key={company.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/companies/${company.id}`} className="text-sm font-medium text-white hover:text-purple-300 truncate">
                {company.name}
              </Link>
              <Badge variant={company.status === 'ACTIVE' ? 'success' : 'neutral'}>{company.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-white/35">Industry</span><span className="text-white/70 text-right truncate">{company.industry || '—'}</span>
              <span className="text-white/35">Location</span><span className="text-white/60 text-right truncate">{company.city ? `${company.city}, ${company.state}` : '—'}</span>
              <span className="text-white/35">Employees</span><span className="text-white/70 text-right">{company.employees ?? '—'}</span>
              <span className="text-white/35">Revenue</span><span className="text-white font-medium text-right">{formatCurrency(company.revenue)}</span>
              <span className="text-white/35">Owner</span><span className="text-white/70 text-right truncate">{company.owner}</span>
            </div>
            <div className="flex justify-end pt-1">
              <DeleteRowButton action={deleteCompanyAction.bind(null, company.id)} confirmLabel={`Delete ${company.name}? This also removes its contacts and deals.`} />
            </div>
          </div>
        ))}
        {companies.length === 0 && (
          <div className="px-4 py-10 text-center">
            {hasActiveFilters ? (
              <span className="text-sm text-white/40">No companies match your filters.</span>
            ) : (
              <span className="flex flex-col items-center gap-3">
                <span className="text-sm text-white/40">No companies yet.</span>
                <Link href="/companies/new" className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">Create your first company</Link>
              </span>
            )}
          </div>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 p-4 border-t border-white/[0.06]">
          <span className="text-xs text-white/40">
            Page {page} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </Card>
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
  sortKey: CompanySortKey
  activeKey: CompanySortKey
  dir: 'asc' | 'desc'
  onClick: (key: CompanySortKey) => void
}) {
  const isActive = sortKey === activeKey
  return (
    <th className="px-4 py-3 font-medium">
      <button onClick={() => onClick(sortKey)} className="flex items-center gap-1 hover:text-white transition-colors">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${isActive ? 'text-purple-400' : 'text-white/25'}`} />
        {isActive && <span className="sr-only">{dir === 'asc' ? 'ascending' : 'descending'}</span>}
      </button>
    </th>
  )
}
