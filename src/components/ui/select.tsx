'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const SelectContext = React.createContext<{
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
} | null>(null)

function useSelectContext() {
  const context = React.useContext(SelectContext)
  if (!context) {
    throw new Error('Select components must be used within Select')
  }
  return context
}

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  defaultValue?: string
  disabled?: boolean
  children: React.ReactNode
}

export function Select({ value, onValueChange, defaultValue, disabled, children }: SelectProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? '')
  const controlled = value !== undefined
  const currentValue = controlled ? value : uncontrolledValue
  const handleChange = (newValue: string) => {
    if (!controlled) setUncontrolledValue(newValue)
    onValueChange?.(newValue)
  }

  return (
    <SelectContext.Provider value={{ value: currentValue, onValueChange: handleChange, disabled }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  )
}

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
}

export const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, disabled, ...props }, ref) => {
    const { value, disabled: ctxDisabled } = useSelectContext()
    const isDisabled = disabled ?? ctxDisabled

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-colors',
          isDisabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {children ?? value}
        <svg className="ml-2 h-4 w-4 text-white/50" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    )
  }
)
SelectTrigger.displayName = 'SelectTrigger'

interface SelectValueProps {
  placeholder?: string
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const { value } = useSelectContext()
  return <span className={cn('truncate', !value && 'text-white/35')}>{value || placeholder}</span>
}

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'absolute z-50 min-w-[8rem] overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.04] p-1 text-white shadow-lg animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
SelectContent.displayName = 'SelectContent'

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  disabled?: boolean
}

export const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, value, disabled, children, ...props }, ref) => {
    const { value: currentValue, onValueChange, disabled: ctxDisabled } = useSelectContext()
    const isSelected = currentValue === value
    const isDisabled = disabled ?? ctxDisabled

    const handleClick = () => {
      if (!isDisabled) {
        onValueChange?.(value)
      }
    }

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={isSelected}
        aria-disabled={isDisabled}
        data-disabled={isDisabled ? '' : undefined}
        data-value={value}
        className={cn(
          'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-white/[0.08] focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          isSelected && 'bg-purple-500/20 text-purple-300',
          className
        )}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
        {...props}
      >
        {children}
      </div>
    )
  }
)
SelectItem.displayName = 'SelectItem'

// Also export a simple native select wrapper for basic use cases
export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string
  label?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, error, label, required, disabled, placeholder, children, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-sm text-white/70">
            {label} {required && <span className="text-red-400">*</span>}
          </label>
        )}
        <select
          ref={ref}
          disabled={disabled}
          className={cn(
            'h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-colors',
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/20',
            className
          )}
          {...props}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {children}
        </select>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)
NativeSelect.displayName = 'NativeSelect'