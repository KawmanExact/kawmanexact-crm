import { NextResponse } from 'next/server'
import { getConversationMessages, deleteConversation } from '@/services/ai.service'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const conversation = await getConversationMessages(id)
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(conversation)
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await deleteConversation(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
}
