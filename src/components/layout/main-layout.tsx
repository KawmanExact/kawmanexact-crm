'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { Footer } from './footer'
import { CommandPalette } from './command-palette'
import { useUIStore } from '@/stores/ui'
import { useHeartbeat } from '@/hooks/use-heartbeat'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  useHeartbeat(true)
  const { sidebarCollapsed, mobileDrawerOpen, setMobileDrawerOpen } = useUIStore()
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)')
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  // Lock body scroll when drawer is open on mobile
  React.useEffect(() => {
    if (mobileDrawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileDrawerOpen])

  // Close on Escape
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileDrawerOpen) setMobileDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileDrawerOpen, setMobileDrawerOpen])

  return (
    <div className="min-h-screen bg-[#050A12] text-white">
      {/* Backdrop — only on mobile when drawer open */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          mobileDrawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setMobileDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer wrapper — fixed on mobile (slides), fixed + margin on desktop */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex transition-transform duration-300 ease-out lg:z-40',
          'w-[300px] max-w-[85vw] lg:max-w-none',
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-[220px]',
          mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-hidden={!mobileDrawerOpen && isMobile ? true : undefined}
      >
        <Sidebar />
      </div>

      <Header />
      <main
        className={cn(
          'pt-16 min-h-screen flex flex-col min-w-0 transition-all duration-300 overflow-x-hidden',
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-[220px]'
        )}
      >
        <div className="flex-1 p-4 sm:p-6 overflow-x-hidden">{children}</div>
        <Footer />
      </main>
      <CommandPalette />
    </div>
  )
}
