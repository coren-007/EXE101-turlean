// POST /api/admin/users/[id]/lock — admin KHÓA TAY tài khoản (bổ sung cho auto-lock P6).
//
// Use case: gia sư điểm 35 (chưa chạm ngưỡng tự khóa 30) nhưng có hành vi
// nghiêm trọng (hồ sơ lừa dối, quấy rối qua tin nhắn, yêu cầu thanh toán ngoài
// nền tảng...) — admin can thiệp ngay thay vì đợi thêm lần hủy nữa.
//
// Đối xứng với route unlock: cùng bộ guard (không khóa chính mình, không khóa
// admin khác), cùng ghi AdminActionLog (B13) trong 1 transaction.
// lockedReason có tiền tố "[Admin khóa]" để phân biệt với lý do tự khóa theo điểm.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const lockSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Lý do khóa phải có ít nhất 5 ký tự')
    .max(500, 'Lý do khóa tối đa 500 ký tự'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const parsed = lockSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, lockedAt: true, lockedReason: true },
  })
  if (!target) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 })
  if (target.id === user.id) {
    return NextResponse.json({ error: 'Không thể tự khóa chính mình' }, { status: 400 })
  }
  if (target.role === 'ADMIN') {
    return NextResponse.json(
      { error: 'Không thể khóa tài khoản quản trị viên' },
      { status: 400 },
    )
  }
  if (target.lockedAt) {
    return NextResponse.json({ error: 'Tài khoản này đã bị khóa' }, { status: 400 })
  }

  const lockedReason = `[Admin khóa] ${parsed.data.reason}`

  // SẸ-LOG (B13): khóa + ghi nhật ký trong cùng transaction — mọi thao tác
  // ảnh hưởng truy cập tài khoản đều phải truy vết được người thao tác.
  await db.$transaction([
    db.user.update({
      where: { id },
      data: { lockedAt: new Date(), lockedReason },
    }),
    db.adminActionLog.create({
      data: {
        adminId: user.id,
        action: 'LOCK_ACCOUNT',
        targetType: 'USER',
        targetId: id,
        meta: JSON.stringify({
          targetName: target.name,
          targetRole: target.role,
          reason: parsed.data.reason,
          manual: true,
        }),
      },
    }),
  ])

  return NextResponse.json({
    message: `Đã khóa tài khoản ${target.name}. Họ sẽ không đăng nhập được cho tới khi được mở khóa.`,
    lockedReason,
  })
}
