import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// PATCH - update subject price/description
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { pricePerHour, description } = body

  const ts = await db.tutorSubject.findUnique({ where: { id } })
  if (!ts || ts.tutorId !== user.id) {
    return NextResponse.json({ error: 'Không tìm thấy môn học' }, { status: 404 })
  }

  const data: any = {}
  if (pricePerHour !== undefined) {
    if (pricePerHour < 50000) return NextResponse.json({ error: 'Giá tối thiểu 50.000đ' }, { status: 400 })
    data.pricePerHour = pricePerHour
  }
  if (description !== undefined) data.description = description

  const updated = await db.tutorSubject.update({ where: { id }, data, include: { subject: true } })

  // Recompute hourly rate (min of all)
  const allSubjects = await db.tutorSubject.findMany({ where: { tutorId: user.id }, select: { pricePerHour: true } })
  if (allSubjects.length > 0) {
    const minPrice = Math.min(...allSubjects.map(s => s.pricePerHour))
    await db.user.update({ where: { id: user.id }, data: { hourlyRate: minPrice } })
  }

  return NextResponse.json(updated)
}

// DELETE - remove a subject from tutor's profile
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const ts = await db.tutorSubject.findUnique({ where: { id } })
  if (!ts || ts.tutorId !== user.id) {
    return NextResponse.json({ error: 'Không tìm thấy môn học' }, { status: 404 })
  }

  await db.tutorSubject.delete({ where: { id } })

  // Recompute hourly rate
  const remaining = await db.tutorSubject.findMany({ where: { tutorId: user.id }, select: { pricePerHour: true } })
  if (remaining.length > 0) {
    const minPrice = Math.min(...remaining.map(s => s.pricePerHour))
    await db.user.update({ where: { id: user.id }, data: { hourlyRate: minPrice } })
  } else {
    await db.user.update({ where: { id: user.id }, data: { hourlyRate: null } })
  }

  return NextResponse.json({ ok: true })
}
