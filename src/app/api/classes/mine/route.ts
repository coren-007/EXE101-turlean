// GET /api/classes/mine — lớp học cố định của GIA SƯ đang đăng nhập, kèm đầy đủ
// lịch học + danh sách học sinh đăng ký (PENDING chờ duyệt / APPROVED đã vào lớp)
// để quản lý trong Tutor Studio — tab "Lớp học".
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

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
        orderBy: { createdAt: 'desc' },
        include: {
          studentParent: {
            select: { id: true, name: true, avatar: true, phone: true, district: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    classes: classes.map(c => ({
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
    })),
  })
}
