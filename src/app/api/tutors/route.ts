import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const subject = searchParams.get('subject') // slug
  const category = searchParams.get('category')
  const q = searchParams.get('q') // text search
  const district = searchParams.get('district')
  const city = searchParams.get('city')
  const level = searchParams.get('level') // PRIMARY | SECONDARY | HIGH | ALL
  const minPrice = searchParams.get('minPrice')
  const maxPrice = searchParams.get('maxPrice')
  const minRating = searchParams.get('minRating')
  const mode = searchParams.get('mode') // TUTOR_TO_STUDENT | STUDENT_TO_TUTOR
  const userLat = searchParams.get('lat')
  const userLng = searchParams.get('lng')
  const radiusKm = searchParams.get('radius')
  const sort = searchParams.get('sort') || 'rating' // rating | price_asc | price_desc | distance

  // Build subject filter (only when filtering by subject/category/level)
  const subjectFilter: any = {}
  if (subject) subjectFilter.slug = subject
  if (category) subjectFilter.category = category
  if (level) subjectFilter.level = { in: [level, 'ALL'] }

  const where: Prisma.UserWhereInput = {
    role: 'TUTOR',
    // Only show tutors who have at least 1 subject and hourly rate set
    hourlyRate: { gt: 0 },
    // Subject filter (AND): tutor must have at least 1 subject matching all subject criteria
    tutorSubjects: { some: { subject: subjectFilter } },
  }

  // Text search (q): search across tutor name, profession, bio, AND subject name (OR)
  // Combined with subject filter using AND (both must match)
  if (q) {
    where.AND = [
      {
        OR: [
          { name: { contains: q } },
          { profession: { contains: q } },
          { bio: { contains: q } },
          // Also search in subjects the tutor teaches (by name)
          { tutorSubjects: { some: { subject: { name: { contains: q } } } } },
        ],
      },
    ]
  }

  if (district) where.district = district
  if (city) where.city = city

  if (mode === 'TUTOR_TO_STUDENT') {
    where.teachesAtStudentHome = true
  } else if (mode === 'STUDENT_TO_TUTOR') {
    where.teachesAtOwnPlace = true
  }

  let tutors = await db.user.findMany({
    where,
    include: {
      tutorSubjects: { include: { subject: true } },
      reviewsReceived: { select: { rating: true } },
    },
  })

  // Compute rating and price
  let result = tutors.map(t => {
    const reviews = t.reviewsReceived
    const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
    const tutorMinPrice = t.hourlyRate || (t.tutorSubjects[0]?.pricePerHour ?? 0)
    return {
      id: t.id,
      name: t.name,
      avatar: t.avatar,
      bio: t.bio,
      profession: t.profession,
      district: t.district,
      city: t.city,
      address: t.address,
      lat: t.lat,
      lng: t.lng,
      hourlyRate: t.hourlyRate,
      minPrice: tutorMinPrice,
      experienceYears: t.experienceYears,
      isVerified: t.isVerified,
      teachesAtStudentHome: t.teachesAtStudentHome,
      teachesAtOwnPlace: t.teachesAtOwnPlace,
      teachesOnline: t.teachesOnline,
      travelRadiusKm: t.travelRadiusKm,
      subjects: t.tutorSubjects.map(ts => ({
        id: ts.subject.id,
        name: ts.subject.name,
        slug: ts.subject.slug,
        category: ts.subject.category,
        icon: ts.subject.icon,
        level: ts.subject.level,
        pricePerHour: ts.pricePerHour,
      })),
      avgRating: Math.round(avgRating * 10) / 10,
      reviewCount: reviews.length,
    }
  })

  // Apply price filter (after compute minPrice)
  if (minPrice) result = result.filter(t => t.minPrice >= Number(minPrice))
  if (maxPrice) result = result.filter(t => t.minPrice <= Number(maxPrice))
  if (minRating) result = result.filter(t => t.avgRating >= Number(minRating))

  // Apply distance filter and compute distance
  if (userLat && userLng) {
    const lat = Number(userLat)
    const lng = Number(userLng)
    const R = 6371
    result = (result as any[]).map(t => {
      if (!t.lat || !t.lng) return { ...t, distanceKm: null }
      const dLat = (t.lat - lat) * Math.PI / 180
      const dLng = (t.lng - lng) * Math.PI / 180
      const a = Math.sin(dLat/2)**2 + Math.cos(lat*Math.PI/180)*Math.cos(t.lat*Math.PI/180)*Math.sin(dLng/2)**2
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      const distanceKm = Math.round(R * c * 10) / 10
      return { ...t, distanceKm }
    })
    if (radiusKm) {
      result = (result as any[]).filter(t => t.distanceKm !== null && t.distanceKm <= Number(radiusKm))
    }
    // Also filter tutors who can travel to user if mode is TUTOR_TO_STUDENT
    if (mode === 'TUTOR_TO_STUDENT') {
      result = (result as any[]).filter(t => t.travelRadiusKm === null || t.travelRadiusKm === 0 || (t.distanceKm !== null && t.distanceKm <= t.travelRadiusKm))
    }
  } else {
    result = (result as any[]).map(t => ({ ...t, distanceKm: null }))
  }

  // Sort
  const sortResult = result as any[]
  if (sort === 'price_asc') {
    sortResult.sort((a, b) => a.minPrice - b.minPrice)
  } else if (sort === 'price_desc') {
    sortResult.sort((a, b) => b.minPrice - a.minPrice)
  } else if (sort === 'distance' && userLat) {
    sortResult.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
  } else {
    // rating
    sortResult.sort((a, b) => b.avgRating - a.avgRating || b.reviewCount - a.reviewCount)
  }

  return NextResponse.json({ tutors: result, total: result.length })
}
