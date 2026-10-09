'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const OPTION_CLASS = 'bg-[#0a111c] text-white'
const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-purple-500/50'
const INPUT_CLASS =
  'h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50'

/**
 * Dropdown of existing companies with an "Other" option to type a new name.
 *
 * Always emits a single hidden <input name="company"> so the server action
 * receives the company name whether the user picked an existing company or
 * typed a new one. Works inside a <Field> wrapper that provides the label.
 */
export function CompanySelect({
  companies,
  defaultValue = '',
  placeholder = 'Select a company or type a new one',
}: {
  companies: { id: string; name: string }[]
  defaultValue?: string
  placeholder?: string
}) {
  const otherValue = '__new__'

  const initiallySelected = companies.find(
    (c) => c.name.toLowerCase() === defaultValue?.toLowerCase(),
  )

  const [mode, setMode] = useState<'select' | 'other'>(initiallySelected ? 'select' : 'other')
  const [otherText, setOtherText] = useState(defaultValue ?? '')
  const [selectedId, setSelectedId] = useState<string>(initiallySelected?.id ?? '')

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === otherValue) {
      setMode('other')
      setOtherText(defaultValue ?? '')
    } else {
      setMode('select')
      setSelectedId(e.target.value)
    }
  }

  const companyName =
    mode === 'select'
      ? (companies.find((c) => c.id === selectedId)?.name ?? '')
      : otherText

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          value={mode === 'select' && selectedId ? selectedId : otherValue}
          onChange={handleSelectChange}
          className={SELECT_CLASS}
        >
          <option value={otherValue} className={OPTION_CLASS}>
            {placeholder}
          </option>
          {companies.map((c) => (
            <option key={c.id} value={c.id} className={OPTION_CLASS}>
              {c.name}
            </option>
          ))}
        </select>
        <ChevronDown className="h-4 w-4 text-white/35 shrink-0" />
      </div>

      {mode === 'other' && (
        <input
          type="text"
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          placeholder="Type company name…"
          className={INPUT_CLASS}
        />
      )}

      <input type="hidden" name="company" value={companyName} />
    </>
  )
}
