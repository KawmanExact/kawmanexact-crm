import * as React from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  warning: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  danger: 'bg-red-500/15 text-red-300 border-red-500/25',
  info: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  neutral: 'bg-white/[0.06] text-white/60 border-white/10',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        VARIANT_STYLES[variant],
        className
      )}
      {...props}
    />
  )
}
