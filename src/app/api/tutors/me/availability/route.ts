import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// GET - list current tutor's weekly availability
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const availability = await db.availability.findMany({
    where: { tutorId: user.id },
    orderBy: { dayOfWeek: 'asc' },
  })
  return NextResponse.json({ availability })
}

// POST - add a new availability slot
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { dayOfWeek, startTime, endTime } = await req.json()
  if (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6) {
    return NextResponse.json({ error: 'Ngày không hợp lệ' }, { status: 400 })
  }
  if (!startTime || !endTime) {
    return NextResponse.json({ error: 'Thiếu giờ bắt đầu/kết thúc' }, { status: 400 })
  }
  if (startTime >= endTime) {
    return NextResponse.json({ error: 'Giờ bắt đầu phải trước giờ kết thúc' }, { status: 400 })
  }

  // Check overlap with existing slots
  const existing = await db.availability.findMany({ where: { tutorId: user.id, dayOfWeek } })
  for (const slot of existing) {
    if (startTime < slot.endTime && endTime > slot.startTime) {
      return NextResponse.json({ error: 'Trùng lịch với slot đã có' }, { status: 400 })
    }
  }

  const slot = await db.availability.create({
    data: { tutorId: user.id, dayOfWeek, startTime, endTime },
  })
  return NextResponse.json(slot)
}
