import { NextResponse } from 'next/server'
import { getReport } from '@/services/ai.service'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { deleteReport } = await import('@/services/ai.service')
  const result = await deleteReport(id)
  if (!result.success) {
    const msg = result.error
    const status = msg === 'Report not found' ? 404 : 401
    return NextResponse.json({ error: msg }, { status })
  }
  return NextResponse.json({ ok: true })
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const report = await getReport(id)
    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(report)
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
}
