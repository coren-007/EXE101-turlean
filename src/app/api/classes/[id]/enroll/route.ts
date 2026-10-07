// POST /api/classes/[id]/enroll — phụ huynh/học sinh gửi đăng ký vào lớp học cố định.
// Quy tắc:
//  - Lớp phải đang OPEN (PAUSED = tạm dừng tuyển, CLOSED = đã đóng)
//  - CÒN CHỖ → đăng ký thường (PENDING, chờ gia sư duyệt)
//  - HẾT CHỖ → tự động vào DANH SÁCH CHỜ (WAITLIST) theo thứ tự — khi có học sinh
//    rời lớp hoặc gia sư tăng sĩ số, hệ thống tự chuyển vào lớp (kèm thông báo)
//  - Mỗi người một đăng ký duy nhất; bị từ chối/rút rồi thì được đăng ký lại
//  - Gia sư nhận thông báo hệ thống trong hộp tin nhắn
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { notifyTutorNewEnrollment, notifyTutorNewWaitlist } from '@/lib/notify'
import { formatClassSchedule, CLASS_DAY_NAMES } from '@/lib/format'

const enrollSchema = z.object({
  studentName: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500, 'Lời nhắn tối đa 500 ký tự').optional().nullable(),
  // force = true: đã xem cảnh báo trùng lịch và vẫn muốn đăng ký
  force: z.boolean().optional(),
})

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Cảnh báo trùng lịch cho PHỤ HUYNH/HỌC SINH: lịch tuần của lớp sắp đăng ký có
 * trùng buổi lớp nhóm khác (đang học) hoặc buổi 1-1 đã đặt trong 8 tuần tới không.
 * Trả về danh sách mô tả trùng (rỗng = không trùng). KHÔNG chặn — chỉ cảnh báo,
 * người dùng có thể xác nhận đăng ký tiếp (force).
 */
async function findStudentScheduleConflicts(
  studentId: string,
  slots: { dayOfWeek: number; startTime: string; endTime: string }[],
  excludeClassId: string,
): Promise<string[]> {
  if (slots.length === 0) return []
  const today = todayISO()
  const until = addDaysISO(today, 56)
  const conflicts: string[] = []

  // (a) Lớp nhóm khác mà học sinh đang APPROVED
  const otherEnrollments = await db.classEnrollment.findMany({
    where: {
      studentParentId: studentId,
      status: 'APPROVED',
      class: { id: { not: excludeClassId }, status: { in: ['OPEN', 'PAUSED'] } },
    },
    include: {
      class: {
        select: { title: true, schedule: true },
      },
    },
  })
  for (const oe of otherEnrollments) {
    // So khung giờ tuần trước — trùng slot nghĩa là trùng mọi tuần
    for (const os of oe.class.schedule) {
      for (const ns of slots) {
        if (os.dayOfWeek === ns.dayOfWeek && os.startTime < ns.endTime && ns.startTime < os.endTime) {
          conflicts.push(
            `Trùng lịch với lớp "${oe.class.title}" — ${CLASS_DAY_NAMES[os.dayOfWeek]} ${os.startTime}–${os.endTime}`,
          )
        }
      }
    }
  }

  // (b) Buổi 1-1 đã đặt (PENDING/CONFIRMED) trong 8 tuần tới
  const bookings = await db.booking.findMany({
    where: {
      studentId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      date: { gte: today, lte: until },
    },
    include: { subject: { select: { name: true } }, tutor: { select: { name: true } } },
  })
  for (const b of bookings) {
    const dow = new Date(`${b.date}T00:00:00`).getDay()
    for (const ns of slots) {
      if (ns.dayOfWeek === dow && ns.startTime < b.endTime && b.startTime < ns.endTime) {
        conflicts.push(
          `Trùng buổi 1-1 ${b.subject.name} với gia sư ${b.tutor.name} — ${b.date} ${b.startTime}–${b.endTime}`,
        )
      }
    }
  }

  return [...new Set(conflicts)].slice(0, 6)
}

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
      enrollments: { select: { id: true, studentParentId: true, status: true, createdAt: true } },
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

  // HẠN ĐĂNG KÝ: quá hạn thì không nhận đăng ký mới (kể cả danh sách chờ)
  if (cls.enrollDeadline) {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    if (cls.enrollDeadline < todayStr) {
      return NextResponse.json(
        { error: `Đã hết hạn đăng ký lớp này (hạn chót ${cls.enrollDeadline}) — vui lòng tìm lớp khác hoặc liên hệ gia sư` },
        { status: 400 },
      )
    }
  }

  const approved = cls.enrollments.filter(e => e.status === 'APPROVED').length
  const isFull = approved >= cls.capacity
  const waiting = cls.enrollments
    .filter(e => e.status === 'WAITLIST')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  const existing = cls.enrollments.find(e => e.studentParentId === user.id)
  if (existing && ['PENDING', 'APPROVED', 'WAITLIST'].includes(existing.status)) {
    return NextResponse.json(
      {
        error:
          existing.status === 'PENDING'
            ? 'Bạn đã gửi đăng ký lớp này — đang chờ gia sư duyệt'
            : existing.status === 'WAITLIST'
              ? 'Bạn đã ở trong danh sách chờ của lớp này'
              : 'Bạn đã ở trong lớp này rồi',
      },
      { status: 400 },
    )
  }

  // CẢNH BÁO TRÙNG LỊCH: lịch tuần lớp này có chồng lấn lịch học đang có của
  // phụ huynh/học sinh (lớp nhóm khác + buổi 1-1 trong 8 tuần tới) → 409 kèm
  // danh sách để frontend hỏi xác nhận; force=true thì cho đăng ký tiếp.
  if (!parsed.data.force) {
    const conflicts = await findStudentScheduleConflicts(user.id, cls.schedule, cls.id)
    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          error: 'Lịch lớp này đang trùng với lịch học đã có của bạn',
          conflicts,
        },
        { status: 409 },
      )
    }
  }

  // Còn chỗ → PENDING chờ duyệt; hết chỗ → WAITLIST danh sách chờ (tự động vào lớp khi có chỗ)
  const status = isFull ? 'WAITLIST' : 'PENDING'
  const payload = { studentName, note, status, updatedAt: new Date() }
  const enrollment = existing
    ? await db.classEnrollment.update({ where: { id: existing.id }, data: payload })
    : await db.classEnrollment.create({
        data: { classId: cls.id, studentParentId: user.id, ...payload },
      })

  // ===== Thông báo (best-effort, không chặn luồng chính) =====
  if (status === 'WAITLIST') {
    const position = waiting.length + 1
    await notifyTutorNewWaitlist({
      tutorId: cls.tutorId,
      studentParentId: user.id,
      parentName: user.name,
      studentName,
      classTitle: cls.title,
      position,
      note,
    })
    return NextResponse.json({
      enrollment,
      waitlistPosition: position,
      message: `Lớp "${cls.title}" đã đủ sĩ số (${approved}/${cls.capacity}) — bạn đã vào DANH SÁCH CHỖ (vị trí #${position}). Khi có chỗ trống, hệ thống tự động chuyển bạn vào lớp và gửi thông báo.`,
    })
  }

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
