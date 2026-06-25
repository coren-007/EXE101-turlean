import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ user: null })
  }

  // For tutors, include rating stats
  let stats: { reviewCount: number; avgRating: number } | null = null
  if (user.role === 'TUTOR') {
    const reviews = await db.review.findMany({
      where: { tutorId: user.id },
      select: { rating: true }
    })
    const avgRating = reviews.length
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0
    stats = {
      reviewCount: reviews.length,
      avgRating: Math.round(avgRating * 10) / 10,
    }
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      district: user.district,
      city: user.city,
      address: user.address,
      lat: user.lat,
      lng: user.lng,
      profession: user.profession,
      experienceYears: user.experienceYears,
      education: user.education,
      hourlyRate: user.hourlyRate,
      isVerified: user.isVerified,
      teachesAtStudentHome: user.teachesAtStudentHome,
      teachesAtOwnPlace: user.teachesAtOwnPlace,
      teachesOnline: user.teachesOnline,
      travelRadiusKm: user.travelRadiusKm,
    },
    stats
  })
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  const body = await req.json()
  const allowed = [
    'name', 'phone', 'bio', 'district', 'city', 'address', 'lat', 'lng',
    'profession', 'experienceYears', 'education', 'hourlyRate',
    'teachesAtStudentHome', 'teachesAtOwnPlace', 'teachesOnline', 'travelRadiusKm'
  ]

  const data: any = {}
  for (const k of allowed) {
    if (body[k] !== undefined) data[k] = body[k]
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data
  })

  return NextResponse.json({ ok: true, user: { id: updated.id, name: updated.name, role: updated.role } })
}
