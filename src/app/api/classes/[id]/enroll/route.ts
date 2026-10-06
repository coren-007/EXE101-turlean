// POST /api/classes/[id]/enroll — phụ huynh/học sinh gửi đăng ký vào lớp học cố định.
// Quy tắc:
//  - Lớp phải đang OPEN (PAUSED = tạm dừng tuyển, CLOSED = đã đóng)
//  - Sĩ số đã duyệt (APPROVED) phải nhỏ hơn capacity
//  - Mỗi người một đăng ký duy nhất; bị từ chối/rút rồi thì được đăng ký lại
//  - Gia sư nhận thông báo hệ thống trong hộp tin nhắn để duyệt
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { notifyTutorNewEnrollment } from '@/lib/notify'
import { formatClassSchedule } from '@/lib/format'

const enrollSchema = z.object({
  studentName: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500, 'Lời nhắn tối đa 500 ký tự').optional().nullable(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'STUDENT') {
    return NextResponse.json(
      { error: 'Chỉ phụ huynh/học sinh mới đăng ký được lớp học' },
      { status: 403 },
    )
  }

  const { id } = await params

  let raw: unknown = {}
  try {
    raw = await req.json()
  } catch { /* body rỗng vẫn hợp lệ */ }
  const parsed = enrollSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const studentName = parsed.data.studentName?.trim() || user.name
  const note = parsed.data.note?.trim() || null

  const cls = await db.groupClass.findUnique({
    where: { id },
    include: {
      schedule: true,
      subject: { select: { name: true } },
      tutor: { select: { id: true, name: true, address: true } },
      enrollments: { select: { id: true, studentParentId: true, status: true } },
    },
  })
  if (!cls) return NextResponse.json({ error: 'Không tìm thấy lớp học' }, { status: 404 })
  if (cls.tutorId === user.id) {
    return NextResponse.json({ error: 'Đây là lớp của chính bạn' }, { status: 400 })
  }
  if (cls.status === 'CLOSED') {
    return NextResponse.json({ error: 'Lớp này đã đóng' }, { status: 400 })
  }
  if (cls.status === 'PAUSED') {
    return NextResponse.json(
      { error: 'Lớp đang tạm dừng tuyển học sinh — vui lòng quay lại sau' },
      { status: 400 },
    )
  }

  const approved = cls.enrollments.filter(e => e.status === 'APPROVED').length
  if (approved >= cls.capacity) {
    return NextResponse.json(
      { error: `Lớp đã đủ sĩ số (${approved}/${cls.capacity} học sinh)` },
      { status: 400 },
    )
  }

  const existing = cls.enrollments.find(e => e.studentParentId === user.id)
  if (existing && (existing.status === 'PENDING' || existing.status === 'APPROVED')) {
    return NextResponse.json(
      {
        error:
          existing.status === 'PENDING'
            ? 'Bạn đã gửi đăng ký lớp này — đang chờ gia sư duyệt'
            : 'Bạn đã ở trong lớp này rồi',
      },
      { status: 400 },
    )
  }

  // Đăng ký mới, hoặc đăng ký lại sau khi bị từ chối / đã rút
  const payload = { studentName, note, status: 'PENDING', updatedAt: new Date() }
  const enrollment = existing
    ? await db.classEnrollment.update({ where: { id: existing.id }, data: payload })
    : await db.classEnrollment.create({
        data: { classId: cls.id, studentParentId: user.id, ...payload },
      })

  // Thông báo cho gia sư (best-effort, không chặn luồng chính)
  await notifyTutorNewEnrollment({
    tutorId: cls.tutorId,
    studentParentId: user.id,
    parentName: user.name,
    studentName,
    classTitle: cls.title,
    schedule: formatClassSchedule(cls.schedule),
    enrolledCount: approved,
    capacity: cls.capacity,
    note,
  })

  return NextResponse.json({
    enrollment,
    message: `Đã gửi đăng ký vào lớp "${cls.title}" — gia sư sẽ duyệt sớm nhất`,
  })
}
