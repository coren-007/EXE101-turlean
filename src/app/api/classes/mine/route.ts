// GET /api/classes/mine — lớp học cố định của GIA SƯ đang đăng nhập, kèm đầy đủ
// lịch học, danh sách học sinh đăng ký (PENDING chờ duyệt / APPROVED đã vào lớp /
// WAITLIST danh sách chờ) và DANH SÁCH BUỔI HỌC (ClassSession + điểm danh) để quản
// lý trong Tutor Studio — tab "Lớp học".
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { ensureRollingSessions } from '@/lib/class-sessions'

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classes = await db.groupClass.findMany({
    where: { tutorId: user.id },
    include: {
      subject: { select: { id: true, name: true, slug: true, icon: true } },
      schedule: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      enrollments: {
        orderBy: { createdAt: 'asc' },
        include: {
          studentParent: {
            select: { id: true, name: true, avatar: true, phone: true, district: true },
          },
        },
      },
      sessions: {
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        include: { attendance: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Rolling schedule: lớp nào sắp hết buổi tương lai → tự gia hạn 12 tuần
  for (const c of classes) {
    if (c.status !== 'CLOSED') {
      await ensureRollingSessions(c.id).catch(() => {})
    }
  }
  // Refetch sau khi có thể gia hạn (hiếm khi xảy ra — chỉ khi lớp cũ lâu không mở)
  let fresh = classes
  const extendedAny = classes.some(c => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return c.status !== 'CLOSED' && c.sessions.filter(s => s.status === 'SCHEDULED' && s.date >= todayStr).length < 4
  })
  if (extendedAny) {
    fresh = await db.groupClass.findMany({
      where: { tutorId: user.id },
      include: {
        subject: { select: { id: true, name: true, slug: true, icon: true } },
        schedule: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        enrollments: {
          orderBy: { createdAt: 'asc' },
          include: {
            studentParent: {
              select: { id: true, name: true, avatar: true, phone: true, district: true },
            },
          },
        },
        sessions: {
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
          include: { attendance: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return NextResponse.json({
    classes: (fresh ?? classes).map(c => {
      const upcoming = c.sessions.filter(s => s.status === 'SCHEDULED' && s.date >= todayStr)
      return {
        id: c.id,
        title: c.title,
        subject: c.subject,
        gradeLevel: c.gradeLevel,
        description: c.description,
        meetingType: c.meetingType,
        address: c.address,
        capacity: c.capacity,
        monthlyFee: c.monthlyFee,
        status: c.status,
        startDate: c.startDate,
        schedule: c.schedule.map(s => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        enrollments: c.enrollments.map(e => ({
          id: e.id,
          status: e.status,
          studentName: e.studentName,
          note: e.note,
          createdAt: e.createdAt,
          parent: e.studentParent,
        })),
        sessions: c.sessions.map(s => ({
          id: s.id,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.status,
          note: s.note,
          attendance: s.attendance.map(a => ({
            studentParentId: a.studentParentId,
            status: a.status,
            markedAt: a.markedAt,
          })),
        })),
        // Thống kê nhanh cho panel
        stats: {
          upcomingCount: upcoming.length,
          nextSession: upcoming[0]
            ? { date: upcoming[0].date, startTime: upcoming[0].startTime, endTime: upcoming[0].endTime }
            : null,
          completedCount: c.sessions.filter(s => s.status === 'COMPLETED').length,
          cancelledCount: c.sessions.filter(s => s.status === 'CANCELLED').length,
        },
      }
    }),
  })
}
