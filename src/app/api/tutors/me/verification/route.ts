// GET/POST/DELETE /api/tutors/me/verification — gia sư gửi & theo dõi yêu cầu
// xác minh bằng cấp (P6). Admin duyệt ở /api/admin/verification.
//
// GET    → danh sách yêu cầu của chính mình (metadata, KHÔNG trả fileData)
// POST   → gửi yêu cầu mới (multipart/form-data: kind, note?, file)
// DELETE ?id= → rút lại yêu cầu đang PENDING
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// 5MB — đủ cho ảnh chụp bằng cấp/PDF scan, không làm phình DB
export const MAX_VERIFICATION_FILE_BYTES = 5 * 1024 * 1024

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const

export const KIND_LABEL: Record<string, string> = {
  DEGREE: 'Bằng cấp',
  CERTIFICATE: 'Chứng chỉ',
  ID_CARD: 'Giấy tờ tùy thân',
}

const kindSchema = z.enum(['DEGREE', 'CERTIFICATE', 'ID_CARD'])
const noteSchema = z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').optional()

/** Chọn cột metadata — không bao giờ lộ fileData ra JSON */
const META_SELECT = {
  id: true,
  kind: true,
  fileName: true,
  fileType: true,
  fileSize: true,
  note: true,
  status: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
} as const

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới gửi yêu cầu xác minh' }, { status: 403 })
  }

  const requests = await db.verificationRequest.findMany({
    where: { tutorId: user.id },
    select: META_SELECT,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    isVerified: user.isVerified,
    requests,
    pendingCount: requests.filter(r => r.status === 'PENDING').length,
  })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới gửi yêu cầu xác minh' }, { status: 403 })
  }

  // Parse multipart form
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Yêu cầu không hợp lệ (cần multipart/form-data)' }, { status: 400 })
  }

  const kindRaw = String(form.get('kind') ?? '')
  const noteRaw = form.get('note')
  const file = form.get('file')

  const kind = kindSchema.safeParse(kindRaw)
  if (!kind.success) {
    return NextResponse.json({ error: 'Loại giấy tờ phải là DEGREE, CERTIFICATE hoặc ID_CARD' }, { status: 400 })
  }
  const note = noteSchema.safeParse(typeof noteRaw === 'string' ? noteRaw : undefined)
  if (!note.success) {
    return NextResponse.json({ error: note.error.issues[0]?.message ?? 'Ghi chú không hợp lệ' }, { status: 400 })
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Vui lòng chọn tệp bằng cấp/chứng chỉ' }, { status: 400 })
  }
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    return NextResponse.json(
      { error: 'Chỉ nhận tệp ảnh (PNG, JPG, WebP) hoặc PDF' },
      { status: 400 },
    )
  }
  if (file.size > MAX_VERIFICATION_FILE_BYTES) {
    return NextResponse.json(
      { error: `Tệp quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB) — tối đa 5MB` },
      { status: 413 },
    )
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Tệp rỗng, vui lòng chọn lại' }, { status: 400 })
  }

  // Chặn gửi trùng: mỗi loại giấy tờ chỉ 1 yêu cầu PENDING tại một thời điểm
  const existingPending = await db.verificationRequest.findFirst({
    where: { tutorId: user.id, kind: kind.data, status: 'PENDING' },
    select: { id: true },
  })
  if (existingPending) {
    return NextResponse.json(
      { error: `Bạn đã có yêu cầu "${KIND_LABEL[kind.data]}" đang chờ duyệt — vui lòng rút lại trước khi gửi mới` },
      { status: 400 },
    )
  }

  const fileData = Buffer.from(await file.arrayBuffer())

  const created = await db.verificationRequest.create({
    data: {
      tutorId: user.id,
      kind: kind.data,
      fileName: file.name || 'khong-ten',
      fileType: file.type,
      fileSize: file.size,
      fileData,
      note: note.data ?? null,
    },
    select: META_SELECT,
  })

  return NextResponse.json(
    {
      request: created,
      message: 'Đã gửi yêu cầu xác minh — quản trị viên sẽ duyệt trong vòng 48 giờ làm việc.',
    },
    { status: 201 },
  )
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới gửi yêu cầu xác minh' }, { status: 403 })
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Thiếu id yêu cầu' }, { status: 400 })

  const existing = await db.verificationRequest.findUnique({ where: { id } })
  if (!existing || existing.tutorId !== user.id) {
    return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 })
  }
  if (existing.status !== 'PENDING') {
    return NextResponse.json({ error: 'Chỉ rút được yêu cầu đang chờ duyệt' }, { status: 400 })
  }

  await db.verificationRequest.delete({ where: { id } })
  return NextResponse.json({ message: 'Đã rút lại yêu cầu xác minh' })
}
