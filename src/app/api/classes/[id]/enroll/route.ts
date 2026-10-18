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
import { vnTodayISO, vnDayOfWeek, addDaysISO as addDaysISOVi } from '@/lib/vn-time'

const enrollSchema = z.object({
  studentName: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500, 'Lời nhắn tối đa 500 ký tự').optional().nullable(),
  // force = true: đã xem cảnh báo trùng lịch và vẫn muốn đăng ký
  force: z.boolean().optional(),
})

// SẸ-TZ (B3): hôm nay / cộng ngày đều theo giờ VN — không phụ thuộc TZ server
function todayISO(): string {
  return vnTodayISO()
}

function addDaysISO(iso: string, days: number): string {
  return addDaysISOVi(iso, days)
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
    const dow = vnDayOfWeek(b.date) // SẸ-TZ (B3)
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

  // ===== CẢNH BÁO trùng lịch (đọc thường — best-effort, không đổi dữ liệu) =====
  if (!parsed.data.force) {
    const cls0 = await db.groupClass.findUnique({
      where: { id },
      select: { id: true, schedule: true },
    })
    if (cls0) {
      const conflicts = await findStudentScheduleConflicts(user.id, cls0.schedule, cls0.id)
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
  }

  // ===== SẸ-RACE3 (B11, audit CAO): toàn bộ kiểm tra + quyết định
  // PENDING/WAITLIST + tạo enrollment + vị trí danh sách chờ chạy trong MỘT
  // transaction. Trước đây snapshot enrollments đọc TÁCH RỜI lúc ghi:
  //   · 2 phụ huynh đăng ký lúc lớp còn 1 chỗ → cả 2 cùng được PENDING
  //     (may mắn tự lành ở bước duyệt nhờ SẸ-ENR, nhưng không bảo đảm)
  //   · 2 phụ huynh vào DANH SÁCH CHỜ cùng lúc → cùng nhận vị trí #N
  //     (position tính từ snapshot cũ waiting.length + 1)
  type Outcome =
    | { code: number; error: string }
    | {
        ok: true
        enrollment: unknown
        status: string
        position: number | null
        approved: number
        capacity: number
        classTitle: string
        tutorId: string
        schedule: { dayOfWeek: number; startTime: string; endTime: string }[]
      }
  const outcome: Outcome = await db.$transaction(async tx => {
    const cls = await tx.groupClass.findUnique({
      where: { id },
      include: {
        schedule: true,
        enrollments: { select: { id: true, studentParentId: true, status: true, createdAt: true } },
      },
    })
    if (!cls) return { code: 404, error: 'Không tìm thấy lớp học' }
    if (cls.tutorId === user.id) return { code: 400, error: 'Đây là lớp của chính bạn' }
    if (cls.status === 'CLOSED') return { code: 400, error: 'Lớp này đã đóng' }
    if (cls.status === 'PAUSED') {
      return { code: 400, error: 'Lớp đang tạm dừng tuyển học sinh — vui lòng quay lại sau' }
    }

    // HẠN ĐĂNG KÝ: quá hạn thì không nhận đăng ký mới (kể cả danh sách chờ)
    if (cls.enrollDeadline) {
      const todayStr = todayISO() // SẸ-TZ (B3): theo giờ VN
      if (cls.enrollDeadline < todayStr) {
        return {
          code: 400,
          error: `Đã hết hạn đăng ký lớp này (hạn chót ${cls.enrollDeadline}) — vui lòng tìm lớp khác hoặc liên hệ gia sư`,
        }
      }
    }

    const existing = cls.enrollments.find(e => e.studentParentId === user.id)
    if (existing && ['PENDING', 'APPROVED', 'WAITLIST'].includes(existing.status)) {
      const error =
        existing.status === 'PENDING'
          ? 'Bạn đã gửi đăng ký lớp này — đang chờ gia sư duyệt'
          : existing.status === 'WAITLIST'
            ? 'Bạn đã ở trong danh sách chờ của lớp này'
            : 'Bạn đã ở trong lớp này rồi'
      return { code: 400, error }
    }

    const approved = cls.enrollments.filter(e => e.status === 'APPROVED').length
    const isFull = approved >= cls.capacity

    // Còn chỗ → PENDING chờ duyệt; hết chỗ → WAITLIST danh sách chờ
    const status = isFull ? 'WAITLIST' : 'PENDING'
    const payload = { studentName, note, status, updatedAt: new Date() }
    const enrollment = existing
      ? await tx.classEnrollment.update({ where: { id: existing.id }, data: payload })
      : await tx.classEnrollment.create({
          data: { classId: cls.id, studentParentId: user.id, ...payload },
        })

    // Vị trí danh sách chờ: đếm CHÍNH XÁC trong transaction (đã gồm dòng vừa ghi)
    let position: number | null = null
    if (status === 'WAITLIST') {
      const waitingCount = await tx.classEnrollment.count({
        where: { classId: cls.id, status: 'WAITLIST' },
      })
      position = waitingCount
    }

    return {
      ok: true as const,
      enrollment,
      status,
      position,
      approved,
      capacity: cls.capacity,
      classTitle: cls.title,
      tutorId: cls.tutorId,
      schedule: cls.schedule.map(s => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    }
  })

  if (!('ok' in outcome)) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.code })
  }

  // ===== Thông báo (best-effort, NGOÀI transaction — không chặn luồng chính) =====
  if (outcome.status === 'WAITLIST') {
    const position = outcome.position ?? 1
    await notifyTutorNewWaitlist({
      tutorId: outcome.tutorId,
      studentParentId: user.id,
      parentName: user.name,
      studentName,
      classTitle: outcome.classTitle,
      position,
      note,
    })
    return NextResponse.json({
      enrollment: outcome.enrollment,
      waitlistPosition: position,
      message: `Lớp "${outcome.classTitle}" đã đủ sĩ số (${outcome.approved}/${outcome.capacity}) — bạn đã vào DANH SÁCH CHỖ (vị trí #${position}). Khi có chỗ trống, hệ thống tự động chuyển bạn vào lớp và gửi thông báo.`,
    })
  }

  await notifyTutorNewEnrollment({
    tutorId: outcome.tutorId,
    studentParentId: user.id,
    parentName: user.name,
    studentName,
    classTitle: outcome.classTitle,
    schedule: formatClassSchedule(outcome.schedule),
    enrolledCount: outcome.approved,
    capacity: outcome.capacity,
    note,
  })

  return NextResponse.json({
    enrollment: outcome.enrollment,
    message: `Đã gửi đăng ký vào lớp "${outcome.classTitle}" — gia sư sẽ duyệt sớm nhất`,
  })
}
