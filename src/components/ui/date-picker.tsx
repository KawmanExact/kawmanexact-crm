'use client'

import * as React from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DayPicker, DateRange } from 'react-day-picker'
import { format } from 'date-fns'

interface DatePickerProps {
  mode?: 'single' | 'range' | 'multiple'
  selected?: Date | DateRange | Date[]
  onSelect?: (date: Date | DateRange | Date[] | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  numberOfMonths?: number
  startMonth?: Date
  endMonth?: Date
}

function isDateRange(value: unknown): value is DateRange {
  return (
    typeof value === 'object' &&
    value !== null &&
    'from' in value &&
    'to' in value
  )
}

function formatDateRange(range: DateRange): string {
  const fromStr = range.from ? format(range.from, 'PP') : '...'
  const toStr = range.to ? format(range.to, 'PP') : '...'
  return `${fromStr} - ${toStr}`
}

export function DatePicker({
  mode = 'single',
  selected,
  onSelect,
  placeholder = 'Select date',
  disabled = false,
  className,
  numberOfMonths = 1,
  startMonth,
  endMonth,
}: DatePickerProps) {
  const displayValue = React.useMemo(() => {
    if (!selected) return placeholder

    if (mode === 'range' && isDateRange(selected)) {
      return formatDateRange(selected)
    }

    if (Array.isArray(selected)) {
      if (selected.length === 0) return placeholder
      return selected.map(d => format(d, 'PP')).join(', ')
    }

    if (selected instanceof Date) {
      return format(selected, 'PP')
    }

    return placeholder
  }, [selected, mode, placeholder])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-full justify-between text-left font-normal', className)}
          disabled={disabled}
        >
          {displayValue}
          <Calendar className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        {/* @ts-expect-error - DayPicker props union type complexity with mode/selected/onSelect */}
        <DayPicker
          mode={mode}
          selected={selected}
          onSelect={onSelect}
          numberOfMonths={numberOfMonths}
          startMonth={startMonth}
          endMonth={endMonth}
        />
      </PopoverContent>
    </Popover>
  )
}
