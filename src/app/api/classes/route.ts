// GET  /api/classes?tutorId=... — lớp học cố định (nhóm) công khai của một gia sư
//        (hiển thị trên hồ sơ: lịch cố định + sức chứa + trạng thái đăng ký của người xem)
// POST /api/classes — gia sư mở lớp học cố định mới (học tại nhà mình, theo lịch tuần)
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { checkClassSlotConflicts, generateSessionsForClass } from '@/lib/class-sessions'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const slotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ (HH:MM)'),
  endTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ (HH:MM)'),
})

const classSchema = z.object({
  title: z.string().trim().min(3, 'Tên lớp tối thiểu 3 ký tự').max(120, 'Tên lớp tối đa 120 ký tự'),
  subjectId: z.string().min(1, 'Vui lòng chọn môn học'),
  gradeLevel: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  meetingType: z.enum(['AT_TUTOR_HOME', 'ONLINE']).optional(),
  address: z.string().trim().max(300).optional().nullable(),
  capacity: z.number().int().min(1, 'Sĩ số tối thiểu 1').max(50, 'Sĩ số tối đa 50'),
  monthlyFee: z.number().int().min(0).max(100_000_000).optional().nullable(),
  startDate: z.string().regex(DATE_RE, 'Ngày khai giảng không hợp lệ').optional().nullable(),
  schedule: z.array(slotSchema).min(1, 'Lớp cần ít nhất 1 buổi học cố định trong tuần').max(10),
})

