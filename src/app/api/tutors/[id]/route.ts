// GET /api/tutors/[id] — hồ sơ công khai của gia sư
// P0-3: KHÔNG trả email/phone ra public. SĐT chỉ trả khi người xem
// là học sinh có booking CONFIRMED/COMPLETED với gia sư này.
// P0-2: avgRating tính từ TOÀN BỘ review (trước đây chỉ lấy 20 review mới nhất).
// P0-1: kèm reliability score công khai.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { computeReliability } from '@/lib/reliability'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tutor = await db.user.findFirst({
    where: { id, role: 'TUTOR' },
    include: {
      tutorSubjects: { include: { subject: true } },
      reviewsReceived: {
        include: { student: { select: { name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20, // chỉ dùng cho hiển thị danh sách — avgRating tính riêng bên dưới
      },
      availabilities: { orderBy: { dayOfWeek: 'asc' } },
    },
  })

  if (!tutor) {
    return NextResponse.json({ error: 'Không tìm thấy gia sư' }, { status: 404 })
  }

  // P0-2: điểm đánh giá trung bình từ TẤT CẢ review (aggregate riêng)
  const reviewAgg = await db.review.aggregate({
    where: { tutorId: id },
    _avg: { rating: true },
    _count: { _all: true },
  })
  const avgRating = reviewAgg._avg.rating ?? 0
  const reviewCount = reviewAgg._count._all

  // P0-1: reliability score
  const reliability = await computeReliability(id)

  // P0-3: chỉ cấp SĐT cho học sinh có booking đang hoạt động với gia sư này
  const viewer = await getCurrentUser()
  let phone: string | null = null
  if (viewer && viewer.role === 'STUDENT' && viewer.id !== id) {
    const activeBooking = await db.booking.findFirst({
      where: {
        studentId: viewer.id,
        tutorId: id,
        status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED'] },
      },
      select: { id: true },
    })
    if (activeBooking) phone = tutor.phone
  }

  // Lịch bận theo NGÀY CỤ THỂ trong 8 tuần tới (PENDING/CONFIRMED):
  // để dialog đặt lịch vô hiệu hóa đúng giờ đã có người đặt trên nền tảng
  // (lớp học cố định theo tuần được trả riêng qua /api/classes).
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const busySlots = await db.booking.findMany({
    where: {
      tutorId: id,
      date: { gte: todayStr },
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    select: { date: true, startTime: true, endTime: true, subjectId: true },
    orderBy: { date: 'asc' },
    take: 300,
  })

  return NextResponse.json({
    id: tutor.id,
    name: tutor.name,
    // P0-3: email đã bị loại khỏi response public
    avatar: tutor.avatar,
    bio: tutor.bio,
    profession: tutor.profession,
    experienceYears: tutor.experienceYears,
    education: tutor.education,
    hourlyRate: tutor.hourlyRate,
    isVerified: tutor.isVerified,
    phone, // null nếu chưa có booking hoạt động
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
    // Lịch bận theo ngày cụ thể (đã có lớp trên nền tảng)
    busySlots: busySlots.map(b => ({ date: b.date, startTime: b.startTime, endTime: b.endTime })),
    avgRating: Math.round(avgRating * 10) / 10,
    reviewCount,
    reliability,
    reviews: tutor.reviewsReceived.map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      studentName: r.student.name,
      studentAvatar: r.student.avatar,
    })),
  })
}
