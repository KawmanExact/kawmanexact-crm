'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { signIn } from '@/lib/auth-client'
import { logLoginAction } from './actions'

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [zohoPending, setZohoPending] = useState(false)

  const zohoError = searchParams.get('error')
  const zohoEnabled = process.env.NEXT_PUBLIC_ZOHO_LOGIN_ENABLED === 'true'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const { error: signInError } = await signIn.email({ email, password })

    if (signInError) {
      setError(signInError.message || 'Invalid email or password')
      setPending(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
    logLoginAction().catch(() => {})
  }

  async function handleZohoSignIn() {
    setZohoPending(true)
    setError(null)

    const { error: signInError } = await signIn.social({
      provider: 'zoho',
      callbackURL: redirectTo,
      errorCallbackURL: '/login',
    })

    if (signInError) {
      setError(signInError.message || 'Zoho sign-in failed. Use your company Zoho account, or ask an admin to create your user first.')
      setZohoPending(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050A12] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Kawman ExAct</h1>
          <p className="text-white/50 text-sm mt-1">Enterprise Workspace Platform</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your credentials to access your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm text-white/70">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm text-white/70">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-xs text-purple-400 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </div>
              )}

              {zohoError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  Zoho sign-in failed. Use your company Zoho account, or ask an admin to create your user first.
                </div>
              )}

              <Button type="submit" className="w-full" loading={pending} disabled={pending}>
                {pending ? 'Signing in…' : 'Sign in'}
              </Button>

              {zohoEnabled && (
                <>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/20"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-[#0f172a] px-2 text-white/50">Or continue with</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    loading={zohoPending}
                    disabled={zohoPending}
                    onClick={handleZohoSignIn}
                  >
                    {zohoPending ? 'Redirecting…' : 'Sign in with Zoho'}
                  </Button>
                </>
              )}
            </form>

            <p className="mt-6 text-center text-sm text-white/50">
              Need an account? Contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
