'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { searchCompaniesAction } from '@/app/sales-tracking/actions'

/**
 * Searchable Company (= customer) picker.
 *
 * The repo has no combobox primitive, so this composes the existing Popover +
 * Input and queries through the `searchCompaniesAction` server action — the
 * service layer is server-only, so the client cannot call it directly.
 *
 * Keyboard accessible: the trigger is a real button, the list is a listbox of
 * buttons with roving focus via arrow keys, Enter selects and Escape closes.
 */
/** id of the listbox, so the combobox trigger can point aria-controls at it. */
const LISTBOX_ID = 'company-picker-listbox'

export function CompanyPicker({
  value,
  onChange,
  label,
  placeholder = 'Search customers…',
  error,
  required,
}: {
  value: { id: string; name: string } | null
  onChange: (company: { id: string; name: string } | null) => void
  label: string
  placeholder?: string
  error?: string
  required?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>([])
  const [highlight, setHighlight] = useState(0)
  const [pending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const results = await searchCompaniesAction(term)
          setOptions(results)
          setHighlight(0)
        } catch {
          setOptions([])
        }
      })
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [term, open])

  function select(company: { id: string; name: string }) {
    onChange(company)
    setOpen(false)
    setTerm('')
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((h) => Math.min(h + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (event.key === 'Enter' && options[highlight]) {
      event.preventDefault()
      select(options[highlight])
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm text-white/70">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={LISTBOX_ID}
            aria-invalid={Boolean(error)}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-white/[0.04] px-3 text-left text-sm text-white transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/50',
              error ? 'border-red-500/40' : 'border-white/[0.08]'
            )}
          >
            <span className={cn('truncate', !value && 'text-white/35')}>
              {value ? value.name : placeholder}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {value && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Clear customer"
                  className="rounded p-0.5 text-white/40 hover:text-white"
                  onClick={(event) => {
                    event.stopPropagation()
                    onChange(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.stopPropagation()
                      event.preventDefault()
                      onChange(null)
                    }
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
              <ChevronsUpDown className="h-3.5 w-3.5 text-white/35" />
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] min-w-72 border-white/10 bg-[#0a111c] p-0"
          onKeyDown={onKeyDown}
        >
          <div className="relative border-b border-white/[0.08] p-2">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/35" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Type to search customers…"
              aria-label="Search customers"
              autoFocus
              className="pl-8"
            />
          </div>
          <ul
            ref={listRef}
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Customers"
            className="max-h-60 overflow-y-auto py-1"
          >
            {pending && options.length === 0 && (
              <li className="px-3 py-2 text-xs text-white/35">Searching…</li>
            )}
            {!pending && options.length === 0 && (
              <li className="px-3 py-2 text-xs text-white/35">
                No customer matches &ldquo;{term}&rdquo;.
              </li>
            )}
            {options.map((option, index) => {
              const selected = value?.id === option.id
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => select(option)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                      index === highlight ? 'bg-white/[0.06] text-white' : 'text-white/70 hover:bg-white/[0.04]'
                    )}
                  >
                    <span className="truncate">{option.name}</span>
                    {selected && <Check className="h-3.5 w-3.5 shrink-0 text-purple-300" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </PopoverContent>
      </Popover>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
