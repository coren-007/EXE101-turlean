// GET /api/admin/users?locked=1 — danh sách tài khoản bị khóa cho admin (P6).
// Tách khỏi /api/admin/stats để phân trang sau này không phải đổi contract.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { computeReliabilityBulk } from '@/lib/reliability'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const lockedOnly = new URL(req.url).searchParams.get('locked') === '1'

  const users = await db.user.findMany({
    where: lockedOnly ? { NOT: { lockedAt: null } } : { role: 'TUTOR' },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      role: true,
      city: true,
      lockedAt: true,
      lockedReason: true,
      isVerified: true,
    },
    orderBy: { lockedAt: 'desc' },
    take: 100,
  })

  // Kèm điểm tin cậy hiện tại để admin quyết định mở khóa có hợp lý không
  const reliability = await computeReliabilityBulk(users.map(u => u.id))

  return NextResponse.json({
    users: users.map(u => ({
      ...u,
      reliabilityScore: reliability.get(u.id)?.score ?? 100,
    })),
  })
}
