// GET /api/enrollments/mine — lớp học cố định mà phụ huynh/học sinh đã đăng ký,
// kèm lịch học, sức chứa, trạng thái (chờ duyệt / đã vào lớp / DANH SÁCH CHỜ /
// bị từ chối / đã rút), DANH SÁCH BUỔI HỌC tới + CHUYÊN CẦN của học sinh
// (đã học bao nhiêu buổi, vắng bao nhiêu buổi) và vị trí trong danh sách chờ.
// Dùng cho dashboard "Lớp học nhóm đã đăng ký" + lịch tuần hợp nhất.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'STUDENT') {
    return NextResponse.json({ error: 'Dành cho phụ huynh/học sinh' }, { status: 403 })
  }

  const enrollments = await db.classEnrollment.findMany({
    where: { studentParentId: user.id },
    include: {
      class: {
        include: {
          schedule: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
          subject: { select: { id: true, name: true, slug: true, icon: true } },
          tutor: {
            select: {
              id: true, name: true, avatar: true, profession: true,
              district: true, city: true, address: true, isVerified: true,
            },
          },
          enrollments: { select: { status: true, createdAt: true, studentParentId: true } },
          sessions: {
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
            include: { attendance: true },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return NextResponse.json({
    enrollments: enrollments.map(e => {
      const cls = e.class
      const approved = cls.enrollments.filter(x => x.status === 'APPROVED').length
      const waitlist = cls.enrollments
        .filter(x => x.status === 'WAITLIST')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

      // Buổi tương lai của lớp (hiển thị cho học sinh đã VÀO LỚP)
      const upcomingSessions = cls.sessions
        .filter(s => s.status === 'SCHEDULED' && s.date >= todayStr)
        .map(s => ({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime }))

      // Chuyên cần của TÔI: chỉ tính buổi đã COMPLETED (đã điểm danh)
      const myAttendance = cls.sessions
        .filter(s => s.status === 'COMPLETED')
        .map(s => {
          const mine = s.attendance.find(a => a.studentParentId === user.id)
          return {
            id: s.id,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            status: mine?.status ?? null, // PRESENT | ABSENT | null (chưa điểm danh tôi)
            sessionNote: s.note,
          }
        })
      const present = myAttendance.filter(a => a.status === 'PRESENT').length
      const absent = myAttendance.filter(a => a.status === 'ABSENT').length

      // Vị trí trong danh sách chờ (nếu đang chờ)
      const myWaitlistPosition = e.status === 'WAITLIST'
        ? waitlist.filter(w => w.createdAt <= e.createdAt).length
        : null

      return {
        id: e.id,
        status: e.status,
        studentName: e.studentName,
        note: e.note,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        class: {
          id: cls.id,
          title: cls.title,
          subject: cls.subject,
          gradeLevel: cls.gradeLevel,
          meetingType: cls.meetingType,
          address: cls.address,
          capacity: cls.capacity,
          monthlyFee: cls.monthlyFee,
          status: cls.status,
          startDate: cls.startDate,
          schedule: cls.schedule.map(s => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
          })),
          enrolledCount: approved,
          waitlistCount: waitlist.length,
          nextSession: upcomingSessions[0] ?? null,
          upcomingSessions,
          // Toàn bộ buổi học của lớp (cho lịch tuần hợp nhất dashboard) — không kèm
          // điểm danh của học sinh khác (riêng tư), chỉ ngày/giờ/trạng thái
          sessions: cls.sessions
            .filter(s => s.status !== 'CANCELLED')
            .map(s => ({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, status: s.status })),
          cancelledRecent: cls.sessions
            .filter(s => s.status === 'CANCELLED' && s.date >= todayStr)
            .map(s => ({ id: s.id, date: s.date, startTime: s.startTime, note: s.note })),
          tutor: cls.tutor,
        },
        // Chuyên cần của học sinh này
        attendance: {
          present,
          absent,
          total: present + absent,
          history: myAttendance.slice().reverse(), // mới nhất trước
        },
        myWaitlistPosition,
      }
    }),
  })
}
