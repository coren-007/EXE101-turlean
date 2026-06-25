import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [subjects, availability, reviews, bookings] = await Promise.all([
    db.tutorSubject.count({ where: { tutorId: user.id } }),
    db.availability.count({ where: { tutorId: user.id } }),
    db.review.findMany({ where: { tutorId: user.id }, select: { rating: true } }),
    db.booking.findMany({
      where: { tutorId: user.id, status: 'COMPLETED' },
      select: { totalAmount: true, durationHours: true, studentId: true },
    }),
  ])

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0

  const totalEarnings = bookings.reduce((s, b) => s + b.totalAmount, 0)
  const totalHours = bookings.reduce((s, b) => s + (b.durationHours || 1), 0)
  const uniqueStudents = new Set(bookings.map(b => b.studentId)).size

  // Profile completeness
  const checks = {
    hasBio: !!user.bio && user.bio.length > 20,
    hasProfession: !!user.profession,
    hasEducation: !!user.education,
    hasPhoto: false, // Avatar not currently supported
    hasHourlyRate: !!user.hourlyRate,
    hasSubjects: subjects > 0,
    hasAvailability: availability > 0,
    hasTeachingMode: user.teachesAtStudentHome || user.teachesAtOwnPlace || user.teachesOnline,
    hasLocation: !!user.district && user.lat != null,
  }
  const completedCount = Object.values(checks).filter(Boolean).length
  const totalCount = Object.keys(checks).length
  const completeness = Math.round((completedCount / totalCount) * 100)

  return NextResponse.json({
    stats: {
      subjectCount: subjects,
      availabilityCount: availability,
      reviewCount: reviews.length,
      avgRating: Math.round(avgRating * 10) / 10,
      totalEarnings,
      totalHours,
      uniqueStudents,
      totalBookings: bookings.length,
    },
    completeness: {
      percent: completeness,
      checks,
      missing: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    },
  })
}
