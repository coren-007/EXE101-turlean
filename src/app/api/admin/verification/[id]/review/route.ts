// POST /api/admin/verification/[id]/review — admin duyệt/từ chối yêu cầu xác minh (P6).
// APPROVED ⇒ tutor.isVerified = true (badge "Đã xác minh" trên hồ sơ trở nên thật).
// REJECTED ⇒ bắt buộc reviewNote (>= 5 ký tự) để gia sư biết phải gửi lại thế nào.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const reviewSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    reviewNote: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'REJECTED' && (!data.reviewNote || data.reviewNote.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reviewNote'],
        message: 'Từ chối phải kèm lý do (tối thiểu 5 ký tự) để gia sư biết cần gửi lại thế nào',
      })
    }
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
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }

  const existing = await db.verificationRequest.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 })
  if (existing.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Yêu cầu này đã được xử lý (${existing.status === 'APPROVED' ? 'đã duyệt' : 'đã từ chối'})` },
      { status: 400 },
    )
  }

  // Cập nhật yêu cầu + bật isVerified (khi duyệt) trong 1 transaction
  // SẸ-LOG (B13): ghi thêm AdminActionLog để mọi thao tác admin nằm trong
  // nhật ký chung (reviewedById riêng lẻ khó truy vết tổng thể)
  const [updated] = await db.$transaction([
    db.verificationRequest.update({
      where: { id },
      data: {
        status: parsed.data.status,
        reviewNote: parsed.data.reviewNote ?? null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
      select: {
        id: true,
        tutorId: true,
        kind: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
      },
    }),
    ...(parsed.data.status === 'APPROVED'
      ? [db.user.update({ where: { id: existing.tutorId }, data: { isVerified: true } })]
      : []),
    db.adminActionLog.create({
      data: {
        adminId: user.id,
        action: parsed.data.status === 'APPROVED' ? 'VERIFY_APPROVE' : 'VERIFY_REJECT',
        targetType: 'VERIFICATION_REQUEST',
        targetId: id,
        meta: JSON.stringify({
          tutorId: existing.tutorId,
          kind: existing.kind,
          reviewNote: parsed.data.reviewNote ?? null,
        }),
      },
    }),
  ])

  return NextResponse.json({
    request: updated,
    tutorVerified: parsed.data.status === 'APPROVED',
    message:
      parsed.data.status === 'APPROVED'
        ? 'Đã duyệt — hồ sơ gia sư hiện bật badge "Đã xác minh".'
        : 'Đã từ chối — gia sư sẽ thấy lý do trong Trang quản lý.',
  })
}
