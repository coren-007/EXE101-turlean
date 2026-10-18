// src/app/api/tutors/route.ts
// GET /api/tutors — tìm kiếm gia sư
// P1: search case-insensitive (tương thích SQLite & PostgreSQL)
// P1: phân trang (page/pageSize) + trả total
// P1: kèm reliability score cho mỗi gia sư (bulk, tránh N+1)
// P1: tutor chưa có review không bị dồn xuống đáy (điểm khởi đầu 4.5 tạm)
// P5: ids=a,b,c — lấy đúng bộ gia sư theo thứ tự (cho "Xem gần đây" / gợi ý)
// P5: availDay + availSlot — lọc gia sư rảnh theo khung giờ dạy trong tuần
// P5: verified=true — chỉ gia sư đã xác minh
// SẬ-TUT2 (B1): KHÔNG trả `address` (địa chỉ nhà = PII) ở endpoint danh sách
//   công khai này — đã verify bằng request ẩn danh thật. Địa chỉ chính xác chỉ
//   có tại /api/tutors/[id] với điều kiện SẬ-TUT (chính gia sư / booking hoạt
//   động). Danh sách chỉ cần district/city + lat/lng (điểm marker bản đồ,
//   thông lệ Airbnb-style).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { computeReliabilityBulk } from '@/lib/reliability'
import { normalizeVi, normalizeTutorHaystack } from '@/lib/text'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

// SẸ-RL2 (B5, audit bảo mật): route public NẶNG nhất hệ thống — tải toàn bộ
// gia sư + toàn bộ review từng người rồi sort/lọc/phân trang in-memory,
// trước đây KHÔNG có rate limit (suggest nhẹ hơn lại có 60/phút). Kịch bản
// DoS: vòng lặp request liên tục hút CPU/IO. Giờ 60 req/phút/IP — khớp ngưỡng
// suggest, thoải mái cho người dùng thật (đổi filter/chuyển trang liên tục),
// vẫn chặn vòng lặp dò/DoS (1 req/giây liên tục mới chạm hạn).
const TUTORS_RATE_LIMIT = 60
// Hard cap số dòng nạp vào bộ nhớ cho 1 lần tìm (chống phình to khi DB lớn;
// vượt ngưỡng này cần refactor đẩy sort/lọc xuống SQL + aggregate review)
const MAX_LOAD = 1000

// SQLite: contains đã case-insensitive; PostgreSQL: cần mode insensitive
const IS_POSTGRES = (process.env.DATABASE_URL ?? '').startsWith('postgres')

function ci(field: string, q: string): Prisma.StringFilter {
  return IS_POSTGRES ? { contains: q, mode: 'insensitive' } as Prisma.StringFilter : { contains: q } as Prisma.StringFilter
}

// P5: khung giờ trong ngày — so sánh chuỗi "HH:MM" hoạt động đúng theo thứ tự từ điển
const DAY_SLOTS: Record<string, [string, string]> = {
  morning: ['05:00', '11:00'],
  afternoon: ['11:00', '17:00'],
  evening: ['17:00', '22:30'],
}

// P5: chuyển dòng User DB (kèm tutorSubjects + reviews) → DTO trả về client
function toTutorDto(t: {
  id: string
  name: string
  avatar: string | null
  bio: string | null
  profession: string | null
  district: string | null
  city: string | null
  lat: number | null
  lng: number | null
  hourlyRate: number | null
  experienceYears: number | null
  isVerified: boolean
  teachesAtStudentHome: boolean
  teachesAtOwnPlace: boolean
  teachesOnline: boolean
  travelRadiusKm: number | null
  createdAt: Date
  tutorSubjects: { subject: { id: string; name: string; slug: string; category: string; icon: string | null; level: string | null }; pricePerHour: number }[]
  reviewsReceived: { rating: number }[]
}) {
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
    // SẬ-TUT2 (B1): không trả address — xem comment đầu file
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
}

