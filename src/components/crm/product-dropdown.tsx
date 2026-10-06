'use client'

import { Fragment, useState, useEffect, useRef } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { STANDARD_PRODUCTS, PRODUCT_OTHER_OPTION } from '@/lib/products'

interface ProductDropdownProps {
  name: string
  defaultValue: string[]
  defaultCustomProductNames?: string[]
  label?: string
  error?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
}

export function ProductDropdown({
  name,
  defaultValue = [],
  defaultCustomProductNames = [],
  label = 'Products',
  error,
  placeholder = 'Select products...',
  required = false,
  disabled = false,
}: ProductDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showOtherInput, setShowOtherInput] = useState(false)
  const [otherInputValue, setOtherInputValue] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<string[]>(defaultValue)
  const [customProductNames, setCustomProductNames] = useState<string[]>(defaultCustomProductNames)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)

  // Position the portal dropdown under the trigger button.
  // Depends on showOtherInput too, so the "Other" input panel also gets a position.
  useEffect(() => {
    if ((isOpen || showOtherInput) && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      })
    } else {
      setDropdownPosition(null)
    }
  }, [isOpen, showOtherInput])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setShowOtherInput(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on page scroll or resize (but NOT when scrolling inside the dropdown)
  useEffect(() => {
    if (!isOpen && !showOtherInput) return

    function handleScroll(event: Event) {
      const target = event.target as Node | null
      // Ignore scrolling inside the dropdown list itself
      if (target && dropdownRef.current && dropdownRef.current.contains(target)) return
      // Ignore scrolling inside the trigger's badge area
      if (target && buttonRef.current && buttonRef.current.contains(target)) return
      setIsOpen(false)
      setShowOtherInput(false)
    }

    function handleResize() {
      setIsOpen(false)
      setShowOtherInput(false)
    }

    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen, showOtherInput])

  const standardProducts = STANDARD_PRODUCTS as readonly string[]
  const selectedStandardProducts = selectedProducts.filter((v) => standardProducts.includes(v))
  const hasOther = selectedProducts.includes(PRODUCT_OTHER_OPTION)

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen)
      setShowOtherInput(false)
    }
  }

  const handleSelectStandard = (product: string) => {
    setSelectedProducts((prev) =>
      prev.includes(product) ? prev.filter((p) => p !== product) : [...prev, product]
    )
  }

  const handleAddCustom = () => {
    const trimmed = otherInputValue.trim()
    if (!trimmed) return

    setCustomProductNames((prev) => [...prev, trimmed])
    setSelectedProducts((prev) => (prev.includes(PRODUCT_OTHER_OPTION) ? prev : [...prev, PRODUCT_OTHER_OPTION]))

    setOtherInputValue('')
    setShowOtherInput(false)
    setIsOpen(false)
  }

  const handleRemoveCustom = (index: number) => {
    setCustomProductNames((prev) => prev.filter((_, i) => i !== index))
    setSelectedProducts((prev) => {
      const newCustomCount = customProductNames.length - 1
      if (newCustomCount === 0) {
        return prev.filter((p) => p !== PRODUCT_OTHER_OPTION)
      }
      return prev
    })
  }

  const handleRemoveStandard = (product: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p !== product))
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/70">
        {label} {required && <span className="text-red-400">*</span>}
      </label>

      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className={`w-full min-h-9 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-left text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-colors flex items-center justify-between gap-2 ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/30 hover:bg-white/15'
          }`}
        >
          {selectedProducts.length === 0 && customProductNames.length === 0 ? (
            <span className="text-white/40">{placeholder}</span>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto flex-1">
              {selectedStandardProducts.map((product) => (
                <Badge
                  key={product}
                  variant="neutral"
                  className="gap-1 h-5 px-2 py-0.5 text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveStandard(product)
                  }}
                >
                  <span className="truncate max-w-[180px]">{product}</span>
                  <X className="h-3 w-3 cursor-pointer hover:text-red-400" />
                </Badge>
              ))}
              {hasOther &&
                customProductNames.map((customName, index) => (
                  <Badge
                    key={`custom-${index}`}
                    variant="default"
                    className="gap-1 h-5 px-2 py-0.5 text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveCustom(index)
                    }}
                  >
                    <span className="truncate max-w-[180px]">{customName}</span>
                    <X className="h-3 w-3 cursor-pointer hover:text-red-400" />
                  </Badge>
                ))}
            </div>
          )}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-white/60 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && !disabled && !showOtherInput && typeof window !== 'undefined' && dropdownPosition &&
          createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-[60] rounded-lg border border-white/20 bg-slate-900/95 backdrop-blur-sm p-2 shadow-xl overflow-y-auto overscroll-contain"
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                maxHeight: '320px',
              }}
            >
              <div className="space-y-1">
                {standardProducts.map((product) => (
                  <button
                    key={product}
                    type="button"
                    onClick={() => handleSelectStandard(product)}
                    className={`w-full px-3 py-2 text-sm text-left rounded transition-colors ${
                      selectedProducts.includes(product)
                        ? 'bg-purple-500/30 text-purple-200'
                        : 'text-white/90 hover:bg-white/10'
                    }`}
                  >
                    <span className="block truncate">{product}</span>
                    {selectedProducts.includes(product) && (
                      <span className="ml-2 text-purple-300 float-right">✓</span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setShowOtherInput(true)
                    setIsOpen(false)
                  }}
                  className="w-full px-3 py-2 text-sm text-left rounded transition-colors text-amber-300 hover:bg-amber-500/15"
                >
                  + {PRODUCT_OTHER_OPTION}
                </button>
              </div>
            </div>,
            document.body
          )}

        {showOtherInput && typeof window !== 'undefined' && dropdownPosition &&
          createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-[70] rounded-lg border border-white/20 bg-slate-900/95 backdrop-blur-sm p-2 shadow-xl"
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
              }}
            >
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={otherInputValue}
                  onChange={(e) => setOtherInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCustom()
                    }
                  }}
                  placeholder="Enter Product Name"
                  maxLength={120}
                  autoFocus
                  className="flex-1 h-9 text-sm bg-white/5 border-white/20"
                />
                <button
                  type="button"
                  onClick={handleAddCustom}
                  className="h-9 px-3 text-sm text-white bg-purple-600 rounded hover:bg-purple-700 transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowOtherInput(false)}
                  className="h-9 px-3 text-sm text-white/70 bg-white/5 border border-white/10 rounded hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>,
            document.body
          )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Hidden inputs for form submission */}
      {selectedStandardProducts.map((product, index) => (
        <input key={`${name}-standard-${index}`} type="hidden" name={name} value={product} />
      ))}
      {customProductNames.map((customName, index) => (
        <Fragment key={`${name}-custom-group-${index}`}>
          <input type="hidden" name={name} value={PRODUCT_OTHER_OPTION} />
          <input type="hidden" name={`${name}Custom`} value={customName} />
        </Fragment>
      ))}
    </div>
  )
}