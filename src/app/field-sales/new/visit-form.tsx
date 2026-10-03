'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { MapPin, Loader2, Camera, ImageIcon, X, VideoOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { createFieldVisitAction, type VisitFormState } from '../actions'
import type { UserOption } from '@/services/user.service'

const initialState: VisitFormState = {}
export function NewVisitForm({ owners, canAssign, currentUser }: { owners: UserOption[]; canAssign: boolean; currentUser: UserOption }) {
  const [state, formAction, pending] = useActionState(createFieldVisitAction, initialState)
  const [loc, setLoc] = useState<{ lat: number; lng: number; acc?: number } | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [latInput, setLatInput] = useState('')
  const [lngInput, setLngInput] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  function captureLocation() {
    setLocError(null)
    setLocLoading(true)
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported on this device.')
      setLocLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy })
        setLatInput(String(pos.coords.latitude))
        setLngInput(String(pos.coords.longitude))
        setLocLoading(false)
      },
      (err) => {
        setLocError(err.message || 'Enable location and try again.')
        setLocLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }

  useEffect(() => () => { stopCamera(); if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])

  async function openCamera() {
    if (preview) return
    setCameraError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      // Fallback: file picker with capture on mobile
      if (fileRef.current) {
        fileRef.current.setAttribute('capture', 'environment')
        fileRef.current.click()
      }
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      setCameraActive(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('denied')) {
        setCameraError('Camera permission denied. Allow camera in browser settings, or use Gallery.')
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setCameraError('No camera found. Use Gallery instead.')
      } else {
        setCameraError(msg || 'Could not open camera. Use Gallery or try again.')
      }
    }
  }

  function captureFromCamera() {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `visit-${Date.now()}.jpg`, { type: 'image/jpeg' })
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        const url = URL.createObjectURL(file)
        previewUrlRef.current = url
        setPreview(url)
        // Inject into hidden file input so formAction submits it
        if (fileRef.current) {
          const dt = new DataTransfer()
          dt.items.add(file)
          fileRef.current.files = dt.files
        }
        stopCamera()
      },
      'image/jpeg',
      0.85
    )
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    // If gallery picked, clear any live stream
    stopCamera()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(f)
    previewUrlRef.current = url
    setPreview(url)
    // Ensure main photo input (fileRef) has the file — galleryRef may be the source
    if (e.target !== fileRef.current && fileRef.current) {
      const dt = new DataTransfer()
      dt.items.add(f)
      fileRef.current.files = dt.files
    }
    setCameraError(null)
  }
  function clearPhoto() {
    stopCamera()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
    setCameraError(null)
  }

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Visit title *" error={state.fieldErrors?.title}>
          <Input name="title" placeholder="Quarterly review with Acme" required />
        </Field>
        <Field label="Purpose *" error={state.fieldErrors?.purpose}>
          <Input name="purpose" placeholder="Renewal discussion" required />
        </Field>
        <Field label="Scheduled date & time *" error={state.fieldErrors?.scheduledAt}>
          <Input name="scheduledAt" type="datetime-local" required />
        </Field>
        <Field label="Assign to" error={state.fieldErrors?.assigneeId}>
          {canAssign ? (
            <select
              name="assigneeId"
              defaultValue=""
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="">Assign to me</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="assigneeId" value={currentUser.id} />
              <select
                name="assigneeId"
                defaultValue={currentUser.id}
                disabled
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white/50 cursor-not-allowed"
              >
                <option value={currentUser.id}>{currentUser.name} (you)</option>
              </select>
            </>
          )}
        </Field>
        <Field label="Company" error={state.fieldErrors?.company}>
          <Input name="company" placeholder="Acme Nutraceuticals" />
          <p className="text-[11px] text-white/25 mt-1">Created if it doesn&apos;t exist.</p>
        </Field>
        <Field label="Contact Name" error={state.fieldErrors?.contactName}>
          <Input name="contactName" placeholder="Jane Doe" />
        </Field>
        <Field label="Contact Email" error={state.fieldErrors?.contactEmail}>
          <Input name="contactEmail" type="email" placeholder="jane@example.com" />
        </Field>
        <Field label="Contact Mobile" error={state.fieldErrors?.contactMobile}>
          <Input name="contactMobile" placeholder="+91 98765 43210" />
        </Field>
        <Field label="Address" error={state.fieldErrors?.address}>
          <Input name="address" placeholder="Plot 14, MIDC, Andheri East, Mumbai" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude" error={state.fieldErrors?.latitude}>
            <Input name="latitude" inputMode="decimal" placeholder="19.119677" value={latInput} onChange={(e) => setLatInput(e.target.value)} />
          </Field>
          <Field label="Longitude" error={state.fieldErrors?.longitude}>
            <Input name="longitude" inputMode="decimal" placeholder="72.846878" value={lngInput} onChange={(e) => setLngInput(e.target.value)} />
          </Field>
        </div>

        {/* Live location — one tap fills lat/lng + writes to visit on create */}
        <div className="sm:col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-2">
          <p className="text-sm font-medium text-white/70">Live location</p>
          {loc ? (
            <p className="text-xs text-emerald-300 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}{loc.acc ? ` · ±${Math.round(loc.acc)}m` : ''}</p>
          ) : locLoading ? (
            <p className="text-xs text-white/40 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Capturing… allow the browser location prompt</p>
          ) : (
            <p className="text-xs text-white/30">{locError ?? 'Tap to capture your current location. It fills the lat/lng above and puts this visit on the Live Map.'}</p>
          )}
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-white/10 gap-1.5" onClick={captureLocation} disabled={locLoading}>
            {locLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />} Use my location
          </Button>
          {loc?.acc != null && <input type="hidden" name="accuracy" value={String(loc.acc)} />}
        </div>

        {/* Photo — live camera or gallery */}
        <div className="sm:col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
          <p className="text-sm font-medium text-white/70">Visit photo</p>
          {/* Hidden inputs: fileRef is what submits (name=photo); galleryRef is fallback picker */}
          <input ref={fileRef} type="file" name="photo" accept="image/*" className="hidden" onChange={onFile} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          {preview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview" className="w-full h-44 object-cover rounded-lg border border-white/10" />
              <button type="button" onClick={clearPhoto} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : cameraActive ? (
            <div className="space-y-2">
              <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-48 object-cover" />
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={captureFromCamera} className="flex-1 gap-1.5 h-8 bg-violet-600 hover:bg-violet-500 text-white">
                  <Camera className="h-3.5 w-3.5" /> Capture photo
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={stopCamera} className="h-8 border-white/10">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[11px] text-white/30">Live camera — tap Capture. Rear camera on mobile, webcam on desktop.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" className="flex-1 gap-1.5 h-8 text-xs" onClick={openCamera}>
                  <Camera className="h-3.5 w-3.5" /> Camera
                </Button>
                <Button type="button" size="sm" variant="outline" className="flex-1 gap-1.5 h-8 text-xs border-white/10" onClick={() => galleryRef.current?.click()}>
                  <ImageIcon className="h-3.5 w-3.5" /> Gallery
                </Button>
              </div>
              {cameraError && (
                <div className="mt-2 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200">
                  <VideoOff className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="flex-1">{cameraError}</span>
                  <button type="button" onClick={() => galleryRef.current?.click()} className="shrink-0 underline">Use Gallery</button>
                </div>
              )}
              <p className="text-[11px] text-white/30">Camera opens live preview (needs permission over HTTPS). If blocked, use Gallery. JPG/PNG/WEBP, 5MB.</p>
            </>
          )}
        </div>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={pending} disabled={pending}>{pending ? 'Scheduling…' : 'Schedule visit'}</Button>
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
