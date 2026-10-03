'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

/** Theme toggle — Light / Dark / System via next-themes (class on <html>). */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // next-themes reads localStorage on mount; rendering the real state
  // before the client has hydrated would cause a mismatch, so this
  // reports `false` during SSR/first paint and `true` after — the
  // React-recommended primitive for exactly this "has the client taken
  // over yet" check, without reaching for setState-in-an-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  return (
    <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
      {OPTIONS.map((opt) => {
        const isActive = mounted && theme === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            title={opt.label}
            aria-label={`${opt.label} theme`}
            className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
              isActive ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <opt.icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
