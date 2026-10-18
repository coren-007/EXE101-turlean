import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// SẸ-AV (B7, audit bảo mật): trước đây startTime/endTime nhận chuỗi bất kỳ
// ('abc' được lưu thẳng vào DB — đã live-verify). Đặc biệt giờ thiếu số 0
// ('7:00') phá lexical ordering "7:00" > "17:00" → check trùng giờ sai,
// 2 slot trùng thật cùng tồn tại. Giờ buộc chuẩn HH:MM (00:00–23:59).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const slotSchema = z.object({
  dayOfWeek: z.number().int().min(0, 'Ngày không hợp lệ').max(6, 'Ngày không hợp lệ'),
  startTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ (đúng định dạng HH:MM, ví dụ 07:00)'),
  endTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ (đúng định dạng HH:MM, ví dụ 07:00)'),
})

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

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const parsed = slotSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const { dayOfWeek, startTime, endTime } = parsed.data
  if (startTime >= endTime) {
    return NextResponse.json({ error: 'Giờ bắt đầu phải trước giờ kết thúc' }, { status: 400 })
  }

  // Check overlap with existing slots (cùng 1 ngày không chồng lấn)
  const existing = await db.availability.findMany({ where: { tutorId: user.id, dayOfWeek } })
  for (const slot of existing) {
    if (startTime < slot.endTime && endTime > slot.startTime) {
      return NextResponse.json({ error: `Trùng khung giờ đã có (${slot.startTime}–${slot.endTime})` }, { status: 400 })
    }
  }

  const slot = await db.availability.create({
    data: { tutorId: user.id, dayOfWeek, startTime, endTime },
  })
  return NextResponse.json(slot)
}
