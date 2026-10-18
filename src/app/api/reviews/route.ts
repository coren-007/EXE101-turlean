// POST /api/reviews — học sinh đánh giá buổi học 1-1 đã COMPLETED.
// SẸ-RV (B6, audit bảo mật): trước đây parse req.json() thủ công —
//   · rating dạng chuỗi "5" đi qua check `> 5` (so sánh chuỗi) rồi khiến
//     Prisma throw 500 (đã live-verify HTTP 500)
//   · comment không giới hạn độ dài (nhét MB dữ liệu vào DB được)
// Giờ dùng zod: rating bắt buộc số nguyên 1..5, comment tối đa 1000 ký tự.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const reviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number({ message: 'Điểm phải là số 1–5' })
    .int('Điểm phải là số nguyên 1–5')
    .min(1, 'Điểm thấp nhất là 1')
    .max(5, 'Điểm cao nhất là 5'),
  comment: z.string().trim().max(1000, 'Nhận xét tối đa 1000 ký tự').optional().nullable(),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const parsed = reviewSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const { bookingId, rating, comment } = parsed.data

  const booking = await db.booking.findUnique({ where: { id: bookingId } })
  if (!booking) {
    return NextResponse.json({ error: 'Không tìm thấy buổi học' }, { status: 404 })
  }
  if (booking.studentId !== user.id) {
    return NextResponse.json({ error: 'Chỉ học sinh mới được đánh giá' }, { status: 403 })
  }
  if (booking.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Chỉ đánh giá được buổi học đã hoàn thành' }, { status: 400 })
  }

  const existing = await db.review.findUnique({ where: { bookingId } })
  if (existing) {
    return NextResponse.json({ error: 'Bạn đã đánh giá buổi học này rồi' }, { status: 400 })
  }

  const review = await db.review.create({
    data: {
      tutorId: booking.tutorId,
      studentId: user.id,
      bookingId,
      rating,
      comment: comment ?? null,
    }
  })

  return NextResponse.json(review)
}
