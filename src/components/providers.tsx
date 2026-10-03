'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, useTheme } from 'next-themes'
import { Toaster } from 'sonner'
import dynamic from 'next/dynamic'

// Devtools touches localStorage on mount and throws SecurityError when
// storage is blocked (sandboxed iframe, CSP sandbox, strict browser
// settings). Load it client-only and gate behind a safe check.
const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then((m) => m.ReactQueryDevtools),
  { ssr: false }
)

function canUseLocalStorage(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const k = '__storage_test__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

function getQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}

interface ProvidersProps {
  children: React.ReactNode
}

function ThemedToaster() {
  // Keep toasts readable in both themes without introducing a server/client
  // mismatch: Toaster itself is client-only, so reading resolvedTheme here is safe.
  const { resolvedTheme } = useTheme() as { resolvedTheme?: string }
  const isLight = resolvedTheme === 'light'
  return (
    <Toaster
      position="top-right"
      theme={isLight ? 'light' : 'dark'}
      toastOptions={{
        className: isLight ? 'bg-white border border-slate-200' : 'bg-white/5 border border-white/10',
        style: isLight ? { background: '#ffffff', color: '#0f172a' } : { background: '#0a1623' },
      }}
    />
  )
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = React.useState(getQueryClient)
  const [devtoolsEnabled, setDevtoolsEnabled] = React.useState(false)

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development' && canUseLocalStorage()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time devtools gate, not a render loop
      setDevtoolsEnabled(true)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
        storageKey="kawman-theme"
      >
        {children}
        <ThemedToaster />
        {devtoolsEnabled && <ReactQueryDevtools initialIsOpen={false} />}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
