// GET /api/favorites — danh sách gia sư user đã lưu (đầy đủ fields cho TutorCard)
// POST /api/favorites/toggle { tutorId } → bật/tắt lưu, trả { favorited }
// POST /api/favorites/merge { tutorIds: string[] } — merge wishlist localStorage
//   của guest lên DB sau khi đăng nhập (idempotent, bỏ qua ID không tồn tại)
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

// WHERE dùng chung: gia sư hợp lệ (có hồ sơ dạy)
const tutorWhere = { role: 'TUTOR', hourlyRate: { gt: 0 } }

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const favorites = await db.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      tutor: {
        select: {
          id: true, name: true, avatar: true, bio: true, profession: true,
          district: true, city: true, address: true, lat: true, lng: true,
          hourlyRate: true, experienceYears: true, isVerified: true,
          teachesAtStudentHome: true, teachesAtOwnPlace: true, teachesOnline: true,
          travelRadiusKm: true,
          tutorSubjects: {
            select: {
              pricePerHour: true,
              subject: { select: { id: true, name: true, slug: true, category: true, icon: true, level: true } },
            },
          },
          reviewsReceived: { select: { rating: true } },
        },
      },
    },
  })

  const tutors = favorites
    .filter(f => f.tutor.hourlyRate && f.tutor.hourlyRate > 0)
    .map(f => {
      const t = f.tutor
      const reviews = t.reviewsReceived
      const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
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
        minPrice: t.hourlyRate || (t.tutorSubjects[0]?.pricePerHour ?? 0),
        experienceYears: t.experienceYears,
        isVerified: t.isVerified,
        teachesAtStudentHome: t.teachesAtStudentHome,
        teachesAtOwnPlace: t.teachesAtOwnPlace,
        teachesOnline: t.teachesOnline,
        travelRadiusKm: t.travelRadiusKm,
        subjects: t.tutorSubjects.map(ts => ({
          id: ts.subject.id, name: ts.subject.name, slug: ts.subject.slug,
          category: ts.subject.category, icon: ts.subject.icon, level: ts.subject.level,
          pricePerHour: ts.pricePerHour,
        })),
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount: reviews.length,
        savedAt: f.createdAt,
      }
    })

  return NextResponse.json({ tutors, ids: tutors.map(t => t.id) })
}

const toggleSchema = z.object({ tutorId: z.string().min(1) })
const mergeSchema = z.object({ tutorIds: z.array(z.string().min(1)).max(200) })

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const url = new URL(req.url)
  const action = url.searchParams.get('action') // 'toggle' (mặc định) | 'merge'
  const body = await req.json().catch(() => ({}))

  try {
    if (action === 'merge') {
      const parsed = mergeSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })

      // Merge idempotent — chỉ insert những dòng chưa có; bỏ qua ID không phải gia sư
      // (không dùng createMany skipDuplicates vì SQLite không hỗ trợ)
      const validTutors = await db.user.findMany({
        where: { id: { in: parsed.data.tutorIds }, ...tutorWhere },
        select: { id: true },
      })
      if (validTutors.length === 0) return NextResponse.json({ merged: 0 })

      const existing = await db.favorite.findMany({
        where: { userId: user.id, tutorId: { in: validTutors.map(t => t.id) } },
        select: { tutorId: true },
      })
      const existingIds = new Set(existing.map(e => e.tutorId))
      const toCreate = validTutors.filter(t => !existingIds.has(t.id))
      if (toCreate.length > 0) {
        await db.favorite.createMany({
          data: toCreate.map(t => ({ userId: user.id, tutorId: t.id })),
        })
      }
      return NextResponse.json({ merged: toCreate.length })
    }

    const parsed = toggleSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })

    const tutor = await db.user.findFirst({
      where: { id: parsed.data.tutorId, ...tutorWhere },
      select: { id: true },
    })
    if (!tutor) return NextResponse.json({ error: 'Không tìm thấy gia sư' }, { status: 404 })

    const existing = await db.favorite.findUnique({
      where: { userId_tutorId: { userId: user.id, tutorId: tutor.id } },
    })
    if (existing) {
      await db.favorite.delete({ where: { id: existing.id } })
      return NextResponse.json({ favorited: false })
    }
    await db.favorite.create({ data: { userId: user.id, tutorId: tutor.id } })
    return NextResponse.json({ favorited: true })
  } catch {
    return NextResponse.json({ error: 'Có lỗi khi cập nhật danh sách lưu' }, { status: 500 })
  }
}
