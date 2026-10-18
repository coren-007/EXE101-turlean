// POST /api/bookings/[id]/cancel — hủy lịch kèm lý do + ghi nhận vi phạm (P0-1)
// Thay thế cho việc hủy "trơn" qua PATCH: mọi lần hủy giờ đây đều bắt buộc
// lý do (>= 5 ký tự) và được phân loại mức độ vi phạm để trừ điểm reliability.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { classifyCancellation, applyAutoLockIfNeeded } from '@/lib/reliability'
import { notifyCancellation } from '@/lib/notify'
import { checkRateLimit } from '@/lib/rate-limit'
import { vnEpoch } from '@/lib/vn-time'

const cancelSchema = z.object({
  reason: z.string().trim().min(5, 'Lý do hủy phải có ít nhất 5 ký tự'),
})

// SẸ-TZ (B3): epoch theo giờ VN — không lệch theo TZ server (đã từng làm
// cổng "trước 24h" trễ 7 tiếng khi deploy host UTC)
function hoursUntil(date: string, startTime: string): number {
  return (vnEpoch(date, startTime) - Date.now()) / (1000 * 60 * 60)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  // SẬ-RL: chặn spam hủy — 20 lần / giờ / tài khoản
  const rl = checkRateLimit(`cancel:${user.id}`, 20, 3_600_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Bạn đã thực hiện quá nhiều thao tác trong giờ này. Vui lòng thử lại sau ${Math.ceil(rl.retryAfterSec / 60)} phút.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

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

  // SẬ-BK4 (audit TB — idempotency + race): ghi hủy + đổi trạng thái trong 1 transaction
  // dùng updateMany CÓ ĐIỀU KIỆN (status còn PENDING/CONFIRMED). Nhờ đó:
  //  · Hủy tuần tự lần 2 → count=0 → 400 "đã hủy trước đó", KHÔNG trừ điểm lần 2.
  //  · Hủy song song (2 request cùng lúc) → chỉ 1 request thắng điều kiện, request
  //    thua nhận 400 — không còn cửa sổ đọc-check-ghi tách rời tạo 2 bản ghi trừ điểm.
  const cancelResult = await db.$transaction(async (tx) => {
    const upd = await tx.booking.updateMany({
      where: { id: booking.id, status: { in: ['PENDING', 'CONFIRMED'] } },
      data: { status: 'CANCELLED' },
    })
    if (upd.count === 0) return null
    await tx.cancellation.create({
      data: {
        bookingId: booking.id,
        cancelledBy: isTutor ? 'TUTOR' : 'STUDENT',
        reason,
        bookingStatus: booking.status,
        hoursBefore: Math.round(hoursBefore * 10) / 10,
        severity: rule.severity,
        points: rule.points,
      },
    })
    return tx.booking.findUnique({ where: { id: booking.id } })
  })

  if (!cancelResult) {
    return NextResponse.json(
      { error: 'Lịch này đã bị hủy trước đó hoặc không thể hủy — vui lòng tải lại trang.' },
      { status: 400 },
    )
  }
  const updated = cancelResult

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

  // P6: sau khi trừ điểm, tự khóa tài khoản của người hủy nếu điểm tin cậy < 30.
  // Là best-effort sau giao dịch chính — lỗi ở đây không làm fail request hủy.
  let autoLock: { locked: boolean; score: number } | null = null
  try {
    const cancellerId = isTutor ? booking.tutorId : booking.studentId
    autoLock = await applyAutoLockIfNeeded(cancellerId)
  } catch (e) {
    console.error('[auto-lock] không kiểm tra được ngưỡng khóa:', e)
  }

  const lockWarning =
    autoLock?.locked
      ? ` Tài khoản của bạn đã bị KHÓA do điểm tin cậy còn ${autoLock.score}/100 — sẽ không thể đăng nhập cho tới khi quản trị viên mở khóa.`
      : ''

  return NextResponse.json({
    booking: updated,
    violation: {
      severity: rule.severity,
      points: rule.points,
      label: rule.label,
      hoursBefore: Math.round(hoursBefore * 10) / 10,
    },
    autoLocked: autoLock?.locked ?? false,
    reliabilityScore: autoLock?.score ?? null,
    message:
      rule.points > 0
        ? `Đã hủy lịch. Lưu ý: ${rule.label.toLowerCase()} — trừ ${rule.points} điểm độ tin cậy.${lockWarning}`
        : 'Đã hủy lịch (không ảnh hưởng điểm độ tin cậy).' + lockWarning,
  })
}
