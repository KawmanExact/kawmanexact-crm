'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Upload, X } from 'lucide-react'
import { updateOwnProfileAction, type ProfileFormState } from './actions'

const initialState: ProfileFormState = {}
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp'
const MAX_MB = 5

interface ProfileUser {
  name?: string | null
  email: string
  phone?: string | null
  designation?: string | null
  image?: string | null
}

export function ProfileForm({ user }: { user: ProfileUser }) {
  const [state, formAction, pending] = useActionState(updateOwnProfileAction, initialState)
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  const objectUrlRef = useRef<string | null>(null)

  // Clear local preview after successful save (server image becomes the truth)
  useEffect(() => {
    if (state.success) {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null)
      setFileName(null)
      setRemoved(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [state.success])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(f)
    objectUrlRef.current = url
    setPreview(url)
    setFileName(f.name)
    setRemoved(false)
  }

  function clearSelection() {
    if (preview) {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
      setPreview(null)
      setFileName(null)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    // No new file selected — mark existing avatar for removal
    setRemoved(true)
  }

  const displaySrc = preview ?? (removed ? null : user.image)
  const hasAvatar = Boolean(displaySrc)

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Keep page from silently caching a stale preview after revalidate */}
        <input type="hidden" name="avatarRemoved" value={removed ? '1' : '0'} />
        <input ref={fileRef} type="file" name="avatarFile" accept={ACCEPT} className="hidden" onChange={onPick} />

        <div className="sm:col-span-2 flex gap-4">
          <div className="h-20 w-20 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] flex items-center justify-center overflow-hidden">
            {hasAvatar && displaySrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview / user-uploaded URL; not a local optimizable asset
              <img src={displaySrc} alt={user.name ?? 'Avatar'} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xl font-medium text-white/40">{(user.name ?? user.email)[0]?.toUpperCase()}</span>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm font-medium text-white/80">Profile photo</p>
            <p className="text-xs text-white/40">JPG, PNG, WEBP or GIF · up to {MAX_MB}MB. Stored on Cloudinary.</p>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]" onClick={() => fileRef.current?.click()} disabled={pending}>
                <Upload className="h-4 w-4" />
                {hasAvatar ? 'Change' : 'Upload'}
              </Button>
              {hasAvatar && (
                <Button type="button" variant="ghost" size="sm" className="text-white/60 hover:text-white hover:bg-white/[0.06]" onClick={clearSelection} disabled={pending}>
                  <X className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>

            {fileName && <p className="text-xs text-white/50 truncate">Selected: {fileName}</p>}
            {removed && !preview && <p className="text-xs text-amber-300/80">Avatar will be removed on save.</p>}
            {state.fieldErrors?.image && <p className="text-xs text-red-400">{state.fieldErrors.image}</p>}
            {state.error && <p className="text-xs text-red-400">{state.error}</p>}
          </div>
        </div>

        <Field label="Full name *" error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={user.name ?? ''} required />
        </Field>
        <Field label="Email">
          <Input value={user.email} disabled className="opacity-50" />
        </Field>
        <Field label="Phone" error={state.fieldErrors?.phone}>
          <Input name="phone" defaultValue={user.phone ?? ''} placeholder="+91 98765 43210" />
        </Field>
        <Field label="Designation" error={state.fieldErrors?.designation}>
          <Input name="designation" defaultValue={user.designation ?? ''} placeholder="e.g. Sales Manager" />
        </Field>

        {state.error && !state.fieldErrors?.image && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</div>
        )}
        {state.success && (
          <div className="sm:col-span-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">Saved.</div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={pending} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/70">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
