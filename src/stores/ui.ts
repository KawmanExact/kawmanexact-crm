import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  mobileDrawerOpen: boolean
  setMobileDrawerOpen: (open: boolean) => void
  toggleMobileDrawer: () => void
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  notificationsOpen: boolean
  setNotificationsOpen: (open: boolean) => void
  toggleNotifications: () => void
  userMenuOpen: boolean
  setUserMenuOpen: (open: boolean) => void
  toggleUserMenu: () => void
  theme: 'dark' | 'light' | 'system'
  setTheme: (theme: 'dark' | 'light' | 'system') => void
  globalLoading: boolean
  setGlobalLoading: (loading: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed, sidebarOpen: state.sidebarCollapsed })),
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open, sidebarCollapsed: !open }),
      setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed, sidebarOpen: !collapsed }),
      mobileDrawerOpen: false,
      setMobileDrawerOpen: (open: boolean) => set({ mobileDrawerOpen: open }),
      toggleMobileDrawer: () => set((state) => ({ mobileDrawerOpen: !state.mobileDrawerOpen })),
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),
      toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      notificationsOpen: false,
      setNotificationsOpen: (open: boolean) => set({ notificationsOpen: open }),
      toggleNotifications: () => set((state) => ({ notificationsOpen: !state.notificationsOpen })),
      userMenuOpen: false,
      setUserMenuOpen: (open: boolean) => set({ userMenuOpen: open }),
      toggleUserMenu: () => set((state) => ({ userMenuOpen: !state.userMenuOpen })),
      theme: 'dark',
      setTheme: (theme: 'dark' | 'light' | 'system') => set({ theme }),
      globalLoading: false,
      setGlobalLoading: (loading: boolean) => set({ globalLoading: loading }),
    }),
    {
      name: 'kawman-ui-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
      }),
    }
  )
)
