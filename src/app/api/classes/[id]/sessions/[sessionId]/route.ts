// PATCH /api/classes/[id]/sessions/[sessionId] — gia sư thao tác trên MỘT buổi học:
//  - action: 'reschedule' → DỜI BUỔI (dạy bù): đổi ngày/giờ của đúng buổi này,
//    không ảnh hưởng các buổi khác. Check conflict với lớp khác + buổi 1-1 cùng
//    khung giờ mới. Tự động thông báo cho toàn bộ học sinh trong lớp.
//  - action: 'cancel' → NGHỈ BUỔI: hủy đúng buổi này (lý do bắt buộc >= 5 ký tự),
//    các buổi khác vẫn diễn ra bình thường. Không trừ điểm uy tín (khác hủy 1-1 —
//    lớp nhóm là lịch cố định, nghỉ buổi là tình huống bình thường của lớp).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { checkSessionReschedule } from '@/lib/class-sessions'
import { notifyStudentsSessionRescheduled, notifyStudentsSessionCancelled } from '@/lib/notify'
import { formatDate } from '@/lib/format'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const patchSchema = z.object({
  action: z.enum(['reschedule', 'cancel']),
  date: z.string().regex(DATE_RE, 'Ngày không hợp lệ').optional(),
  startTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ').optional(),
  endTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ').optional(),
  reason: z.string().trim().max(300, 'Lý do tối đa 300 ký tự').optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được thao tác buổi học' }, { status: 403 })
  }

  const { id, sessionId } = await params
  const raw = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const body = parsed.data

  const session = await db.classSession.findUnique({
    where: { id: sessionId },
    include: {
      class: {
        include: {
          tutor: { select: { id: true, name: true } },
          enrollments: { include: { studentParent: { select: { id: true, name: true } } } },
        },
      },
    },
  })
  if (!session || session.classId !== id) {
    return NextResponse.json({ error: 'Không tìm thấy buổi học' }, { status: 404 })
  }
  if (session.class.tutorId !== user.id) {
    return NextResponse.json({ error: 'Bạn không phải chủ lớp này' }, { status: 403 })
  }
  if (session.status !== 'SCHEDULED') {
    return NextResponse.json(
      { error: session.status === 'COMPLETED'
        ? 'Buổi này đã hoàn thành (đã điểm danh) — không thể dời/hủy'
        : 'Buổi này đã bị hủy trước đó' },
      { status: 400 },
    )
  }

  const approvedStudents = session.class.enrollments
    .filter(e => e.status === 'APPROVED')
    .map(e => ({ id: e.studentParent.id, name: e.studentParent.name }))

  // ===== Hành động: NGHỈ BUỔI =====
  if (body.action === 'cancel') {
    const reason = body.reason?.trim() ?? ''
    if (reason.length < 5) {
      return NextResponse.json({ error: 'Vui lòng nhập lý do nghỉ buổi (tối thiểu 5 ký tự)' }, { status: 400 })
    }
    const updated = await db.classSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED', note: reason },
    })
    await notifyStudentsSessionCancelled({
      tutorId: session.class.tutorId,
      tutorName: session.class.tutor.name,
      classTitle: session.class.title,
      date: formatDate(session.date),
      time: `${session.startTime}–${session.endTime}`,
      reason,
      students: approvedStudents,
    }).catch(() => {})
    return NextResponse.json({ session: updated, message: `Đã nghỉ buổi ${formatDate(session.date)} — học sinh trong lớp đã nhận thông báo` })
  }

  // ===== Hành động: DỜI BUỔI (dạy bù) =====
  const newDate = body.date ?? session.date
  const newStart = body.startTime ?? session.startTime
  const newEnd = body.endTime ?? session.endTime
  const reason = body.reason?.trim() || null

  if (newStart >= newEnd) {
    return NextResponse.json({ error: 'Giờ bắt đầu phải trước giờ kết thúc' }, { status: 400 })
  }
  if (newDate === session.date && newStart === session.startTime && newEnd === session.endTime) {
    return NextResponse.json({ error: 'Bạn chưa thay đổi ngày hoặc giờ nào' }, { status: 400 })
  }
  // Chỉ dời tới tương lai (cho phép hôm nay nếu giờ còn tới)
  const newStartAt = new Date(`${newDate}T${newStart}`)
  if (newStartAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Không thể dời buổi về thời gian đã qua' }, { status: 400 })
  }

  // Chống trùng lịch: lớp khác + buổi 1-1 cùng ngày của gia sư
  const conflict = await checkSessionReschedule(user.id, sessionId, newDate, newStart, newEnd)
  if (conflict) {
    return NextResponse.json({ error: `Không thể dời buổi — ${conflict}` }, { status: 409 })
  }

  const updated = await db.classSession.update({
    where: { id: sessionId },
    data: { date: newDate, startTime: newStart, endTime: newEnd, note: reason },
  })

  await notifyStudentsSessionRescheduled({
    tutorId: session.class.tutorId,
    tutorName: session.class.tutor.name,
    classTitle: session.class.title,
    oldDate: formatDate(session.date),
    oldTime: session.startTime,
    newDate: formatDate(newDate),
    newTime: `${newStart}–${newEnd}`,
    reason,
    students: approvedStudents,
  }).catch(() => {})

  return NextResponse.json({
    session: updated,
    message: `Đã dời buổi ${formatDate(session.date)} → ${formatDate(newDate)} ${newStart} — học sinh trong lớp đã nhận thông báo`,
  })
}
