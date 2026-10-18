// POST /api/admin/users/lock-sweep — rà soát toàn hệ thống, đảm bảo bất biến
// "điểm tin cậy < 30 ⇒ tài khoản bị khóa" (P6).
//
// Auto-lock bình thường chỉ chạy ngay sau mỗi lần hủy booking (nơi duy nhất
// trừ điểm). Nếu điểm rơi dưới ngưỡng qua con đường khác — dữ liệu lịch sử
// trước khi có auto-lock, nhập/chỉnh dữ liệu trực tiếp, khôi phục backup —
// thì sweep này vá lại bất biến đó trong 1 lần bấm.
//
// Idempotent: chạy bao nhiêu lần cũng cho cùng kết quả (user đã khóa thì bỏ qua).
// KHÔNG đụng tới tài khoản ADMIN và tài khoản đã bị khóa (kể cả khóa tay).
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { computeReliabilityBulk, LOCK_THRESHOLD } from '@/lib/reliability'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  // Chỉ rà TUTOR + STUDENT chưa bị khóa (admin và user đã khóa đều không đổi)
  const users = await db.user.findMany({
    where: { role: { in: ['TUTOR', 'STUDENT'] }, lockedAt: null },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })

  const reliability = await computeReliabilityBulk(users.map(u => u.id))
  const toLock = users
    .map(u => ({ ...u, score: reliability.get(u.id)?.score ?? 100 }))
    .filter(u => u.score < LOCK_THRESHOLD)

  if (toLock.length > 0) {
    // SẸ-LOG (B13): chỉ ghi nhật ký khi sweep THỰC SỰ khóa ai — chạy định kỳ
    // mà không khóa ai thì không spam nhật ký.
    await db.$transaction([
      ...toLock.map(u =>
        db.user.update({
          where: { id: u.id },
          data: {
            lockedAt: new Date(),
            lockedReason: `Điểm tin cậy ${u.score}/100 — thấp hơn ngưỡng ${LOCK_THRESHOLD} (rà soát lại)`,
          },
        }),
      ),
      db.adminActionLog.create({
        data: {
          adminId: user.id,
          action: 'LOCK_SWEEP',
          targetType: 'USER',
          targetId: 'bulk',
          meta: JSON.stringify({
            checked: users.length,
            locked: toLock.length,
            lockedUsers: toLock.map(u => ({ id: u.id, name: u.name, role: u.role, score: u.score })),
          }),
        },
      }),
    ])
  }

  return NextResponse.json({
    checked: users.length,
    threshold: LOCK_THRESHOLD,
    locked: toLock.length,
    users: toLock.map(u => ({ id: u.id, name: u.name, role: u.role, score: u.score })),
    message:
      toLock.length === 0
        ? `Đã rà ${users.length} tài khoản — mọi người đều trên ngưỡng tin cậy ${LOCK_THRESHOLD}/100.`
        : `Đã khóa thêm ${toLock.length}/${users.length} tài khoản dưới ngưỡng ${LOCK_THRESHOLD}/100.`,
  })
}
