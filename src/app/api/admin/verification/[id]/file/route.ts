// GET /api/admin/verification/[id]/file — trả file bằng cấp cho admin xem (P6).
// Chỉ ADMIN (cookie session) — link không chia sẻ được cho người ngoài.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const { id } = await params
  const request = await db.verificationRequest.findUnique({
    where: { id },
    select: { fileName: true, fileType: true, fileData: true },
  })
  if (!request) return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 })

  // Tên file ASCII an toàn cho header, tên gốc tiếng Việt đưa vào filename*
  const asciiName = request.fileName.replace(/[^\w.-]+/g, '_') || 'file'
  const disposition = `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(request.fileName)}`

  return new NextResponse(new Uint8Array(request.fileData), {
    headers: {
      'Content-Type': request.fileType,
      'Content-Disposition': disposition,
      'Content-Length': String(request.fileData.length),
      // Chặn nhúng file từ domain khác (file PDF/ảnh chứa nội dung động)
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
