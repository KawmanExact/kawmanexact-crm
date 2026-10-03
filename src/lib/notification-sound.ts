'use client'

let audioContext: AudioContext | null = null
let isMuted = false

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return null
      audioContext = new AudioContextClass()
    } catch {
      return null
    }
  }
  return audioContext
}

export function setNotificationSoundMuted(muted: boolean) {
  isMuted = muted
}

export function isNotificationSoundMuted(): boolean {
  return isMuted
}

/**
 * Play a short "ding" notification sound using the Web Audio API.
 * No external asset required — generates a pleasant two-tone chime.
 */
export function playNotificationSound(volume: number = 0.3): void {
  if (isMuted) return
  if (typeof window === 'undefined') return

  const ctx = getAudioContext()
  if (!ctx) return

  try {
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const now = ctx.currentTime

    // First tone (higher pitch)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.value = 720
    gain1.gain.setValueAtTime(0, now)
    gain1.gain.linearRampToValueAtTime(volume, now + 0.005)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.4)

    // Second tone (lower pitch, slightly delayed)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.value = 480
    gain2.gain.setValueAtTime(0, now + 0.15)
    gain2.gain.linearRampToValueAtTime(volume, now + 0.155)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.15)
    osc2.stop(now + 0.55)
  } catch (err) {
    console.warn('[notification-sound] Failed to play sound:', err)
  }
}
