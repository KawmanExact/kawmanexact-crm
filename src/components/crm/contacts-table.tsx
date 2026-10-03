'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Search, Mail, Phone, ChevronLeft, ChevronRight, FileDown, Trash2, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DeleteRowButton } from '@/components/crm/delete-row-button'
import { contactsToExcelCsv } from '@/lib/contacts-csv'
import type { ContactPage, ContactSortKey } from '@/services/contact.service'
import { deleteContactAction, bulkDeleteContactsAction } from '@/app/contacts/actions'
import type { Contact } from '@/types/crm'

function exportSelectedToCsv(selected: Contact[]) {
  const csv = contactsToExcelCsv(selected)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `contacts-selected-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Format a phone/mobile number for display: add + prefix and a space after country code. */
function formatPhoneDisplay(value: string): string {
  if (!value) return ''
  const v = value.trim()
  if (!v) return ''
  // Already has + prefix
  if (v.startsWith('+')) {
    // Add space after country code (1-3 digits after +)
    return v.replace(/^\+(\d{1,3})(\d)/, '+$1 $2')
  }
  // 00 international prefix → convert to +
  if (v.startsWith('00')) {
    const rest = v.slice(2)
    return rest.replace(/^(\d{1,3})(\d)/, '+$1 $2')
  }
  // Bare digits: try to detect country code (1-3 digits) and add + and space
  // Common: 1 (US/CA), 91 (IN), 44 (GB), 49 (DE), 33 (FR), 86 (CN), 971 (AE), 81 (JP), 61 (AU)
  return v.replace(/^(\d{1,3})(\d)/, '+$1 $2')
}

export function ContactsTable({ result }: { result: ContactPage }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sortKey = (searchParams.get('sort') as ContactSortKey | null) ?? 'createdAt'
  const sortDir = (searchParams.get('dir') as 'asc' | 'desc' | null) ?? 'desc'

  const [prevResult, setPrevResult] = useState(result)
  if (prevResult !== result) {
    setPrevResult(result)
    if (selected.size > 0) setSelected(new Set())
  }

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

  function goToPage(page: number) {
    updateParams({ page: String(page) })
  }

  function handleSortChange(value: string) {
    const [key, dir] = value.split(':') as [ContactSortKey, 'asc' | 'desc']
    updateParams({ sort: key, dir })
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id))))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  const { contacts, total, page, pageCount } = result
  const rangeStart = total === 0 ? 0 : (page - 1) * result.pageSize + 1
  const rangeEnd = Math.min(page * result.pageSize, total)
  const allSelected = contacts.length > 0 && selected.size === contacts.length

  const selectedContacts = contacts.filter((c) => selected.has(c.id))

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-white/[0.06]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts by name, company, role..."
            className="pl-9"
          />
        </div>
        <select
          value={`${sortKey}:${sortDir}`}
          onChange={(event) => handleSortChange(event.target.value)}
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
          <option value="lastActivityAt:desc">Recently active</option>
        </select>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/60">{selected.size} selected</span>
            <button
              onClick={() => exportSelectedToCsv(selectedContacts)}
              className="flex items-center gap-1 h-7 px-2 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] transition-colors"
            >
              <FileDown className="h-3 w-3" /> Export selected
            </button>
            <button
              onClick={async () => {
                if (confirm(`Delete ${selected.size} contacts?`)) {
                  const result = await bulkDeleteContactsAction(Array.from(selected))
                  if (result.success) {
                    toast.success(`${result.deleted} contact(s) deleted`)
                    clearSelection()
                  } else {
                    toast.error(result.error)
                  }
                }
              }}
              className="flex items-center gap-1 h-7 px-2 rounded-lg border border-red-500/30 text-xs text-red-400 hover:bg-red-500/[0.08] transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Delete selected
            </button>
            <button
              onClick={clearSelection}
              className="text-xs text-white/50 hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>
        )}
        <span className="text-xs text-white/35 sm:ml-auto">
          {total === 0 ? '0 contacts' : `${rangeStart}–${rangeEnd} of ${total} contacts`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1360px] table-fixed text-sm border-separate border-spacing-0">
          <colgroup>
            <col className="w-11" />
            <col className="w-[260px]" />
            <col className="w-[150px]" />
            <col className="w-[280px]" />
            <col className="w-[160px]" />
            <col className="w-[160px]" />
            <col className="w-[300px]" />
            <col className="w-[100px]" />
          </colgroup>
          <thead>
            <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
              <th className="px-5 py-3.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-purple-600 cursor-pointer"
                  aria-label="Select all contacts on this page"
                />
              </th>
              <th className="px-5 py-3.5 font-medium">Contact</th>
              <th className="px-5 py-3.5 font-medium">Company</th>
              <th className="px-5 py-3.5 font-medium">Email</th>
              <th className="px-5 py-3.5 font-medium">Phone</th>
              <th className="px-5 py-3.5 font-medium">Mobile</th>
              <th className="px-5 py-3.5 font-medium">Address</th>
              <th className="px-5 py-3.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr
                key={contact.id}
                className={`border-b border-white/[0.04] transition-colors ${
                  selected.has(contact.id) ? 'bg-purple-500/[0.06]' : ''
                }`}
              >
                <td className="px-5 py-4 align-top">
                  <input
                    type="checkbox"
                    checked={selected.has(contact.id)}
                    onChange={() => toggleRow(contact.id)}
                    className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-purple-600 cursor-pointer"
                    aria-label={`Select ${contact.name}`}
                  />
                </td>
                <td className="px-5 py-4 align-top">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-purple-600/25 flex items-center justify-center text-xs font-medium text-purple-300">
                      {contact.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="text-sm font-medium text-white hover:text-purple-300 transition-colors truncate block"
                      >
                        {contact.name}
                      </Link>
                      <p className="text-xs text-white/45 line-clamp-2 break-words">{contact.designation}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 align-top min-w-0">
                  <span className="text-sm text-white/70 line-clamp-2 break-words" title={contact.company}>
                    {contact.company}
                  </span>
                </td>
                <td className="px-5 py-4 align-top min-w-0">
                  <span
                    className="text-xs text-white/40 flex items-start gap-1.5 min-w-0"
                    title={contact.email}
                  >
                    <Mail className="h-3 w-3 shrink-0 mt-0.5" />
                    <span className="line-clamp-2 break-all min-w-0">{contact.email}</span>
                  </span>
                </td>
                <td className="px-5 py-4 align-top min-w-0">
                  <span className="text-xs text-white/40 flex items-center gap-1.5 min-w-0">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate min-w-0">{formatPhoneDisplay(contact.phone)}</span>
                  </span>
                </td>
                <td className="px-5 py-4 align-top min-w-0">
                  <span className="text-xs text-white/40 flex items-center gap-1.5 min-w-0">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate min-w-0">{formatPhoneDisplay(contact.mobile)}</span>
                  </span>
                </td>
                <td className="px-5 py-4 align-top min-w-0">
                  <span
                    className="text-xs text-white/40 flex items-start gap-1.5 min-w-0"
                    title={contact.address || undefined}
                  >
                    <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                    <span className="line-clamp-2 break-words min-w-0">{contact.address || '—'}</span>
                  </span>
                </td>
                <td className="px-5 py-4 align-top text-right">
                  <div className="flex justify-end gap-1">
                    <DeleteRowButton
                      action={deleteContactAction.bind(null, contact.id)}
                      confirmLabel={`Delete ${contact.name}?`}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center">
                  <span className="text-sm text-white/40">No contacts yet.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
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