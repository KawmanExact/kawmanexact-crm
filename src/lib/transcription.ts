import 'server-only'
import ffmpeg from 'fluent-ffmpeg'
import { tmpdir } from 'os'
import { join } from 'path'
import { createWriteStream, unlinkSync, existsSync } from 'fs'
import { pipeline } from 'stream/promises'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

export interface TranscriptionResult {
  text: string
  confidence: number
  words?: Array<{ text: string; start: number; end: number; confidence: number }>
  language?: string
}

export interface TranscriptionService {
  transcribe(audioUrl: string): Promise<TranscriptionResult>
}

class AssemblyAITranscriptionService implements TranscriptionService {
  private apiKey: string
  private baseUrl = 'https://api.assemblyai.com/v2'

  constructor() {
    this.apiKey = process.env.ASSEMBLYAI_API_KEY || ''
    if (!this.apiKey) {
      console.warn('[TRANSCRIPTION] ASSEMBLYAI_API_KEY not configured')
    }
  }

  // Uploads a small audio buffer directly to AssemblyAI's own storage and
  // returns an upload_url to submit for transcription. Used so we can send
  // the extracted (small) audio track instead of making AssemblyAI download
  // the full original video from Cloudinary — that download+processing of
  // the full video file was the main reason a 40-minute recording was
  // taking so long.
  async uploadAudio(buffer: Buffer): Promise<string> {
    if (!this.apiKey) {
      throw new Error('AssemblyAI API key not configured. Set ASSEMBLYAI_API_KEY environment variable.')
    }

    const uploadResponse = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: { 'Authorization': this.apiKey },
      body: new Uint8Array(buffer),
    })

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text()
      throw new Error(`AssemblyAI upload failed: ${error}`)
    }

    const { upload_url } = await uploadResponse.json()
    return upload_url
  }

  async transcribe(audioUrl: string): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      throw new Error('AssemblyAI API key not configured. Set ASSEMBLYAI_API_KEY environment variable.')
    }

    const submitResponse = await fetch(`${this.baseUrl}/transcript`, {
      method: 'POST',
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        // auto_chapters / entity_detection / sentiment_analysis were
        // enabled but never used — TranscriptionResult only reads back
        // text/confidence/words/language below, so those three passes
        // were pure added processing time for output we threw away.
        // speaker_labels dropped too for the same reason (would need to
        // read `utterances` to actually use it, which we don't).
      }),
    })


    if (!submitResponse.ok) {
      const error = await submitResponse.text()
      throw new Error(`AssemblyAI submit failed: ${error}`)
    }

    const { id: transcriptId } = await submitResponse.json()

    let attempts = 0
    const maxAttempts = 120

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000))
      attempts++

      const statusResponse = await fetch(`${this.baseUrl}/transcript/${transcriptId}`, {
        headers: { 'Authorization': this.apiKey },
      })

      if (!statusResponse.ok) {
        throw new Error('Failed to check transcription status')
      }

      const result = await statusResponse.json()

      if (result.status === 'completed') {
        return {
          text: result.text,
          confidence: result.confidence,
          words: result.words?.map((w: { text: string; start: number; end: number; confidence: number }) => ({
            text: w.text,
            start: w.start,
            end: w.end,
            confidence: w.confidence,
          })),
          language: result.language_code,
        }
      }

      if (result.status === 'error') {
        throw new Error(`Transcription failed: ${result.error}`)
      }
    }

    throw new Error('Transcription timed out after 10 minutes')
  }
}

