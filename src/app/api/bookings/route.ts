import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { notifyTutorNewBooking, notifyStudentConfirmed, notifyStudentCompleted } from '@/lib/notify'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const bookingSchema = z.object({
  tutorId: z.string().min(1),
  subjectId: z.string().min(1),
  mode: z.enum(['TUTOR_TO_STUDENT', 'STUDENT_TO_TUTOR', 'ONLINE']),
  date: z.string().regex(DATE_RE, 'Ngày không hợp lệ (YYYY-MM-DD)'),
  startTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ (HH:MM)'),
  endTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ (HH:MM)'),
  durationHours: z.number().min(0.5).max(4).optional(),
  note: z.string().max(1000).optional(),
  address: z.string().max(500).optional(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  // Lớp học định kỳ (Mục đích 1): số tuần lặp lại cùng khung giờ (1 = buổi lẻ)
  repeatWeeks: z.number().int().min(1).max(12).optional(),
})

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role') // 'tutor' | 'student'
  const status = searchParams.get('status')

  const where: any = {}
  if (role === 'tutor') where.tutorId = user.id
  else if (role === 'student') where.studentId = user.id
  else {
    where.OR = [{ tutorId: user.id }, { studentId: user.id }]
  }
  if (status) where.status = status

  const bookings = await db.booking.findMany({
    where,
    include: {
      tutor: { select: { id: true, name: true, avatar: true, profession: true, phone: true, address: true, district: true, lat: true, lng: true } },
      student: { select: { id: true, name: true, avatar: true, phone: true, address: true, district: true, lat: true, lng: true } },
      subject: { select: { id: true, name: true, slug: true, icon: true } },
      // P0-2: kèm trạng thái review để UI biết buổi nào đã/ chưa được đánh giá
      review: { select: { id: true, rating: true } },
    },
    orderBy: { date: 'desc' },
  })

  return NextResponse.json({ bookings })
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Cộng n tuần vào chuỗi ngày YYYY-MM-DD (giữ nguyên thứ trong tuần)
function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(`${dateStr}T00:00`)
  d.setDate(d.getDate() + weeks * 7)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }
  if (user.role !== 'STUDENT') {
    return NextResponse.json({ error: 'Chỉ học sinh/phụ huynh mới được đặt lịch' }, { status: 403 })
  }

  // Validate body với zod (P0-5: không còn tin client tự khai)
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const parsed = bookingSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const { tutorId, subjectId, mode, date, startTime, endTime, note, address, lat, lng, repeatWeeks } = parsed.data
  const weeks = repeatWeeks ?? 1

  // Thời lượng PHẢI khớp endTime - startTime (server tự tính, không nhận durationHours từ client)
  const startMin = toMinutes(startTime)
  const endMin = toMinutes(endTime)
  if (endMin <= startMin) {
    return NextResponse.json({ error: 'Giờ kết thúc phải sau giờ bắt đầu' }, { status: 400 })
  }
  const durationMin = endMin - startMin
  const durationHours = Math.round((durationMin / 60) * 10) / 10
  if (durationHours < 0.5 || durationHours > 4) {
    return NextResponse.json({ error: 'Thời lượng buổi học phải từ 0.5 đến 4 giờ' }, { status: 400 })
  }

  // Không cho đặt lịch trong quá khứ (cho phép hôm nay nếu giờ còn tới)
  const classStart = new Date(`${date}T${startTime}`)
  if (classStart.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Không thể đặt lịch cho thời gian đã qua' }, { status: 400 })
  }

  // Validate tutor exists and is a tutor
  const tutor = await db.user.findFirst({ where: { id: tutorId, role: 'TUTOR' } })
  if (!tutor) {
    return NextResponse.json({ error: 'Gia sư không tồn tại' }, { status: 400 })
  }

  // Validate mode is supported by tutor (ONLINE giờ đây cũng đặt được — P1)
  if (mode === 'TUTOR_TO_STUDENT' && !tutor.teachesAtStudentHome) {
    return NextResponse.json({ error: 'Gia sư không nhận dạy tại nhà học sinh' }, { status: 400 })
  }
  if (mode === 'STUDENT_TO_TUTOR' && !tutor.teachesAtOwnPlace) {
    return NextResponse.json({ error: 'Gia sư không nhận dạy tại cơ sở' }, { status: 400 })
  }
  if (mode === 'ONLINE' && !tutor.teachesOnline) {
    return NextResponse.json({ error: 'Gia sư không dạy trực tuyến' }, { status: 400 })
  }
  if (mode === 'TUTOR_TO_STUDENT' && !address?.trim()) {
    return NextResponse.json({ error: 'Vui lòng nhập địa chỉ nhà bạn' }, { status: 400 })
  }

  // Validate tutor teaches this subject
  const ts = await db.tutorSubject.findUnique({
    where: { tutorId_subjectId: { tutorId, subjectId } },
  })
  if (!ts) {
    return NextResponse.json({ error: 'Gia sư không dạy môn này' }, { status: 400 })
  }

  // Validate time is within tutor's availability
  const dayOfWeek = new Date(`${date}T00:00`).getDay()
  const availabilities = await db.availability.findMany({
    where: { tutorId, dayOfWeek },
  })
  if (availabilities.length === 0) {
    return NextResponse.json(
      { error: 'Gia sư không có lịch trống vào ngày này' },
      { status: 400 },
    )
  }
  const startOk = availabilities.some(a => startMin >= toMinutes(a.startTime) && startMin < toMinutes(a.endTime))
  const endOk = availabilities.some(a => endMin <= toMinutes(a.endTime) && endMin > toMinutes(a.startTime))
  if (!startOk || !endOk) {
    return NextResponse.json({ error: 'Giờ đặt không nằm trong lịch trống của gia sư' }, { status: 400 })
  }

  // Chặn đặt 1-1 trùng LỚP HỌC CỐ ĐỊNH (nhóm) của gia sư — lớp OPEN/PAUSED vẫn đang diễn ra,
  // CLOSED mới kết thúc. Kiểm tra theo từng ngày của khóa định kỳ bên dưới.
  const classConflictFor = async (d: string) => {
    const dow = new Date(`${d}T00:00`).getDay()
    const slots = await db.classScheduleSlot.findMany({
      where: {
        dayOfWeek: dow,
        class: { tutorId, status: { in: ['OPEN', 'PAUSED'] } },
      },
      include: { class: { select: { title: true } } },
    })
    return slots.find(
      s => startMin < toMinutes(s.endTime) && endMin > toMinutes(s.startTime),
    )
  }
  const classConflict = await classConflictFor(date)
  if (classConflict) {
    return NextResponse.json(
      {
        error: `Trùng lịch lớp học cố định "${classConflict.class.title}" (${classConflict.startTime}–${classConflict.endTime}). Vui lòng chọn giờ khác.`,
      },
      { status: 400 },
    )
  }

  // Conflict check cho GIA SƯ (theo từng ngày của khóa định kỳ)
  const conflictFor = async (d: string, who: 'tutor' | 'student') =>
    db.booking.findFirst({
      where: {
        [who === 'tutor' ? 'tutorId' : 'studentId']: who === 'tutor' ? tutorId : user.id,
        date: d,
        status: { in: ['PENDING', 'CONFIRMED'] },
        AND: [
          { startTime: { lt: endTime } },
          { endTime: { gt: startTime } },
        ],
      },
    })

  if (await conflictFor(date, 'tutor')) {
    return NextResponse.json({ error: 'Gia sư đã có lịch vào khung giờ này. Vui lòng chọn giờ khác.' }, { status: 400 })
  }

  // Conflict check cho HỌC SINH (P1: chống double-booking học sinh)
  if (await conflictFor(date, 'student')) {
    return NextResponse.json({ error: 'Bạn đã có lịch học vào khung giờ này. Vui lòng chọn giờ khác.' }, { status: 400 })
  }

  // Server tự tính tiền từ giá môn học × thời lượng thực (P0-6)
  const totalAmount = Math.round(ts.pricePerHour * durationHours)

  // ===== Lớp học định kỳ: kiểm tra TỪNG tuần, bỏ qua tuần bị trùng lịch =====
  const skipped: { date: string; reason: string }[] = []
  const validDates: string[] = [date]
  for (let i = 1; i < weeks; i++) {
    const d = addWeeks(date, i)
    if (await conflictFor(d, 'tutor')) {
      skipped.push({ date: d, reason: 'Gia sư bận khung giờ này' })
    } else if (await conflictFor(d, 'student')) {
      skipped.push({ date: d, reason: 'Bạn có lịch học trùng giờ' })
    } else {
      const cc = await classConflictFor(d)
      if (cc) {
        skipped.push({ date: d, reason: `Trùng lớp cố định "${cc.class.title}"` })
      } else {
        validDates.push(d)
      }
    }
  }

  // Không còn buổi nào hợp lệ sau khi lọc conflict (trường hợp hiếm)
  if (validDates.length === 0) {
    return NextResponse.json({ error: 'Không thể đặt lịch: tất cả các tuần đều trùng lịch.' }, { status: 400 })
  }

  // Các buổi cùng khóa chia sẻ seriesId (>= 2 buổi mới là khóa)
  const seriesId = validDates.length > 1 ? crypto.randomUUID() : null
  const seriesTotal = seriesId ? validDates.length : null

  // Tạo tất cả buổi trong 1 transaction — đảm bảo tính toàn vẹn của khóa học
  const created = await db.$transaction(
    validDates.map(d =>
      db.booking.create({
        data: {
          studentId: user.id,
          tutorId,
          subjectId,
          mode,
          date: d,
          startTime,
          endTime,
          durationHours,
          status: 'PENDING',
          note,
          address: mode === 'TUTOR_TO_STUDENT' ? address : mode === 'STUDENT_TO_TUTOR' ? tutor.address : null,
          lat: mode === 'STUDENT_TO_TUTOR' ? tutor.lat : lat ?? null,
          lng: mode === 'STUDENT_TO_TUTOR' ? tutor.lng : lng ?? null,
          totalAmount,
          seriesId,
          seriesTotal,
        },
      }),
    ),
  )

  const first = await db.booking.findUnique({
    where: { id: created[0].id },
    include: {
      tutor: { select: { name: true } },
      subject: { select: { name: true } },
    },
  })

  // Mục đích 1 & 2: thông báo cho gia sư ngay khi có yêu cầu mới
  // (rơi vào hội thoại Tin nhắn — gia sư thấy badge chưa đọc)
  await notifyTutorNewBooking({
    tutorId,
    studentId: user.id,
    studentName: user.name,
    subjectName: first?.subject.name ?? 'môn học',
    mode,
    startTime,
    endTime,
    firstDate: date,
    lastDate: created.length > 1 ? created[created.length - 1].date : undefined,
    sessionCount: created.length,
    amountPerSession: totalAmount,
    skippedWeeks: skipped,
  })

  // Phản hồi minh bạch (Mục đích 3): số buổi thật, tổng tiền, các tuần bị bỏ qua + lý do
  return NextResponse.json({
    ...first,
    created: created.length,
    seriesId,
    seriesTotal,
    totalSeriesAmount: totalAmount * created.length,
    skipped,
  })
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  const body = await req.json()
  const { bookingId, status } = body
  if (!bookingId || !status) {
    return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 })
  }

  // P0-1: Hủy lịch phải đi qua /api/bookings/[id]/cancel (kèm lý do + vi phạm)
  if (status === 'CANCELLED') {
    return NextResponse.json(
      { error: 'Vui lòng dùng chức năng hủy lịch (kèm lý do) để ghi nhận vi phạm' },
      { status: 400 },
    )
  }

  const booking = await db.booking.findUnique({ where: { id: bookingId } })
  if (!booking) {
    return NextResponse.json({ error: 'Không tìm thấy lịch đặt' }, { status: 404 })
  }
  if (booking.tutorId !== user.id && booking.studentId !== user.id) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
  }

  const isTutor = booking.tutorId === user.id
  const isStudent = booking.studentId === user.id

  // Tutor: CONFIRM (từ PENDING), COMPLETED (từ CONFIRMED, sau khi buổi học diễn ra)
  // Student: không đổi trạng thái qua PATCH (hủy phải qua /cancel)
  const allowedTutorTransitions = ['CONFIRMED', 'COMPLETED']
  const allowedStudentTransitions: string[] = []

  if (isTutor && !allowedTutorTransitions.includes(status)) {
    return NextResponse.json({ error: 'Gia sư không thể thực hiện thao tác này' }, { status: 403 })
  }
  if (isStudent && !allowedStudentTransitions.includes(status)) {
    return NextResponse.json({ error: 'Học sinh không thể thực hiện thao tác này' }, { status: 403 })
  }

  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    return NextResponse.json({ error: `Không thể thay đổi trạng thái (hiện tại: ${booking.status})` }, { status: 400 })
  }

  // P0-2: COMPLETED chỉ được đánh dấu SAU giờ bắt đầu buổi học (trước đây logic đảo ngược)
  if (status === 'COMPLETED') {
    const classStart = new Date(`${booking.date}T${booking.startTime}`)
    if (classStart.getTime() > Date.now()) {
      return NextResponse.json(
        { error: 'Chưa đến giờ dạy. Chỉ đánh dấu hoàn thành sau khi buổi học đã bắt đầu.' },
        { status: 400 },
      )
    }
  }

  // CONFIRM chỉ hợp lệ khi chưa đến giờ học
  if (status === 'CONFIRMED') {
    const classStart = new Date(`${booking.date}T${booking.startTime}`)
    if (classStart.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Không thể xác nhận buổi học đã qua giờ học' }, { status: 400 })
    }
  }

  const updated = await db.booking.update({
    where: { id: bookingId },
    data: { status },
  })

  // Mục đích 1 & 2: báo cho học sinh biết buổi học đã được xác nhận / hoàn thành
  if (status === 'CONFIRMED' || status === 'COMPLETED') {
    const subject = await db.subject.findUnique({
      where: { id: booking.subjectId },
      select: { name: true },
    })
    if (status === 'CONFIRMED') {
      await notifyStudentConfirmed({
        tutorId: booking.tutorId,
        studentId: booking.studentId,
        tutorName: user.name,
        subjectName: subject?.name ?? 'môn học',
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        amount: booking.totalAmount,
      })
    } else {
      await notifyStudentCompleted({
        tutorId: booking.tutorId,
        studentId: booking.studentId,
        tutorName: user.name,
        subjectName: subject?.name ?? 'môn học',
        date: booking.date,
      })
    }
  }

  return NextResponse.json(updated)
}
