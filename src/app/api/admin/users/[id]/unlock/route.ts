// POST /api/admin/users/[id]/unlock — admin mở khóa tài khoản bị tự khóa (P6).
// Lưu ý: mở khóa KHÔNG reset điểm tin cậy — điểm vẫn như cũ cho tới khi
// tích lũy dần (hoặc không bao giờ phục hồi nếu tiếp tục hủy sát giờ).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const { id } = await params

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, lockedAt: true, lockedReason: true },
  })
  if (!target) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 })
  if (!target.lockedAt) {
    return NextResponse.json({ error: 'Tài khoản này không bị khóa' }, { status: 400 })
  }
  if (target.id === user.id) {
    return NextResponse.json({ error: 'Không thể tự mở khóa chính mình' }, { status: 400 })
  }

  // SẸ-LOG (B13): mở khóa + ghi nhật ký trong cùng transaction — trước đây
  // unlock hoàn toàn VÔ DANH (verification có reviewedById nhưng unlock không ai ghi)
  const unlocked = await db.$transaction(async tx => {
    await tx.user.update({
      where: { id },
      data: { lockedAt: null, lockedReason: null },
    })
    await tx.adminActionLog.create({
      data: {
        adminId: user.id,
        action: 'UNLOCK_ACCOUNT',
        targetType: 'USER',
        targetId: id,
        meta: JSON.stringify({
          targetName: target.name,
          targetRole: target.role,
          previousLockedReason: target.lockedReason,
          reliabilityKept: true, // mở khóa KHÔNG reset điểm tin cậy
        }),
      },
    })
    return true
  })
  if (!unlocked) return NextResponse.json({ error: 'Không mở khóa được' }, { status: 500 })

  return NextResponse.json({
    message: `Đã mở khóa tài khoản ${target.name} — điểm tin cậy được giữ nguyên.`,
  })
}