class OpenAIWhisperTranscriptionService implements TranscriptionService {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  async transcribe(audioUrl: string): Promise<TranscriptionResult> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.')
    }

    const audioBuffer = await this.downloadAudio(audioUrl)
    const tempFilePath = join(tmpdir(), `exact-audio-${Date.now()}.mp3`)
    await this.saveBufferToFile(audioBuffer, tempFilePath)

    try {
      const transcription = await this.client.audio.transcriptions.create({
        file: await this.createFileFromBuffer(audioBuffer, 'audio.mp3'),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      })

      return {
        text: transcription.text,
        confidence: 0.95,
        words: transcription.words?.map(w => ({
          text: w.word,
          start: w.start,
          end: w.end,
          confidence: 0.95,
        })),
        language: transcription.language,
      }
    } finally {
      if (existsSync(tempFilePath)) {
        unlinkSync(tempFilePath)
      }
    }
  }

  private async downloadAudio(url: string): Promise<Buffer> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  private async saveBufferToFile(buffer: Buffer, filePath: string): Promise<void> {
    const writeStream = createWriteStream(filePath)
    await pipeline(buffer, writeStream)
  }

  private async createFileFromBuffer(buffer: Buffer, filename: string): Promise<File> {
    return new File([new Uint8Array(buffer)], filename, { type: 'audio/mpeg' })
  }
}

class GeminiAudioTranscriptionService implements TranscriptionService {
  private genAI: GoogleGenerativeAI

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '')
  }

  async transcribe(audioUrl: string): Promise<TranscriptionResult> {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error('Google Generative AI API key not configured. Set GOOGLE_GENERATIVE_AI_API_KEY environment variable.')
    }

    const audioBuffer = await this.downloadAudio(audioUrl)
    const base64Audio = audioBuffer.toString('base64')
    
    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/mpeg',
          data: base64Audio,
        },
      },
      'Transcribe this audio file. Return only the transcript text, no additional commentary.',
    ])

    const text = result.response.text()

    return {
      text: text.trim(),
      confidence: 0.9,
      language: 'en',
    }
  }

  private async downloadAudio(url: string): Promise<Buffer> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}

class MockTranscriptionService implements TranscriptionService {
  async transcribe(audioUrl: string): Promise<TranscriptionResult> {
    console.log('[TRANSCRIPTION] Using mock service (audio URL hidden)')
    await new Promise(resolve => setTimeout(resolve, 2000))
    return {
      text: `[Mock Transcript] This is a simulated transcript for the meeting recording at ${audioUrl}. In production, this would be the actual speech-to-text result from AssemblyAI, OpenAI Whisper, or Google Gemini.`,
      confidence: 0.95,
      language: 'en',
    }
  }
}

export function getTranscriptionService(): TranscriptionService {
  if (process.env.ASSEMBLYAI_API_KEY) {
    return new AssemblyAITranscriptionService()
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIWhisperTranscriptionService()
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return new GeminiAudioTranscriptionService()
  }
  return new MockTranscriptionService()
}

export async function extractAudioFromVideo(videoUrl: string): Promise<Buffer> {
  const response = await fetch(videoUrl)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`)
  }
  const videoBuffer = Buffer.from(await response.arrayBuffer())

  const tempVideoPath = join(tmpdir(), `exact-video-${Date.now()}.mp4`)
  const tempAudioPath = join(tmpdir(), `exact-audio-${Date.now()}.mp3`)

  try {
    const writeStream = createWriteStream(tempVideoPath)
    await pipeline(videoBuffer, writeStream)

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .output(tempAudioPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioChannels(1)
        .audioFrequency(16000)
        .format('mp3')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    const audioBuffer = await import('fs/promises').then(fs => fs.readFile(tempAudioPath))
    return audioBuffer
  } finally {
    if (existsSync(tempVideoPath)) unlinkSync(tempVideoPath)
    if (existsSync(tempAudioPath)) unlinkSync(tempAudioPath)
  }
}

export async function transcribeVideo(videoUrl: string): Promise<string | null> {
  try {
    const service = getTranscriptionService()

    // Send a small extracted audio track instead of the full video file
    // wherever possible. This is what was making long (e.g. 40-minute)
    // recordings slow: the raw video was being downloaded and processed
    // in full by the transcription provider. extractAudioFromVideo()
    // already produces a mono, 16kHz, 128kbps mp3 — a fraction of the
    // size of the source video.
    let sourceUrl = videoUrl
    if (service instanceof AssemblyAITranscriptionService) {
      const audioBuffer = await extractAudioFromVideo(videoUrl)
      sourceUrl = await service.uploadAudio(audioBuffer)
    }

    const result = await service.transcribe(sourceUrl)
    return result.text
  } catch (error) {
    console.error('Video transcription failed:', error)
    return null
  }
}