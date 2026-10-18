// GET /api/admin/stats — tổng quan trang quản trị (P6).
// Chỉ ADMIN. Gom số liệu 1 request để dashboard render ngay.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { computeReliabilityBulk } from '@/lib/reliability'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const [
    tutorCount,
    studentCount,
    verifiedTutors,
    pendingRequests,
    approvedRequests,
    rejectedRequests,
    lockedAccounts,
    bookingCount,
    reviewCount,
    classCount,
  ] = await Promise.all([
    db.user.count({ where: { role: 'TUTOR' } }),
    db.user.count({ where: { role: 'STUDENT' } }),
    db.user.count({ where: { role: 'TUTOR', isVerified: true } }),
    db.verificationRequest.count({ where: { status: 'PENDING' } }),
    db.verificationRequest.count({ where: { status: 'APPROVED' } }),
    db.verificationRequest.count({ where: { status: 'REJECTED' } }),
    db.user.count({ where: { NOT: { lockedAt: null } } }),
    db.booking.count(),
    db.review.count(),
    db.groupClass.count(),
  ])

  const bookingByStatus = await db.booking.groupBy({ by: ['status'], _count: true })
  const statusMap: Record<string, number> = {}
  for (const row of bookingByStatus) statusMap[row.status] = row._count

  // Gia sư cần theo dõi: điểm tin cậy < 70 — hiện bảng "cần chú ý"
  const tutors = await db.user.findMany({
    where: { role: 'TUTOR' },
    select: { id: true, name: true, avatar: true, isVerified: true, lockedAt: true, city: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const reliability = await computeReliabilityBulk(tutors.map(t => t.id))
  const watchlist = tutors
    .map(t => ({
      id: t.id,
      name: t.name,
      avatar: t.avatar,
      city: t.city,
      isVerified: t.isVerified,
      locked: !!t.lockedAt,
      score: reliability.get(t.id)?.score ?? 100,
      violations: reliability.get(t.id)?.violations ?? 0,
      cancellations: reliability.get(t.id)?.totalCancellations ?? 0,
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)

  return NextResponse.json({
    totals: {
      tutors: tutorCount,
      students: studentCount,
      verifiedTutors,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      lockedAccounts,
      bookings: bookingCount,
      reviews: reviewCount,
      classes: classCount,
    },
    bookingByStatus: statusMap,
    watchlist,
  })
}
