import { NextResponse } from 'next/server'
import { listConversations } from '@/services/ai.service'

export async function GET() {
  try {
    const conversations = await listConversations()
    return NextResponse.json(conversations)
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
}
