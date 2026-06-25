import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// GET - list current tutor's subjects
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Chỉ gia sư mới truy cập được' }, { status: 403 })

  const subjects = await db.tutorSubject.findMany({
    where: { tutorId: user.id },
    include: { subject: true },
    orderBy: { subject: { name: 'asc' } },
  })
  return NextResponse.json({ subjects })
}

// POST - add a subject to current tutor's profile
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Chỉ gia sư mới thêm được môn' }, { status: 403 })

  const { subjectId, pricePerHour, description } = await req.json()
  if (!subjectId || !pricePerHour || pricePerHour < 50000) {
    return NextResponse.json({ error: 'Thông tin không hợp lệ. Giá tối thiểu 50.000đ' }, { status: 400 })
  }

  // Check subject exists
  const subject = await db.subject.findUnique({ where: { id: subjectId } })
  if (!subject) return NextResponse.json({ error: 'Môn học không tồn tại' }, { status: 400 })

  // Check if already teaching
  const existing = await db.tutorSubject.findUnique({
    where: { tutorId_subjectId: { tutorId: user.id, subjectId } }
  })
  if (existing) return NextResponse.json({ error: 'Bạn đã thêm môn này rồi' }, { status: 400 })

  const ts = await db.tutorSubject.create({
    data: { tutorId: user.id, subjectId, pricePerHour, description },
    include: { subject: true },
  })

  // Update hourlyRate to match lowest subject price if not set
  if (!user.hourlyRate) {
    await db.user.update({ where: { id: user.id }, data: { hourlyRate: pricePerHour } })
  } else {
    // Ensure hourlyRate is min of all subject prices
    const allSubjects = await db.tutorSubject.findMany({ where: { tutorId: user.id }, select: { pricePerHour: true } })
    const minPrice = Math.min(...allSubjects.map(s => s.pricePerHour))
    await db.user.update({ where: { id: user.id }, data: { hourlyRate: minPrice } })
  }

  return NextResponse.json(ts)
}
