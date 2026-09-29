// GET /api/tutors — tìm kiếm gia sư
// P1: search case-insensitive (tương thích SQLite & PostgreSQL)
// P1: phân trang (page/pageSize) + trả total
// P1: kèm reliability score cho mỗi gia sư (bulk, tránh N+1)
// P1: tutor chưa có review không bị dồn xuống đáy (điểm khởi đầu 4.5 tạm)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { computeReliabilityBulk } from '@/lib/reliability'

// SQLite: contains đã case-insensitive; PostgreSQL: cần mode insensitive
const IS_POSTGRES = (process.env.DATABASE_URL ?? '').startsWith('postgres')

function ci(field: string, q: string): Prisma.StringFilter {
  return IS_POSTGRES ? { contains: q, mode: 'insensitive' } as Prisma.StringFilter : { contains: q } as Prisma.StringFilter
}

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
  const mode = searchParams.get('mode') // TUTOR_TO_STUDENT | STUDENT_TO_TUTOR | ONLINE
  const userLat = searchParams.get('lat')
  const userLng = searchParams.get('lng')
  const radiusKm = searchParams.get('radius')
  const sort = searchParams.get('sort') || 'rating' // rating | price_asc | price_desc | distance | newest
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? 20) || 20))

  // Build subject filter (only when filtering by subject/category/level)
  const subjectFilter: any = {}
  if (subject) subjectFilter.slug = subject
  if (category) subjectFilter.category = category
  if (level) subjectFilter.level = { in: [level, 'ALL'] }

  const where: Prisma.UserWhereInput = {
    role: 'TUTOR',
    hourlyRate: { gt: 0 },
    tutorSubjects: { some: { subject: subjectFilter } },
  }

  // Text search (q): theo tên gia sư, nghề nghiệp, bio, tên môn học — không phân biệt hoa thường
  if (q) {
    where.AND = [
      {
        OR: [
          { name: ci('name', q) },
          { profession: ci('profession', q) },
          { bio: ci('bio', q) },
          { tutorSubjects: { some: { subject: { name: ci('name', q) } } } },
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
  } else if (mode === 'ONLINE') {
    // P1: filter gia sư dạy trực tuyến
    where.teachesOnline = true
  }

  const tutors = await db.user.findMany({
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
      createdAt: t.createdAt,
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
    if (mode === 'TUTOR_TO_STUDENT') {
      result = (result as any[]).filter(t => t.travelRadiusKm === null || t.travelRadiusKm === 0 || (t.distanceKm !== null && t.distanceKm <= t.travelRadiusKm))
    }
  } else {
    result = (result as any[]).map(t => ({ ...t, distanceKm: null }))
  }

  // Sort — P1: 'newest' cho tutor mới; rating sort không dồn tutor 0-review xuống đáy
  const sortResult = result as any[]
  if (sort === 'price_asc') {
    sortResult.sort((a, b) => a.minPrice - b.minPrice)
  } else if (sort === 'price_desc') {
    sortResult.sort((a, b) => b.minPrice - a.minPrice)
  } else if (sort === 'distance' && userLat) {
    sortResult.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
  } else if (sort === 'newest') {
    sortResult.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } else {
    // rating: tutor có >=3 review xếp theo điểm thật;
    // tutor ít/0 review dùng điểm khởi đầu 4.5 — không bị dồn xuống đáy (cold-start)
    const effective = (t: any) => (t.reviewCount >= 3 ? t.avgRating : 4.5)
    sortResult.sort((a, b) => effective(b) - effective(a) || b.reviewCount - a.reviewCount)
  }

  const total = sortResult.length

  // P1: phân trang
  const paged = sortResult.slice((page - 1) * pageSize, page * pageSize)

  // P1: reliability bulk cho các tutor trong trang hiện tại
  const reliabilityMap = await computeReliabilityBulk(paged.map(t => t.id))
  const withReliability = paged.map(t => {
    const rel = reliabilityMap.get(t.id)
    return {
      ...t,
      reliability: rel
        ? { score: rel.score, tier: rel.tier.key, tierLabel: rel.tier.label, violations: rel.violations }
        : { score: 100, tier: 'EXCELLENT', tierLabel: 'Xuất sắc', violations: 0 },
    }
  })

  return NextResponse.json({
    tutors: withReliability,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}
