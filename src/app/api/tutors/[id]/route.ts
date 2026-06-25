import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const tutor = await db.user.findFirst({
    where: { id, role: 'TUTOR' },
    include: {
      tutorSubjects: { include: { subject: true } },
      reviewsReceived: {
        include: { student: { select: { name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      availabilities: { orderBy: { dayOfWeek: 'asc' } },
    },
  })

  if (!tutor) {
    return NextResponse.json({ error: 'Không tìm thấy gia sư' }, { status: 404 })
  }

  const reviews = tutor.reviewsReceived
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0

  return NextResponse.json({
    id: tutor.id,
    name: tutor.name,
    email: tutor.email,
    avatar: tutor.avatar,
    bio: tutor.bio,
    profession: tutor.profession,
    experienceYears: tutor.experienceYears,
    education: tutor.education,
    hourlyRate: tutor.hourlyRate,
    isVerified: tutor.isVerified,
    phone: tutor.phone,
    district: tutor.district,
    city: tutor.city,
    address: tutor.address,
    lat: tutor.lat,
    lng: tutor.lng,
    teachesAtStudentHome: tutor.teachesAtStudentHome,
    teachesAtOwnPlace: tutor.teachesAtOwnPlace,
    teachesOnline: tutor.teachesOnline,
    travelRadiusKm: tutor.travelRadiusKm,
    subjects: tutor.tutorSubjects.map(ts => ({
      id: ts.subject.id,
      name: ts.subject.name,
      slug: ts.subject.slug,
      category: ts.subject.category,
      icon: ts.subject.icon,
      pricePerHour: ts.pricePerHour,
      description: ts.description,
    })),
    availabilities: tutor.availabilities,
    avgRating: Math.round(avgRating * 10) / 10,
    reviewCount: reviews.length,
    reviews: reviews.map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      studentName: r.student.name,
      studentAvatar: r.student.avatar,
    })),
  })
}
