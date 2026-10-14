// DELETE /api/holidays/[id] — xóa ngày nghỉ lễ (gia sư).
// Các buổi đã bị hủy theo ngày lễ này KHÔNG tự khôi phục (gia sư chủ động dời/dạy bù
// từng buổi nếu cần) — sinh buổi mới sau này sẽ không còn bị chặn bởi ngày lễ này.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { formatDate } from '@/lib/format'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được xóa ngày nghỉ lễ' }, { status: 403 })
  }

  const { id } = await params
  const holiday = await db.holiday.findUnique({ where: { id } })
  if (!holiday) return NextResponse.json({ error: 'Không tìm thấy ngày lễ' }, { status: 404 })

  await db.holiday.delete({ where: { id } })
  return NextResponse.json({
    message: `Đã xóa ngày lễ "${holiday.name}" (${formatDate(holiday.date)})`,
  })
}
