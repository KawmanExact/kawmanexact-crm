'use client'

import { useCallback, useEffect, useState } from 'react'
import { MapPin, Loader2, Camera, ImageIcon, X, Navigation2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { checkInAction } from '@/app/field-sales/actions'
import { useCheckIn } from './use-check-in'

interface CheckInDialogProps {
  visitId: string
  title: string
  requireFaceVerify?: boolean
  onSuccess?: (verificationStatus: string) => void
}

export function CheckInDialog({
  visitId,
  title,
  requireFaceVerify = false,
  onSuccess,
}: CheckInDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  const {
    location,
    locationError,
    locationLoading,
    captureLocation,
    cameraActive,
    cameraError,
    videoRef,
    startCamera,
    stopCamera,
    capturePhoto,
    photo,
    preview,
    setPhoto,
    clearPhoto,
    fileRef,
    cameraFallbackRef,
    notes,
    setNotes,
  } = useCheckIn()

  // Auto-capture location when dialog opens
  useEffect(() => {
    if (open && !location && !locationLoading) {
      captureLocation()
    }
  }, [open, location, locationLoading, captureLocation])

  // Cleanup camera on close
  useEffect(() => {
    if (!open) {
      stopCamera()
    }
  }, [open, stopCamera])

  const handleOpenCamera = useCallback(() => {
    if (preview) return
    startCamera()
  }, [preview, startCamera])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (!f) return
      setPhoto(f)
    },
    [setPhoto]
  )

  const handleSubmit = useCallback(() => {
    setError(null)
    if (!location) {
      setError('Location not captured yet. Tap "Use my location" and allow the browser prompt.')
      return
    }
    setPending(true)
    checkInAction(
      visitId,
      {
        latitude: location.lat,
        longitude: location.lng,
        accuracy: location.acc,
        notes: notes || undefined,
      },
      photo
    ).then((res) => {
      if (res.error) {
        setError(res.error)
        setPending(false)
      } else {
        setSuccess(true)
        onSuccess?.(res.verificationStatus ?? 'VERIFIED')
        setTimeout(() => {
          setOpen(false)
          window.location.reload()
        }, 800)
      }
    })
  }, [visitId, location, photo, notes, onSuccess])

  if (success) {
    return <span className="text-xs text-emerald-400 font-medium">Checked in ✓</span>
  }

  return (
    <>
      <Button
        size="sm"
        variant={requireFaceVerify ? 'default' : 'secondary'}
        className="gap-1.5 h-7 text-xs"
        onClick={() => setOpen(true)}
      >
        {requireFaceVerify ? (
          <Camera className="h-3 w-3" />
        ) : (
          <Navigation2 className="h-3 w-3" />
        )}
        {title}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/10 bg-[#0d1622] p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">{title}</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Location */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-xs font-medium text-white/70 mb-1.5">
                  Location (required)
                </p>
                {location ? (
                  <p className="text-xs text-emerald-300 flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                    {location.acc != null && ` · ±${Math.round(location.acc)}m`}
                  </p>
                ) : locationLoading ? (
                  <p className="text-xs text-white/40 flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Capturing location… allow the browser prompt
                  </p>
                ) : (
                  <p className="text-xs text-amber-300">
                    {locationError ?? 'Location not captured.'}
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-xs border-white/10"
                  onClick={captureLocation}
                  disabled={locationLoading}
                >
                  {locationLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <MapPin className="h-3 w-3" />
                  )}{' '}
                  Use my location
                </Button>
                {!requireFaceVerify && (
                  <p className="text-[11px] text-white/30 mt-1.5">
                    Enable location in your browser/device. The visit record
                    will be updated with this location.
                  </p>
                )}
              </div>

              {/* Photo */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-xs font-medium text-white/70 mb-2">
                  Photo {requireFaceVerify ? '(required)' : '(optional but recommended)'}
                </p>
                {/* Hidden file inputs */}
                <input
                  ref={cameraFallbackRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {preview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="Preview"
                      className="w-full h-40 object-cover rounded-lg border border-white/10"
                    />
                    <button
                      onClick={clearPhoto}
                      className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : cameraActive ? (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-48 object-cover"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={capturePhoto}
                        className="flex-1 gap-1.5 h-8 bg-violet-600 hover:bg-violet-500 text-white"
                      >
                        <Camera className="h-3.5 w-3.5" /> Capture photo
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={stopCamera}
                        className="h-8 border-white/10"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-white/30">
                      Live camera — tap Capture. On desktop this opens your webcam; on mobile the rear camera.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="flex-1 gap-1.5 h-8 text-xs"
                        onClick={handleOpenCamera}
                      >
                        <Camera className="h-3.5 w-3.5" /> Camera
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 h-8 text-xs border-white/10"
                        onClick={() => fileRef.current?.click()}
                      >
                        <ImageIcon className="h-3.5 w-3.5" /> Gallery
                      </Button>
                    </div>
                    {cameraError && (
                      <div className="mt-2 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200">
                        <Camera className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="flex-1">{cameraError}</span>
                        <button
                          onClick={() => fileRef.current?.click()}
                          className="shrink-0 underline"
                        >
                          Use Gallery
                        </button>
                      </div>
                    )}
                    {!requireFaceVerify && (
                      <p className="text-[11px] text-white/30 mt-1.5">
                        Camera opens live preview (allow permission) — if blocked, use Gallery. JPG/PNG/WEBP, 5MB.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/60">Notes (optional)</label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="On-site notes…"
                  className="h-8 text-sm"
                />
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={pending || !location}
                  className="gap-1.5"
                >
                  {pending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Navigation2 className="h-3 w-3" />
                  )}{' '}
                  Confirm check-in
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}