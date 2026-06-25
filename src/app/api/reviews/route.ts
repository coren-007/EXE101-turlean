import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  const { bookingId, rating, comment } = await req.json()
  if (!bookingId || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Thông tin không hợp lệ' }, { status: 400 })
  }

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
      comment,
    }
  })

  return NextResponse.json(review)
}
