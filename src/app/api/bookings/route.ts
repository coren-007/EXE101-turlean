import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

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
    },
    orderBy: { date: 'desc' },
  })

  return NextResponse.json({ bookings })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }
  if (user.role !== 'STUDENT') {
    return NextResponse.json({ error: 'Chỉ học sinh/phụ huynh mới được đặt lịch' }, { status: 403 })
  }

  const body = await req.json()
  const { tutorId, subjectId, mode, date, startTime, endTime, durationHours, note, address, lat, lng } = body

  if (!tutorId || !subjectId || !mode || !date || !startTime || !endTime) {
    return NextResponse.json({ error: 'Thiếu thông tin đặt lịch' }, { status: 400 })
  }

  // Validate tutor exists and is a tutor
  const tutor = await db.user.findFirst({ where: { id: tutorId, role: 'TUTOR' } })
  if (!tutor) {
    return NextResponse.json({ error: 'Gia sư không tồn tại' }, { status: 400 })
  }

  // Validate mode is supported by tutor
  if (mode === 'TUTOR_TO_STUDENT' && !tutor.teachesAtStudentHome) {
    return NextResponse.json({ error: 'Gia sư không nhận dạy tại nhà học sinh' }, { status: 400 })
  }
  if (mode === 'STUDENT_TO_TUTOR' && !tutor.teachesAtOwnPlace) {
    return NextResponse.json({ error: 'Gia sư không nhận dạy tại cơ sở' }, { status: 400 })
  }

  // Validate tutor teaches this subject
  const ts = await db.tutorSubject.findUnique({
    where: { tutorId_subjectId: { tutorId, subjectId } }
  })
  if (!ts) {
    return NextResponse.json({ error: 'Gia sư không dạy môn này' }, { status: 400 })
  }

  // Validate time is within tutor's availability
  const dayOfWeek = new Date(date).getDay()
  const availabilities = await db.availability.findMany({
    where: { tutorId, dayOfWeek }
  })
  if (availabilities.length === 0) {
    return NextResponse.json({ error: 'Gia sư không có lịch trống vào ngày này' }, { status: 400 })
  }
  // Check if requested time falls within any available slot
  const startOk = availabilities.some(a => startTime >= a.startTime && startTime < a.endTime)
  const endOk = availabilities.some(a => endTime <= a.endTime && endTime > a.startTime)
  if (!startOk || !endOk) {
    return NextResponse.json({ error: 'Giờ đặt không nằm trong lịch trống của gia sư' }, { status: 400 })
  }

  // Check for conflicting bookings (same tutor, same date, overlapping time, not cancelled)
  const conflicting = await db.booking.findFirst({
    where: {
      tutorId,
      date,
      status: { in: ['PENDING', 'CONFIRMED'] },
      AND: [
        { startTime: { lt: endTime } },
        { endTime: { gt: startTime } },
      ],
    },
  })
  if (conflicting) {
    return NextResponse.json({ error: 'Gia sư đã có lịch vào khung giờ này. Vui chọn giờ khác.' }, { status: 400 })
  }

  const totalAmount = Math.round(ts.pricePerHour * (durationHours || 1))

  const booking = await db.booking.create({
    data: {
      studentId: user.id,
      tutorId,
      subjectId,
      mode,
      date,
      startTime,
      endTime,
      durationHours: durationHours || 1,
      status: 'PENDING',
      note,
      address,
      lat,
      lng,
      totalAmount,
    },
    include: {
      tutor: { select: { name: true } },
      subject: { select: { name: true } },
    }
  })

  return NextResponse.json(booking)
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

  const booking = await db.booking.findUnique({ where: { id: bookingId } })
  if (!booking) {
    return NextResponse.json({ error: 'Không tìm thấy lịch đặt' }, { status: 404 })
  }
  // Both tutor and student can update status (but with restrictions)
  if (booking.tutorId !== user.id && booking.studentId !== user.id) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
  }

  // Role-based restrictions on status transitions
  const isTutor = booking.tutorId === user.id
  const isStudent = booking.studentId === user.id

  // Tutor can: CONFIRM (from PENDING), COMPLETED (from CONFIRMED), CANCELLED (decline)
  // Student can: CANCELLED (cancel their own booking, only if PENDING or CONFIRMED and not yet started)
  const allowedTutorTransitions = ['CONFIRMED', 'COMPLETED', 'CANCELLED']
  const allowedStudentTransitions = ['CANCELLED']

  if (isTutor && !allowedTutorTransitions.includes(status)) {
    return NextResponse.json({ error: 'Gia sư không thể thực hiện thao tác này' }, { status: 403 })
  }
  if (isStudent && !allowedStudentTransitions.includes(status)) {
    return NextResponse.json({ error: 'Học sinh chỉ có thể hủy lịch, không thể xác nhận' }, { status: 403 })
  }

  // Don't allow status change if already CANCELLED or COMPLETED
  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    return NextResponse.json({ error: `Không thể thay đổi trạng thái (hiện tại: ${booking.status})` }, { status: 400 })
  }

  // Student cannot cancel after class has started (past date+startTime)
  if (isStudent && status === 'CANCELLED') {
    const classStart = new Date(booking.date + 'T' + booking.startTime)
    if (classStart < new Date()) {
      return NextResponse.json({ error: 'Không thể hủy buổi học đã qua thời gian bắt đầu. Vui lòng liên hệ gia sư.' }, { status: 400 })
    }
  }

  const updated = await db.booking.update({
    where: { id: bookingId },
    data: { status }
  })

  return NextResponse.json(updated)
}
