'use client'

import { useActionState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { superadminAction, type SuperadminState } from './actions'

const initialState: SuperadminState = {}

export default function SuperadminPage() {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(superadminAction, initialState)

  useEffect(() => {
    if (state.success) {
      router.push('/dashboard')
      router.refresh()
    }
  }, [state.success, router])

  return (
    <div className="min-h-screen bg-[#050A12] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Kawman ExAct</h1>
          <p className="text-white/50 text-sm mt-1">One-time workspace setup</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create your workspace</CardTitle>
            <CardDescription>
              Set up the organization. You&apos;ll be its Super Admin. This page only works once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="setupToken" className="text-sm text-white/70">
                  Setup token
                </label>
                <Input
                  id="setupToken"
                  name="setupToken"
                  type="password"
                  placeholder="Paste SUPERADMIN_SETUP_TOKEN"
                  required
                  autoComplete="off"
                />
                {state.fieldErrors?.setupToken && (
                  <p className="text-xs text-red-400">{state.fieldErrors.setupToken}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="organizationName" className="text-sm text-white/70">
                  Organization name
                </label>
                <Input
                  id="organizationName"
                  name="organizationName"
                  placeholder="Acme Nutraceuticals Pvt. Ltd."
                  required
                  autoComplete="organization"
                />
                {state.fieldErrors?.organizationName && (
                  <p className="text-xs text-red-400">{state.fieldErrors.organizationName}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm text-white/70">
                  Your full name
                </label>
                <Input id="name" name="name" placeholder="Priya Sharma" required autoComplete="name" />
                {state.fieldErrors?.name && <p className="text-xs text-red-400">{state.fieldErrors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm text-white/70">
                  Work email
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="priya@acme.com"
                  required
                  autoComplete="email"
                />
                {state.fieldErrors?.email && <p className="text-xs text-red-400">{state.fieldErrors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm text-white/70">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                {state.fieldErrors?.password && (
                  <p className="text-xs text-red-400">{state.fieldErrors.password}</p>
                )}
              </div>

              {state.error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {state.error}
                </div>
              )}

              <Button type="submit" className="w-full" loading={pending} disabled={pending}>
                {pending ? 'Creating workspace…' : 'Create workspace'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-white/50">
              Already have a workspace?{' '}
              <Link href="/login" className="text-purple-400 hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
