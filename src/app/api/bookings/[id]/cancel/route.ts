// POST /api/bookings/[id]/cancel — hủy lịch kèm lý do + ghi nhận vi phạm (P0-1)
// Thay thế cho việc hủy "trơn" qua PATCH: mọi lần hủy giờ đây đều bắt buộc
// lý do (>= 5 ký tự) và được phân loại mức độ vi phạm để trừ điểm reliability.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { classifyCancellation } from '@/lib/reliability'
import { notifyCancellation } from '@/lib/notify'

const cancelSchema = z.object({
  reason: z.string().trim().min(5, 'Lý do hủy phải có ít nhất 5 ký tự'),
})

function hoursUntil(date: string, startTime: string): number {
  const classStart = new Date(`${date}T${startTime}`)
  return (classStart.getTime() - Date.now()) / (1000 * 60 * 60)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await params

  // Validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Lý do hủy không hợp lệ' }, { status: 400 })
  }
  const { reason } = parsed.data

  const booking = await db.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Không tìm thấy lịch đặt' }, { status: 404 })

  const isTutor = booking.tutorId === user.id
  const isStudent = booking.studentId === user.id
  if (!isTutor && !isStudent) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
  }

  if (booking.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Lịch này đã bị hủy trước đó' }, { status: 400 })
  }
  if (booking.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Không thể hủy buổi học đã hoàn thành' }, { status: 400 })
  }

  // Không cho hủy buổi học đã qua giờ bắt đầu — phải liên hệ trực tiếp
  const hoursBefore = hoursUntil(booking.date, booking.startTime)
  if (hoursBefore <= 0) {
    return NextResponse.json(
      { error: 'Không thể hủy buổi học đã đến giờ học. Vui lòng liên hệ trực tiếp để thỏa thuận.' },
      { status: 400 },
    )
  }

  // Phân loại vi phạm theo: ai hủy + trạng thái lúc hủy + độ sát giờ
  const rule = classifyCancellation(
    isTutor ? 'TUTOR' : 'STUDENT',
    booking.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
    hoursBefore,
  )

  // Ghi nhận hủy + cập nhật trạng thái booking trong 1 transaction
  const [, updated] = await db.$transaction([
    db.cancellation.create({
      data: {
        bookingId: booking.id,
        cancelledBy: isTutor ? 'TUTOR' : 'STUDENT',
        reason,
        bookingStatus: booking.status,
        hoursBefore: Math.round(hoursBefore * 10) / 10,
        severity: rule.severity,
        points: rule.points,
      },
    }),
    db.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
    }),
  ])

  // Mục đích 1 & 2: báo ngay cho bên kia biết buổi học đã bị hủy + lý do
  const subject = await db.subject.findUnique({
    where: { id: booking.subjectId },
    select: { name: true },
  })
  await notifyCancellation({
    tutorId: booking.tutorId,
    studentId: booking.studentId,
    cancelledBy: isTutor ? 'TUTOR' : 'STUDENT',
    cancellerName: user.name,
    subjectName: subject?.name ?? 'môn học',
    date: booking.date,
    startTime: booking.startTime,
    reason,
    points: rule.points,
  })

  return NextResponse.json({
    booking: updated,
    violation: {
      severity: rule.severity,
      points: rule.points,
      label: rule.label,
      hoursBefore: Math.round(hoursBefore * 10) / 10,
    },
    message:
      rule.points > 0
        ? `Đã hủy lịch. Lưu ý: ${rule.label.toLowerCase()} — trừ ${rule.points} điểm độ tin cậy.`
        : 'Đã hủy lịch (không ảnh hưởng điểm độ tin cậy).',
  })
}
