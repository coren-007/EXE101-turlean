// GET /api/tutors/[id]/reliability — điểm tin cậy công khai của gia sư (P0-1)
// Phụ huynh xem được độ tin cậy TRƯỚC khi đặt lịch — minh bạch 2 chiều.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computeReliability } from '@/lib/reliability'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tutor = await db.user.findFirst({ where: { id, role: 'TUTOR' }, select: { id: true } })
  if (!tutor) return NextResponse.json({ error: 'Không tìm thấy gia sư' }, { status: 404 })

  const reliability = await computeReliability(id)
  return NextResponse.json(reliability)
}
