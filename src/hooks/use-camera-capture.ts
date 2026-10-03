'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseCameraCaptureReturn {
  cameraActive: boolean
  cameraError: string | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  streamRef: React.RefObject<MediaStream | null>
  startCamera: () => Promise<void>
  stopCamera: () => void
  capturePhoto: (fileName?: string, onCapture?: (file: File) => void) => void
  photo: File | null
  preview: string | null
  previewUrlRef: React.RefObject<string | null>
  setPhoto: (file: File | null) => void
  clearPhoto: () => void
  fileRef: React.RefObject<HTMLInputElement | null>
  cameraFallbackRef: React.RefObject<HTMLInputElement | null>
}

export function useCameraCapture(): UseCameraCaptureReturn {
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [photo, setPhotoState] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const cameraFallbackRef = useRef<HTMLInputElement>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }, [])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [cameraActive])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraActive(true)
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Could not access camera.'
      setCameraError(error)
      cameraFallbackRef.current?.click()
    }
  }, [])

  const capturePhoto = useCallback((
    fileName: string = `capture-${Date.now()}.jpg`,
    onCapture?: (file: File) => void,
  ) => {
    if (!videoRef.current || !streamRef.current) return

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], fileName, { type: 'image/jpeg' })
      setPhotoState(file)

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreview(url)

      onCapture?.(file)
    }, 'image/jpeg', 0.8)
  }, [])

  const setPhoto = useCallback((file: File | null) => {
    if (!file) {
      setPhotoState(null)
      setPreview(null)
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      return
    }

    setPhotoState(file)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreview(url)
  }, [])

  const clearPhoto = useCallback(() => {
    setPhotoState(null)
    setPreview(null)
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [])

  return {
    cameraActive,
    cameraError,
    videoRef,
    streamRef,
    startCamera,
    stopCamera,
    capturePhoto,
    photo,
    preview,
    previewUrlRef,
    setPhoto,
    clearPhoto,
    fileRef,
    cameraFallbackRef,
  }
}