// Hai buổi trong cùng lớp không được chồng lấn (cùng thứ + giao giờ)
function findOverlap(slots: { dayOfWeek: number; startTime: string; endTime: string }[]) {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j]
      if (a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime) {
        return [a, b]
      }
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const tutorId = new URL(req.url).searchParams.get('tutorId')
  if (!tutorId) {
    return NextResponse.json({ error: 'Thiếu tutorId' }, { status: 400 })
  }

  const tutor = await db.user.findFirst({ where: { id: tutorId, role: 'TUTOR' } })
  if (!tutor) {
    return NextResponse.json({ error: 'Không tìm thấy gia sư' }, { status: 404 })
  }

  // Hồ sơ công khai: hiện lớp ĐANG TUYỂN (OPEN) + TẠM DỪNG TUYỂN (PAUSED); CLOSED đã kết thúc
  const classes = await db.groupClass.findMany({
    where: { tutorId, status: { not: 'CLOSED' } },
    include: {
      subject: { select: { id: true, name: true, slug: true, icon: true } },
      schedule: true,
      enrollments: { select: { id: true, status: true, studentParentId: true, createdAt: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  // Buổi học SẮP DIỄN RA của từng lớp (hiển thị "buổi tới" + tổng buổi tương lai)
  const classIds = classes.map(c => c.id)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const upcomingSessions = classIds.length
    ? await db.classSession.findMany({
        where: { classId: { in: classIds }, status: 'SCHEDULED', date: { gte: todayStr } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        select: { classId: true, date: true, startTime: true, endTime: true },
      })
    : []
  const nextByClass = new Map<string, { date: string; startTime: string; endTime: string }>()
  const upcomingCountByClass = new Map<string, number>()
  for (const s of upcomingSessions) {
    if (!nextByClass.has(s.classId)) {
      nextByClass.set(s.classId, { date: s.date, startTime: s.startTime, endTime: s.endTime })
    }
    upcomingCountByClass.set(s.classId, (upcomingCountByClass.get(s.classId) ?? 0) + 1)
  }

  // Người xem là phụ huynh/học sinh → đính kèm trạng thái đăng ký của chính họ
  const viewer = await getCurrentUser()
  const viewerId = viewer && viewer.role === 'STUDENT' ? viewer.id : null

  return NextResponse.json({
    classes: classes.map(c => {
      const approved = c.enrollments.filter(e => e.status === 'APPROVED').length
      const pending = c.enrollments.filter(e => e.status === 'PENDING').length
      const waitlist = c.enrollments.filter(e => e.status === 'WAITLIST')
      const mine = viewerId
        ? c.enrollments.find(e => e.studentParentId === viewerId) ?? null
        : null
      // Vị trí chờ của người xem (nếu đang trong danh sách chờ)
      const myWaitlistPosition = mine && mine.status === 'WAITLIST'
        ? waitlist.filter(w => w.createdAt <= mine.createdAt).length
        : null
      return {
        id: c.id,
        tutorId: c.tutorId,
        title: c.title,
        subject: c.subject,
        gradeLevel: c.gradeLevel,
        description: c.description,
        meetingType: c.meetingType,
        address: c.address ?? tutor.address,
        capacity: c.capacity,
        monthlyFee: c.monthlyFee,
        status: c.status,
        startDate: c.startDate,
        schedule: c.schedule.map(s => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        enrolledCount: approved,
        pendingCount: pending,
        waitlistCount: waitlist.length,
        nextSession: nextByClass.get(c.id) ?? null,
        upcomingCount: upcomingCountByClass.get(c.id) ?? 0,
        myEnrollment: mine ? { id: mine.id, status: mine.status } : null,
        myWaitlistPosition,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được mở lớp học' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const parsed = classSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const { title, subjectId, gradeLevel, description, meetingType, address, capacity, monthlyFee, startDate, schedule } = parsed.data
  const meetType = meetingType ?? 'AT_TUTOR_HOME'

  // Slot giờ hợp lệ: bắt đầu trước kết thúc
  for (const s of schedule) {
    if (s.startTime >= s.endTime) {
      return NextResponse.json(
        { error: `Buổi thứ ${s.dayOfWeek}: giờ bắt đầu phải trước giờ kết thúc` },
        { status: 400 },
      )
    }
  }
  const overlap = findOverlap(schedule)
  if (overlap) {
    return NextResponse.json(
      { error: 'Hai buổi học trong tuần chồng lấn giờ — vui lòng sửa lịch' },
      { status: 400 },
    )
  }

  // Môn học phải nằm trong danh sách môn dạy của gia sư (giá đã niêm yết)
  const ts = await db.tutorSubject.findUnique({
    where: { tutorId_subjectId: { tutorId: user.id, subjectId } },
  })
  if (!ts) {
    return NextResponse.json(
      { error: 'Bạn chưa đăng ký dạy môn này — thêm môn trong tab "Môn & giá" trước' },
      { status: 400 },
    )
  }

  // Lớp tại nhà gia sư cần có địa chỉ (dùng địa chỉ hồ sơ nếu bỏ trống)
  const finalAddress =
    address?.trim() || (meetType === 'AT_TUTOR_HOME' ? user.address ?? null : null)
  if (meetType === 'AT_TUTOR_HOME' && !finalAddress) {
    return NextResponse.json(
      { error: 'Cần địa điểm học — hãy nhập địa chỉ lớp hoặc cập nhật địa chỉ nhà trong hồ sơ' },
      { status: 400 },
    )
  }

  // Chống trùng lịch CHÉO (B9): lớp mới không được trùng lớp nhóm khác của gia sư
  // (OPEN/PAUSED) hoặc buổi 1-1 đã nhận trong 8 tuần tới
  const conflicts = await checkClassSlotConflicts(user.id, schedule)
  if (conflicts.length > 0) {
    return NextResponse.json(
      { error: `Không thể mở lớp — trùng lịch dạy hiện có: ${conflicts[0]}${conflicts.length > 1 ? ` (và ${conflicts.length - 1} xung đột khác)` : ''}` },
      { status: 409 },
    )
  }

  const created = await db.groupClass.create({
    data: {
      tutorId: user.id,
      subjectId,
      title,
      gradeLevel,
      description,
      meetingType: meetType,
      address: finalAddress,
      capacity,
      monthlyFee,
      startDate,
      status: 'OPEN',
      schedule: {
        create: schedule.map(s => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      },
    },
    include: {
      schedule: true,
      subject: { select: { id: true, name: true } },
    },
  })

  // Sinh buổi học cụ thể 12 tuần tới từ lịch tuần (điểm danh / dời buổi dựa trên này)
  const sessionsCreated = await generateSessionsForClass(created.id)

  return NextResponse.json({ ...created, sessionsCreated }, { status: 201 })
}
