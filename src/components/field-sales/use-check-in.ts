'use client'

import { useCallback, useState } from 'react'
import { useCameraCapture } from '@/hooks/use-camera-capture'

export interface CheckInLocation {
  lat: number
  lng: number
  acc?: number
}

export interface UseCheckInOptions {
  onLocationCaptured?: (location: CheckInLocation) => void
  onLocationError?: (error: string) => void
  onCameraStarted?: () => void
  onCameraStopped?: () => void
}

export interface UseCheckInReturn {
  location: CheckInLocation | null
  locationError: string | null
  locationLoading: boolean
  captureLocation: () => void
  cameraActive: boolean
  cameraError: string | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  startCamera: () => Promise<void>
  stopCamera: () => void
  capturePhoto: () => void
  photo: File | null
  preview: string | null
  setPhoto: (file: File | null) => void
  clearPhoto: () => void
  fileRef: React.RefObject<HTMLInputElement | null>
  cameraFallbackRef: React.RefObject<HTMLInputElement | null>
  notes: string
  setNotes: (notes: string) => void
}

export function useCheckIn(options: UseCheckInOptions = {}): UseCheckInReturn {
  const {
    onLocationCaptured,
    onLocationError,
    onCameraStarted,
    onCameraStopped,
  } = options

  const [location, setLocation] = useState<CheckInLocation | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)

  const {
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
  } = useCameraCapture()

  const [notes, setNotes] = useState('')

  const captureLocation = useCallback(() => {
    setLocationError(null)
    setLocationLoading(true)

    if (!navigator.geolocation) {
      const error = 'Geolocation not supported on this device.'
      setLocationError(error)
      setLocationLoading(false)
      onLocationError?.(error)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
        }
        setLocation(loc)
        setLocationLoading(false)
        onLocationCaptured?.(loc)
      },
      (err) => {
        const error = err.message || 'Could not get your location. Enable location and try again.'
        setLocationError(error)
        setLocationLoading(false)
        onLocationError?.(error)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }, [onLocationCaptured, onLocationError])

  const wrappedStartCamera = useCallback(async () => {
    await startCamera()
    onCameraStarted?.()
  }, [startCamera, onCameraStarted])

  const wrappedStopCamera = useCallback(() => {
    stopCamera()
    onCameraStopped?.()
  }, [stopCamera, onCameraStopped])

  return {
    location,
    locationError,
    locationLoading,
    captureLocation,
    cameraActive,
    cameraError,
    videoRef,
    startCamera: wrappedStartCamera,
    stopCamera: wrappedStopCamera,
    capturePhoto,
    photo,
    preview,
    setPhoto,
    clearPhoto,
    fileRef,
    cameraFallbackRef,
    notes,
    setNotes,
  }
}
