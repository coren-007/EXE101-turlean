// GET /api/users/me/violations — lịch sử vi phạm & điểm tin cậy của chính mình (P0-1)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { computeReliability } from '@/lib/reliability'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const reliability = await computeReliability(user.id)

  const cancellations = await db.cancellation.findMany({
    where: { booking: { OR: [{ tutorId: user.id }, { studentId: user.id }] } },
    include: {
      booking: {
        select: {
          id: true,
          tutorId: true,
          studentId: true,
          date: true,
          startTime: true,
          endTime: true,
          subject: { select: { name: true } },
          tutor: { select: { name: true } },
          student: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Chỉ hiển thị các lần hủy do chính user này thực hiện
  const own = cancellations.filter(c => {
    const isTutorSide = c.booking.tutorId === user.id
    if (isTutorSide) {
      // tutor chỉ thấy các lần hủy do tutor (mình) hủy trên booking mình là gia sư
      return c.cancelledBy === 'TUTOR'
    }
    return c.cancelledBy === 'STUDENT'
  })

  return NextResponse.json({
    reliability,
    violations: own.map(c => {
      const isTutorSide = c.booking.tutorId === user.id
      return {
        id: c.id,
        severity: c.severity,
        points: c.points,
        reason: c.reason,
        hoursBefore: c.hoursBefore,
        createdAt: c.createdAt,
        subject: c.booking.subject.name,
        // Bên đối tác của buổi học bị hủy
        counterpart: isTutorSide ? c.booking.student.name : c.booking.tutor.name,
        date: c.booking.date,
        startTime: c.booking.startTime,
        endTime: c.booking.endTime,
      }
    }),
  })
}
