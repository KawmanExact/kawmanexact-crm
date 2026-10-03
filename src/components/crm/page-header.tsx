import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 min-w-0">
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] sm:text-2xl font-bold text-white leading-tight break-words">{title}</h1>
        {subtitle && <p className="text-white/50 text-sm mt-1 break-words">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2 shrink-0">{action}</div>}
    </div>
  )
}
