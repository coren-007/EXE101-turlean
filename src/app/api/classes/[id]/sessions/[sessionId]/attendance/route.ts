// POST /api/classes/[id]/sessions/[sessionId]/attendance — gia sư ĐIỂM DANH một buổi
// học lớp nhóm: đánh dấu từng học sinh APPROVED là CÓ MẶT (PRESENT) / VẮNG (ABSENT).
//
// Quy tắc:
//  - Chỉ điểm danh được SAU khi buổi đã đến giờ bắt đầu (đồng nhất logic "hoàn thành
//    sau giờ học" của lớp 1-1). Buổi đã COMPLETED cho phép SỬA lại điểm danh.
//  - Chỉ học sinh đang APPROVED trong lớp mới được điểm danh (học sinh rời lớp giữa
//    chừng không xuất hiện ở các buổi sau).
//  - Sau khi gửi → buổi chuyển sang COMPLETED (nền tảng cho thống kê "đã học X buổi").
//  - Rolling schedule: buổi gần hết thì tự sinh thêm 12 tuần.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { ensureRollingSessions } from '@/lib/class-sessions'
import { formatDate } from '@/lib/format'

const attendanceSchema = z.object({
  attendance: z
    .array(
      z.object({
        studentParentId: z.string().min(1),
        status: z.enum(['PRESENT', 'ABSENT']),
      }),
    )
    .min(1, 'Danh sách điểm danh không được trống')
    .max(50),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được điểm danh' }, { status: 403 })
  }

  const { id, sessionId } = await params
  const raw = await req.json().catch(() => null)
  const parsed = attendanceSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const rows = parsed.data.attendance

  const session = await db.classSession.findUnique({
    where: { id: sessionId },
    include: {
      class: {
        include: {
          enrollments: { select: { studentParentId: true, status: true } },
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
  if (session.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Buổi này đã bị hủy — không thể điểm danh' }, { status: 400 })
  }

  // Chỉ điểm danh SAU giờ bắt đầu (trừ khi sửa lại buổi đã hoàn thành)
  const startAt = new Date(`${session.date}T${session.startTime}`)
  if (session.status === 'SCHEDULED' && startAt.getTime() > Date.now()) {
    return NextResponse.json(
      { error: `Chưa tới giờ — chỉ điểm danh được sau khi buổi đã bắt đầu (${formatDate(session.date)} ${session.startTime})` },
      { status: 400 },
    )
  }

  // Học sinh gửi lên phải nằm trong danh sách APPROVED của lớp
  const approvedIds = new Set(
    session.class.enrollments.filter(e => e.status === 'APPROVED').map(e => e.studentParentId),
  )
  if (approvedIds.size === 0) {
    return NextResponse.json({ error: 'Lớp chưa có học sinh nào để điểm danh' }, { status: 400 })
  }
  const invalid = rows.find(r => !approvedIds.has(r.studentParentId))
  if (invalid) {
    return NextResponse.json(
      { error: 'Có học sinh không thuộc lớp này (hoặc đã rời lớp) trong danh sách điểm danh' },
      { status: 400 },
    )
  }

  // Upsert điểm danh từng học sinh (cho phép sửa lại sau khi đã hoàn thành)
  await db.$transaction(
    rows.map(r =>
      db.classAttendance.upsert({
        where: {
          sessionId_studentParentId: {
            sessionId,
            studentParentId: r.studentParentId,
          },
        },
        create: {
          sessionId,
          studentParentId: r.studentParentId,
          status: r.status,
        },
        update: {
          status: r.status,
          updatedAt: new Date(),
        },
      }),
    ),
  )

  // Buổi chuyển sang COMPLETED
  const updated = await db.classSession.update({
    where: { id: sessionId },
    data: { status: 'COMPLETED' },
    include: { attendance: true },
  })

  // Rolling schedule: buổi sắp hết → tự sinh thêm 12 tuần
  const extended = await ensureRollingSessions(id)

  const present = updated.attendance.filter(a => a.status === 'PRESENT').length
  const absent = updated.attendance.filter(a => a.status === 'ABSENT').length

  return NextResponse.json({
    session: updated,
    summary: { total: updated.attendance.length, present, absent },
    sessionsExtended: extended,
    message: `Đã điểm danh buổi ${formatDate(session.date)} — ${present} có mặt, ${absent} vắng`,
  })
}
