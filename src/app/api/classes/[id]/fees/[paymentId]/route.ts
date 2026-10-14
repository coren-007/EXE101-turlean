// DELETE /api/classes/[id]/fees/[paymentId] — xóa 1 dòng ghi nhận học phí (ghi nhầm).
// Không gửi thông báo — đây là thao tác sửa sổ nội bộ của gia sư.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được xóa dòng học phí' }, { status: 403 })
  }

  const { id, paymentId } = await params
  const payment = await db.classFeePayment.findUnique({
    where: { id: paymentId },
    include: { class: { select: { tutorId: true, title: true } } },
  })
  if (!payment || payment.classId !== id) {
    return NextResponse.json({ error: 'Không tìm thấy dòng học phí' }, { status: 404 })
  }
  if (payment.class.tutorId !== user.id) {
    return NextResponse.json({ error: 'Bạn không phải chủ lớp này' }, { status: 403 })
  }

  await db.classFeePayment.delete({ where: { id: paymentId } })
  return NextResponse.json({
    message: `Đã xóa dòng học phí tháng ${payment.period.slice(5)}/${payment.period.slice(0, 4)} của lớp "${payment.class.title}"`,
  })
}
