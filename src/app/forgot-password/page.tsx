'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const { error: reqError } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    })

    setPending(false)
    if (reqError) {
      setError(reqError.message || 'Something went wrong. Please try again.')
      return
    }
    // Always show the same success state, whether or not the email exists —
    // avoids leaking which addresses have accounts.
    setSent(true)
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
            <CardTitle>Forgot your password?</CardTitle>
            <CardDescription>
              Enter the email address on your account and we&apos;ll send you a link to reset it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300">
                If that email exists in our system, a reset link is on its way. Check your inbox.
              </div>
            ) : (
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

                {error && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" loading={pending} disabled={pending}>
                  {pending ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-white/50">
              Remembered your password?{' '}
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
