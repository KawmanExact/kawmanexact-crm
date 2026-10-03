'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Camera, Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCameraCapture } from '@/hooks/use-camera-capture'
import { scanAndCreateContactAction } from '@/app/contacts/actions'

export function BusinessCardScanner() {
  const [scanning, setScanning] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  const {
    cameraActive,
    cameraError,
    videoRef,
    startCamera,
    stopCamera,
    capturePhoto,
    setPhoto,
    cameraFallbackRef,
    fileRef,
  } = useCameraCapture()

  const handleUpload = useCallback(async (file: File) => {
    setScanning(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/contacts/scan', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')

      const result = await scanAndCreateContactAction(data.contact)
      if (result.success) {
        toast.success('Contact saved from business card scan')
      } else {
        throw new Error(result.error || 'Failed to save contact')
      }

      setPhoto(null)
      setShowScanner(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }, [setPhoto])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    handleUpload(file)
  }, [handleUpload])

  const handleCapture = useCallback(() => {
    capturePhoto('business-card.jpg', handleUpload)
  }, [capturePhoto, handleUpload])

  function openGallery() {
    if (fileRef.current) {
      fileRef.current.value = ''
      fileRef.current.click()
    }
  }

  function cancelScan() {
    setShowScanner(false)
    setPhoto(null)
    stopCamera()
  }

  useEffect(() => {
    return () => {
      stopCamera()
      setPhoto(null)
    }
  }, [stopCamera, setPhoto])

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        ref={fileRef}
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        ref={cameraFallbackRef}
      />

      <Button type="button" variant="outline" className="gap-1.5" onClick={() => setShowScanner(true)}>
        <Camera className="h-4 w-4" />
        Scan Business Card
      </Button>

      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0a111c] p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Scan Business Card</h3>
              <button
                onClick={cancelScan}
                className="rounded-lg p-1 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {cameraActive ? (
                <>
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
                      onClick={handleCapture}
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
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="flex-1 gap-1.5 h-8 text-xs"
                      onClick={startCamera}
                    >
                      <Camera className="h-3.5 w-3.5" /> Camera
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1.5 h-8 text-xs border-white/10"
                      onClick={openGallery}
                    >
                      <Upload className="h-3.5 w-3.5" /> Gallery
                    </Button>
                  </div>
                  {cameraError && (
                    <div className="mt-2 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200">
                      <Camera className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{cameraError}</span>
                    </div>
                  )}
                </>
              )}

              {scanning && (
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning business card…
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
