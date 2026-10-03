import { cn } from '@/lib/utils'

/** Pulsing placeholder block (audit: "No loading skeletons — shows blank state during fetch"). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-lg bg-white/[0.06]', className)} {...props} />
}