async function withReliabilityList(tutors: any[]) {
  const reliabilityMap = await computeReliabilityBulk(tutors.map(t => t.id))
  return tutors.map(t => {
    const rel = reliabilityMap.get(t.id)
    return {
      ...t,
      reliability: rel
        ? { score: rel.score, tier: rel.tier.key, tierLabel: rel.tier.label, violations: rel.violations }
        : { score: 100, tier: 'EXCELLENT', tierLabel: 'Xuất sắc', violations: 0 },
    }
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // SẸ-RL2 (B5): rate limit route tìm kiếm công khai
  const rl = checkRateLimit(`tutors:${clientIp(req)}`, TUTORS_RATE_LIMIT, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Quá nhiều yêu cầu tìm kiếm trong phút này. Vui lòng thử lại sau ít phút.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  // ===== P5: chế độ lấy theo ids — dùng cho "Xem gần đây" / gợi ý cá nhân hóa =====
  // Giữ đúng thứ tự ids truyền vào (mới xem nhất lên trước), bỏ qua filter/phân trang.
  const idsParam = searchParams.get('ids')
  if (idsParam !== null) {
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 24)
    if (ids.length === 0) {
      return NextResponse.json({ tutors: [], total: 0, page: 1, pageSize: 0, totalPages: 1 })
    }
    const rows = await db.user.findMany({
      where: { id: { in: ids }, role: 'TUTOR' },
      include: {
        tutorSubjects: { include: { subject: true } },
        reviewsReceived: { select: { rating: true } },
      },
    })
    const byId = new Map(rows.map(r => [r.id, r]))
    const ordered = ids.map(id => byId.get(id)).filter((t): t is (typeof rows)[number] => t !== undefined)
    return NextResponse.json({
      tutors: await withReliabilityList(ordered.map(toTutorDto)),
      total: ordered.length,
      page: 1,
      pageSize: ordered.length,
      totalPages: 1,
    })
  }

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

  // P5: lọc khung giờ dạy — availDay (0=CN..6=T7) + availSlot (morning|afternoon|evening)
  // Hai tham số độc lập: chỉ ngày → cả ngày đó; chỉ khung → mọi ngày có khung đó; cả hai → giao nhau.
  const availDayParam = searchParams.get('availDay')
  const availDay = availDayParam !== null && availDayParam !== '' && !Number.isNaN(Number(availDayParam))
    ? Math.trunc(Number(availDayParam))
    : null
  const availSlot = searchParams.get('availSlot')
  const validSlot = availSlot && DAY_SLOTS[availSlot] ? availSlot : null
  const needAvail = availDay !== null || !!validSlot

  // P5: chỉ lấy gia sư đã xác minh
  const verifiedOnly = searchParams.get('verified') === 'true'

  // Build subject filter (only when filtering by subject/category/level)
  const subjectFilter: any = {}
  if (subject) subjectFilter.slug = subject
  if (category) subjectFilter.category = category
  if (level) subjectFilter.level = { in: [level, 'ALL'] }

  const where: Prisma.UserWhereInput = {
    role: 'TUTOR',
    // P4: lọc giá đẩy xuống DB (minPrice hiển thị = hourlyRate vì đã yêu cầu > 0)
    hourlyRate: {
      gt: 0,
      ...(minPrice ? { gte: Number(minPrice) } : {}),
      ...(maxPrice ? { lte: Number(maxPrice) } : {}),
    },
    tutorSubjects: { some: { subject: subjectFilter } },
  }

  // Text search (q): theo tên gia sư, nghề nghiệp, bio, tên môn học — không phân biệt hoa thường
  // (SQL contains). Nếu q KHÔNG dấu tiếng Việt ("toan") thì SQL không khớp "Toán" →
  // fallback JS normalize bên dưới.
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

  // P5: lọc availability xuống DB theo ngày trong tuần
  if (availDay !== null) {
    where.availabilities = { some: { dayOfWeek: availDay } }
  }
  // P5: chỉ gia sư đã xác minh
  if (verifiedOnly) where.isVerified = true

  // whereWithQ = where + điều kiện text search (build SAU khi where đã đủ district/city/mode)
  const whereWithQ: Prisma.UserWhereInput = { ...where }
  if (q) {
    whereWithQ.AND = [
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

  let tutors = await db.user.findMany({
    where: whereWithQ,
    take: MAX_LOAD, // SẸ-RL2 (B5): hard cap chống nạp không giới hạn
    include: {
      tutorSubjects: { include: { subject: true } },
      reviewsReceived: { select: { rating: true } },
      // P5: cần dòng availability khi lọc khung giờ (check chồng lấn giờ phía JS)
      ...(needAvail ? { availabilities: true } : {}),
    },
  })

  // P4: fallback q không dấu tiếng Việt — SQL contains không khớp "toan" ↔ "Toán",
  // nên khi SQL ra 0 kết quả, thử lọc JS sau khi normalize bỏ dấu (như autocomplete)
  if (q && tutors.length === 0) {
    const norm = normalizeVi(q)
    if (norm) {
      const all = await db.user.findMany({
        where,
        take: MAX_LOAD, // SẸ-RL2 (B5)
        include: {
          tutorSubjects: { include: { subject: true } },
          reviewsReceived: { select: { rating: true } },
          ...(needAvail ? { availabilities: true } : {}),
        },
      })
      tutors = all.filter(t => normalizeTutorHaystack(t).includes(norm))
    }
  }

  // P5: lọc khung giờ trong ngày (JS — so chuỗi HH:MM theo thứ tự từ điển)
  if (needAvail) {
    tutors = tutors.filter(t => {
      const rows = (t as any).availabilities || []
      const rowsForDay = availDay !== null ? rows.filter((a: any) => a.dayOfWeek === availDay) : rows
      if (rowsForDay.length === 0) return false
      if (!validSlot) return true
      const [slotStart, slotEnd] = DAY_SLOTS[validSlot]
      // Khung rảnh giao khung giờ yêu cầu: start < slotEnd && end > slotStart
      return rowsForDay.some((a: any) => a.startTime < slotEnd && a.endTime > slotStart)
    })
  }

  // Compute rating and price
  let result = tutors.map(toTutorDto)

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
  return NextResponse.json({
    tutors: await withReliabilityList(paged),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}
