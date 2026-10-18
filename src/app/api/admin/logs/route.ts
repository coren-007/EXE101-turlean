// GET /api/admin/logs — nhật ký thao tác quản trị (SẸ-LOG B13).
// Chỉ ADMIN. Phân trang + lọc theo action. meta là JSON string từ client
// tự parse (hoặc dùng trực tiếp khi hiển thị).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') // lọc theo loại (tùy chọn)
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? 50) || 50))

  const where = action ? { action } : {}
  const [total, logs] = await Promise.all([
    db.adminActionLog.count({ where }),
    db.adminActionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        admin: { select: { id: true, name: true, email: true } },
      },
    }),
  ])

  return NextResponse.json({
    logs: logs.map(l => ({
      id: l.id,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      meta: l.meta, // JSON string — client parse khi cần chi tiết
      admin: l.admin ? { id: l.admin.id, name: l.admin.name, email: l.admin.email } : null,
      createdAt: l.createdAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}
