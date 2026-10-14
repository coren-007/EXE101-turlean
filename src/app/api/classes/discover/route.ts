// GET /api/classes/discover — tìm kiếm LỚP HỌC CỐ ĐỊNH công khai cho phụ huynh/học sinh
// (trước đây chỉ phát hiện gián tiếp qua hồ sơ gia sư — giờ có tab "Lớp học" trên trang
// tìm kiếm, tương tự tab Experiences của Airbnb).
//
// Filter: q (tên lớp / môn / tên gia sư), city, day (0-6), meetingType, subject (slug),
// sort: next (buổi gần nhất) | fee_asc | fee_desc | seats (còn nhiều chỗ)
// Chỉ trả lớp OPEN đang tuyển, kèm buổi học tới + sĩ số + danh sách chờ.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim().toLowerCase()
  const city = (sp.get('city') ?? '').trim()
  const dayParam = sp.get('day')
  const day = dayParam !== null && dayParam !== '' && !isNaN(Number(dayParam))
    ? Number(dayParam)
    : null
  const meetingType = (sp.get('meetingType') ?? '').trim()
  const subjectSlug = (sp.get('subject') ?? '').trim()
  const sort = sp.get('sort') ?? 'next'

  // Chỉ lớp OPEN đang tuyển + vẫn còn buổi học tương lai
  const classes = await db.groupClass.findMany({
    where: {
      status: 'OPEN',
      subject: subjectSlug ? { slug: subjectSlug } : undefined,
      tutor: {
        role: 'TUTOR',
        ...(city ? { city } : {}),
      },
    },
    include: {
      subject: { select: { id: true, name: true, slug: true, icon: true } },
      schedule: true,
      tutor: {
        select: {
          id: true, name: true, avatar: true, profession: true,
          district: true, city: true, isVerified: true,
        },
      },
      enrollments: { select: { status: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Đánh giá từng gia sư (avg + count) để hiển thị trên card lớp
  const tutorIds = [...new Set(classes.map(c => c.tutorId))]
  const reviewStats = tutorIds.length
    ? await db.review.groupBy({
        by: ['tutorId'],
        where: { tutorId: { in: tutorIds } },
        _avg: { rating: true },
        _count: { rating: true },
      })
    : []
  const ratingByTutor = new Map(reviewStats.map(r => [r.tutorId, {
    avg: r._avg.rating ?? 0,
    count: r._count.rating,
  }]))

  // Buổi học tương lai gần nhất của từng lớp
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const classIds = classes.map(c => c.id)
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

  let result = classes.map(c => {
    const approved = c.enrollments.filter(e => e.status === 'APPROVED').length
    const waitlist = c.enrollments.filter(e => e.status === 'WAITLIST').length
    const rating = ratingByTutor.get(c.tutorId) ?? { avg: 0, count: 0 }
    return {
      id: c.id,
      tutorId: c.tutorId,
      title: c.title,
      subject: c.subject,
      gradeLevel: c.gradeLevel,
      description: c.description,
      meetingType: c.meetingType,
      address: c.address,
      capacity: c.capacity,
      monthlyFee: c.monthlyFee,
      startDate: c.startDate,
      enrollDeadline: c.enrollDeadline,
      deadlinePassed: !!(c.enrollDeadline && c.enrollDeadline < todayStr),
      schedule: c.schedule.map(s => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      enrolledCount: approved,
      remaining: c.capacity - approved,
      waitlistCount: waitlist,
      nextSession: nextByClass.get(c.id) ?? null,
      upcomingCount: upcomingCountByClass.get(c.id) ?? 0,
      tutor: {
        ...c.tutor,
        avgRating: Math.round(rating.avg * 10) / 10,
        reviewCount: rating.count,
      },
    }
  })

  // ===== Filter phía ứng dụng =====
  if (q) {
    result = result.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.subject.name.toLowerCase().includes(q) ||
      c.tutor.name.toLowerCase().includes(q) ||
      (c.tutor.profession ?? '').toLowerCase().includes(q) ||
      (c.gradeLevel ?? '').toLowerCase().includes(q),
    )
  }
  if (day !== null) {
    result = result.filter(c => c.schedule.some(s => s.dayOfWeek === day))
  }
  if (meetingType && ['AT_TUTOR_HOME', 'ONLINE'].includes(meetingType)) {
    result = result.filter(c => c.meetingType === meetingType)
  }

  // Sắp xếp
  switch (sort) {
    case 'fee_asc':
      result.sort((a, b) => (a.monthlyFee ?? Infinity) - (b.monthlyFee ?? Infinity))
      break
    case 'fee_desc':
      result.sort((a, b) => (b.monthlyFee ?? 0) - (a.monthlyFee ?? 0))
      break
    case 'seats':
      result.sort((a, b) => b.remaining - a.remaining)
      break
    default: // 'next' — lớp có buổi tới gần nhất đứng trước, lớp hết buổi xuống cuối
      result.sort((a, b) => {
        const ak = a.nextSession ? a.nextSession.date + a.nextSession.startTime : '9999'
        const bk = b.nextSession ? b.nextSession.date + b.nextSession.startTime : '9999'
        return ak.localeCompare(bk)
      })
  }

  return NextResponse.json({
    classes: result,
    total: result.length,
  })
}
