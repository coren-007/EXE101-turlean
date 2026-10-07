// /api/holidays — NGÀY NGHỈ LỄ toàn hệ thống.
//  GET    → danh sách ngày lễ (từ hôm nay trở đi) — mọi người đăng nhập đều xem được
//           (hiển thị trên lịch tuần/tháng)
//  POST   → thêm ngày lễ (gia sư) — tự động HỦY các buổi SCHEDULED tương lai trúng
//           ngày (trừ buổi dạy bù) + gửi thông báo nghỉ lễ cho học sinh các lớp affected
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { cancelSessionsOnHoliday } from '@/lib/class-sessions'
import { notifyStudentsHolidayCancelled } from '@/lib/notify'
import { formatDate } from '@/lib/format'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const postSchema = z.object({
  date: z.string().regex(DATE_RE, 'Ngày không hợp lệ (YYYY-MM-DD)'),
  name: z.string().trim().min(2, 'Tên ngày lễ tối thiểu 2 ký tự').max(60),
})

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  // Ngày lễ từ hôm nay trở đi (lịch sử lễ cũ không cần hiển thị)
  const holidays = await db.holiday.findMany({
    where: { date: { gte: todayISO() } },
    orderBy: { date: 'asc' },
  })
  return NextResponse.json({ holidays })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được thêm ngày nghỉ lễ' }, { status: 403 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const { date, name } = parsed.data

  const holiday = await db.holiday.upsert({
    where: { date },
    create: { date, name },
    update: { name },
  })

  // Hủy buổi tương lai trúng ngày lễ + gửi thông báo học sinh (best-effort)
  const affected = await cancelSessionsOnHoliday(date, name)
  for (const s of affected) {
    await notifyStudentsHolidayCancelled({
      tutorId: s.tutorId,
      tutorName: s.tutorName,
      classTitle: s.classTitle,
      date: formatDate(s.date),
      time: s.time,
      holidayName: name,
      students: s.students,
    }).catch(() => {})
  }

  return NextResponse.json({
    holiday,
    sessionsCancelled: affected.length,
    message:
      affected.length > 0
        ? `Đã thêm ngày lễ "${name}" (${formatDate(date)}) — ${affected.length} buổi tương lai được tự động nghỉ + học sinh đã nhận thông báo`
        : `Đã thêm ngày lễ "${name}" (${formatDate(date)})`,
  })
}
