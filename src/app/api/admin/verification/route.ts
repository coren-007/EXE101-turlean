// GET /api/admin/verification — danh sách yêu cầu xác minh cho admin duyệt (P6).
// ?status=PENDING|APPROVED|REJECTED (mặc định: tất cả, PENDING lên trước).
// Response CHỈ chứa metadata — file bytes lấy qua /api/admin/verification/[id]/file.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const status = new URL(req.url).searchParams.get('status')
  const where = ['PENDING', 'APPROVED', 'REJECTED'].includes(status ?? '')
    ? { status: status as string }
    : {}

  const requests = await db.verificationRequest.findMany({
    where,
    select: {
      id: true,
      tutorId: true,
      kind: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      note: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      createdAt: true,
      tutor: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          profession: true,
          city: true,
          isVerified: true,
        },
      },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // PENDING < APPROVED < REJECTED theo alphabet
    take: 100,
  })

  return NextResponse.json({ requests })
}
