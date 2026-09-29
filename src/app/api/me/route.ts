import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

// P1: validate dữ liệu cập nhật profile — chặn học phí âm, năm KN vô lý...
const patchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().regex(/^[0-9+\s.-]{8,15}$/, 'Số điện thoại không hợp lệ').optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  district: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  profession: z.string().max(150).optional().nullable(),
  experienceYears: z.number().int().min(0).max(60).optional().nullable(),
  education: z.string().max(300).optional().nullable(),
  hourlyRate: z.number().int().min(20000).max(5000000).optional().nullable(),
  teachesAtStudentHome: z.boolean().optional(),
  teachesAtOwnPlace: z.boolean().optional(),
  teachesOnline: z.boolean().optional(),
  travelRadiusKm: z.number().int().min(1).max(50).optional().nullable(),
})

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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const data = parsed.data

  const updated = await db.user.update({
    where: { id: user.id },
    data,
  })

  return NextResponse.json({ ok: true, user: { id: updated.id, name: updated.name, role: updated.role } })
}
