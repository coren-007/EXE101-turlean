// GET /api/enrollments/mine — lớp học cố định mà phụ huynh/học sinh đã đăng ký,
// kèm lịch học, sức chứa và trạng thái (chờ duyệt / đã vào lớp / bị từ chối / đã rút).
// Dùng cho dashboard "Lớp học nhóm đã đăng ký".
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
          enrollments: { select: { status: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({
    enrollments: enrollments.map(e => ({
      id: e.id,
      status: e.status,
      studentName: e.studentName,
      note: e.note,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      class: {
        id: e.class.id,
        title: e.class.title,
        subject: e.class.subject,
        gradeLevel: e.class.gradeLevel,
        meetingType: e.class.meetingType,
        address: e.class.address,
        capacity: e.class.capacity,
        monthlyFee: e.class.monthlyFee,
        status: e.class.status,
        startDate: e.class.startDate,
        schedule: e.class.schedule.map(s => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        enrolledCount: e.class.enrollments.filter(x => x.status === 'APPROVED').length,
        tutor: e.class.tutor,
      },
    })),
  })
}
