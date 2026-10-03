'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const tokenError = searchParams.get('error')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError('This reset link is invalid or has expired.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setPending(true)
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token })
    setPending(false)

    if (resetError) {
      setError(resetError.message || 'Could not reset your password. Please request a new link.')
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/login')
    }, 1500)
  }

  const linkInvalid = !token || tokenError === 'INVALID_TOKEN'

  return (
    <div className="min-h-screen bg-[#050A12] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Kawman ExAct</h1>
          <p className="text-white/50 text-sm mt-1">Enterprise Workspace Platform</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Set a new password</CardTitle>
            <CardDescription>Choose a new password for your account.</CardDescription>
          </CardHeader>
          <CardContent>
            {linkInvalid ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm text-red-400">
                  This reset link is invalid or has expired. Please request a new one.
                </div>
                <Link href="/forgot-password">
                  <Button className="w-full">Request a new link</Button>
                </Link>
              </div>
            ) : success ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300">
                Password updated. Redirecting you to sign in…
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm text-white/70">
                    New password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="text-sm text-white/70">
                    Confirm new password
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" loading={pending} disabled={pending}>
                  {pending ? 'Updating…' : 'Update password'}
                </Button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-white/50">
              <Link href="/login" className="text-purple-400 hover:underline">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
