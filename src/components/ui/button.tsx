'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  loading?: boolean
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    const { className, variant = 'default', size = 'default', loading, children, disabled, asChild, ...restProps } = props
    const baseStyles = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]'

    const variants = {
      default: 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm shadow-purple-600/20',
      destructive: 'bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-600/20',
      outline: 'border border-white/10 bg-transparent hover:bg-white/5 text-white',
      secondary: 'bg-white/5 text-white hover:bg-white/10 border border-white/10',
      ghost: 'bg-transparent hover:bg-white/5 text-white',
      link: 'text-purple-400 underline-offset-4 hover:underline text-sm',
    }

    const sizes = {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 rounded-md px-3 text-xs',
      lg: 'h-11 rounded-md px-8 text-base',
      icon: 'h-10 w-10',
    }

    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...restProps}
      >
        {/*
          Radix Slot (used when asChild) requires exactly one React
          element child, so the loading spinner can't be a sibling of
          children in that mode — only render it in normal button mode.
        */}
        {asChild ? (
          children
        ) : (
          <>
            {loading && (
              <svg
                className="mr-2 h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  strokeWidth="4"
                />
              </svg>
            )}
            {children}
          </>
        )}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button }
