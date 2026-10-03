import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import '@/lib/worker-startup'
import { Providers } from '@/components/providers'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'

export const metadata: Metadata = {
  title: 'Kawman ExAct - Enterprise Workspace Platform',
  description:
    'Enterprise workspace platform for Kawman ExAct Ingredients Pvt. Ltd. — CRM, field sales, document management, meetings, and AI intelligence.',
  keywords: ['CRM', 'Field Sales', 'Lead Management', 'Deal Tracking', 'Document Management', 'Enterprise Workspace'],
  authors: [{ name: 'Kawman ExAct Ingredients Pvt. Ltd.' }],
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Kawman ExAct' },
  openGraph: {
    title: 'Kawman ExAct - Enterprise Workspace Platform',
    description: 'Enterprise workspace platform for Kawman ExAct Ingredients Pvt. Ltd.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#050A12',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased bg-[#050A12] text-white">
        <Providers>{children}</Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
