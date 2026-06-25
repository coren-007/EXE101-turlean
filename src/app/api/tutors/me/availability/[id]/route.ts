import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// DELETE - remove an availability slot
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const slot = await db.availability.findUnique({ where: { id } })
  if (!slot || slot.tutorId !== user.id) {
    return NextResponse.json({ error: 'Không tìm thấy lịch' }, { status: 404 })
  }

  await db.availability.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
