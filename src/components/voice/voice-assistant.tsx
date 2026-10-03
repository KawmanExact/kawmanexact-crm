'use client'

import * as React from 'react'
import { Mic, Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/auth-client'

type VoiceState = 'idle' | 'recording' | 'thinking' | 'speaking' | 'error'

const MAX_RECORDING_SECONDS = 30
const SILENCE_THRESHOLD_MS = 2000
const SILENCE_DB_THRESHOLD = -50
const MIME_TYPE = 'audio/webm'

interface UseVoiceAssistantResult {
  state: VoiceState
  error: string | null
  transcript: string | null
  answerText: string | null
  startRecording: () => Promise<void>
  stopRecording: () => void
}

function useVoiceAssistant(): UseVoiceAssistantResult {
  const [state, setState] = React.useState<VoiceState>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [transcript, setTranscript] = React.useState<string | null>(null)
  const [answerText, setAnswerText] = React.useState<string | null>(null)
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const chunksRef = React.useRef<BlobPart[]>([])
  const timerRef = React.useRef<NodeJS.Timeout | null>(null)
  const silenceTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = React.useRef<AudioContext | null>(null)
  const analyserRef = React.useRef<AnalyserNode | null>(null)
  const animationFrameRef = React.useRef<number | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)

  const cleanupTimers = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const stopSilenceDetection = React.useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [])

  const startSilenceDetection = React.useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const checkSilence = () => {
        if (!analyserRef.current || audioContext.state === 'closed') return

        analyser.getByteFrequencyData(dataArray)

        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const average = sum / dataArray.length
        const db = average > 0 ? 20 * Math.log10(average / 255) : -Infinity

        if (db > SILENCE_DB_THRESHOLD) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = null
          }
          silenceTimerRef.current = setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop()
            }
          }, SILENCE_THRESHOLD_MS)
        }

        animationFrameRef.current = requestAnimationFrame(checkSilence)
      }

      checkSilence()
    } catch (err) {
      console.warn('Voice activity detection failed:', err)
    }
  }, [])

  const stopRecording = React.useCallback(() => {
    stopSilenceDetection()
    cleanupTimers()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [cleanupTimers, stopSilenceDetection])

  const startRecording = React.useCallback(async () => {
    setError(null)
    setTranscript(null)
    setAnswerText(null)
    setState('recording')
    chunksRef.current = []

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied')
      setState('error')
      return
    }

    streamRef.current = stream

    const options: MediaRecorderOptions = { mimeType: MIME_TYPE }
    const recorder = new MediaRecorder(stream, options)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onerror = (e) => {
      setError(e.message || 'Recording error')
      setState('error')
      stopRecording()
    }

    recorder.onstop = async () => {
      stopSilenceDetection()
      cleanupTimers()

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      if (chunksRef.current.length === 0) {
        setState('idle')
        return
      }

      const blob = new Blob(chunksRef.current, { type: MIME_TYPE })
      chunksRef.current = []

      setState('thinking')

      try {
        const formData = new FormData()
        formData.append('audio', blob, 'recording.wav')

        const res = await fetch('/api/voice/ask', {
          method: 'POST',
          body: formData,
        })

        const data = await res.json().catch(() => ({}))

        if (res.status === 401) {
          setError('You must be logged in to use the voice assistant')
          setState('error')
          return
        }

        if (res.status === 429) {
          setError('Too many requests. Please slow down.')
          setState('error')
          return
        }

        if (res.status === 503) {
          setError('AI features are not configured. Ask your admin to set OPENAI_API_KEY.')
          setState('error')
          return
        }

        if (!res.ok) {
          setError(data.error || 'Something went wrong')
          setState('error')
          return
        }

        setTranscript(data.transcript ?? null)
        setAnswerText(data.answerText ?? null)

        if (!data.audioBase64 || !data.audioBase64.trim()) {
          setState('idle')
          return
        }

        setState('speaking')

        const audioType = data.contentType || 'audio/mp3'
        const binary = atob(data.audioBase64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        const audioBlob = new Blob([bytes], { type: audioType })
        const url = URL.createObjectURL(audioBlob)
        const audio = new Audio(url)
        audioRef.current = audio

        audio.onended = () => {
          URL.revokeObjectURL(url)
          setState('idle')
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          setState('idle')
        }

        await audio.play()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed')
        setState('error')
      }
    }

    recorder.start()

    timerRef.current = setTimeout(() => {
      stopRecording()
    }, MAX_RECORDING_SECONDS * 1000)

    startSilenceDetection(stream)
  }, [stopRecording, stopSilenceDetection, cleanupTimers, startSilenceDetection])

  React.useEffect(() => {
    return () => {
      stopRecording()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [stopRecording])

  return {
    state,
    error,
    transcript,
    answerText,
    startRecording,
    stopRecording,
  }
}

interface VoiceAssistantProps {
  className?: string
}

export function VoiceAssistant({ className }: VoiceAssistantProps) {
  const { data: session } = useSession()
  const { state, error, transcript, answerText, startRecording, stopRecording } = useVoiceAssistant()

  if (!session?.user) return null

  const isBusy = state === 'recording' || state === 'thinking' || state === 'speaking'

  return (
    <div className={cn('fixed bottom-6 right-6 z-50', className)}>
      <div className="relative">
        <Button
          variant={state === 'error' ? 'destructive' : 'default'}
          size="icon"
          className={cn(
            'h-14 w-14 rounded-full shadow-lg shadow-purple-600/30 transition-all duration-200',
            state === 'recording' && 'bg-red-500 hover:bg-red-600',
            isBusy && 'cursor-wait',
          )}
          onClick={state === 'recording' ? stopRecording : startRecording}
          disabled={isBusy}
          aria-label={state === 'recording' ? 'Stop recording' : 'Ask voice assistant'}
        >
          {state === 'recording' && <Mic className="h-6 w-6" />}
          {state === 'thinking' && <Loader2 className="h-6 w-6 animate-spin" />}
          {state === 'speaking' && <Play className="h-6 w-6" />}
          {(state === 'idle' || state === 'error') && <Mic className="h-6 w-6" />}
        </Button>

        {state === 'recording' && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-400 ring-2 ring-gray-900 animate-pulse" />
        )}

        {(state === 'recording' || state === 'thinking') && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#0d1622] border border-white/10 rounded-lg text-xs text-white/80 whitespace-nowrap pointer-events-none">
            {state === 'recording' ? 'Listening…' : 'Thinking…'}
          </div>
        )}
      </div>

      {(transcript || answerText) && (
        <div className="absolute bottom-20 right-0 w-80 max-w-[calc(100vw-48px)] bg-[#0d1622] border border-white/10 rounded-lg p-4 shadow-xl">
          {transcript && (
            <div className="mb-2">
              <p className="text-xs text-white/40 uppercase tracking-wider">You said</p>
              <p className="text-sm text-white/80">{transcript}</p>
            </div>
          )}
          {answerText && (
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider">Assistant</p>
              <p className="text-sm text-white">{answerText}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="absolute bottom-20 right-0 w-80 max-w-[calc(100vw-48px)] bg-red-900/20 border border-red-500/30 rounded-lg p-3 shadow-xl">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}