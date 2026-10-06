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
// kind: FREE (giờ trống nhận lớp mới — mặc định) | FIXED (lịch dạy cố định đã có)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { dayOfWeek, startTime, endTime, kind } = await req.json()
  if (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6) {
    return NextResponse.json({ error: 'Ngày không hợp lệ' }, { status: 400 })
  }
  if (!startTime || !endTime) {
    return NextResponse.json({ error: 'Thiếu giờ bắt đầu/kết thúc' }, { status: 400 })
  }
  if (startTime >= endTime) {
    return NextResponse.json({ error: 'Giờ bắt đầu phải trước giờ kết thúc' }, { status: 400 })
  }
  const slotKind = kind === 'FIXED' ? 'FIXED' : 'FREE'

  // Check overlap with existing slots (cả FREE lẫn FIXED — cùng 1 ngày không chồng lấn)
  const existing = await db.availability.findMany({ where: { tutorId: user.id, dayOfWeek } })
  for (const slot of existing) {
    if (startTime < slot.endTime && endTime > slot.startTime) {
      const label = slot.kind === 'FIXED' ? 'lịch dạy cố định' : 'khung giờ'
      return NextResponse.json({ error: `Trùng ${label} đã có (${slot.startTime}–${slot.endTime})` }, { status: 400 })
    }
  }

  const slot = await db.availability.create({
    data: { tutorId: user.id, dayOfWeek, startTime, endTime, kind: slotKind },
  })
  return NextResponse.json(slot)
}
