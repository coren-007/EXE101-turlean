// GET  /api/conversations — danh sách hội thoại của tôi (kèm tin cuối + số chưa đọc)
// POST /api/conversations — mở (tìm hoặc tạo) hội thoại với một người dùng khác
// Mục đích 2 — dễ dàng kết nối 2 bên gia sư ↔ phụ huynh/học sinh trong app.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const startSchema = z.object({
  otherUserId: z.string().min(1, 'Thiếu người nhận'),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const conversations = await db.conversation.findMany({
    where: {
      OR: [{ tutorId: user.id }, { studentId: user.id }],
    },
    include: {
      tutor: {
        select: { id: true, name: true, avatar: true, profession: true, role: true },
      },
      student: {
        select: { id: true, name: true, avatar: true, role: true },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { lastMessageAt: 'desc' },
  })

  const ids = conversations.map(c => c.id)
  const unreadRows = ids.length
    ? await db.message.groupBy({
        by: ['conversationId'],
        where: {
          conversationId: { in: ids },
          senderId: { not: user.id },
          readAt: null,
        },
        _count: { _all: true },
      })
    : []
  const unreadMap = new Map(unreadRows.map(r => [r.conversationId, r._count._all]))

  return NextResponse.json({
    conversations: conversations.map(c => {
      const isTutorSide = c.tutorId === user.id
      const other = isTutorSide ? c.student : c.tutor
      const last = c.messages[0] ?? null
      return {
        id: c.id,
        other: {
          id: other.id,
          name: other.name,
          avatar: other.avatar,
          profession: 'profession' in other ? other.profession : undefined,
          role: other.role,
        },
        lastMessage: last
          ? { body: last.body, createdAt: last.createdAt, fromMe: last.senderId === user.id, kind: last.kind }
          : null,
        unread: unreadMap.get(c.id) ?? 0,
        lastMessageAt: c.lastMessageAt,
      }
    }),
    totalUnread: [...unreadMap.values()].reduce((s, n) => s + n, 0),
  })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const parsed = startSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }

  const other = await db.user.findUnique({ where: { id: parsed.data.otherUserId } })
  if (!other) return NextResponse.json({ error: 'Không tìm thấy người dùng' }, { status: 404 })
  if (other.id === user.id) {
    return NextResponse.json({ error: 'Không thể nhắn tin cho chính mình' }, { status: 400 })
  }
  // Hội thoại chỉ tồn tại giữa 1 TUTOR và 1 STUDENT — đúng bản chất kết nối của nền tảng
  if (user.role === other.role) {
    return NextResponse.json(
      { error: 'Chỉ có thể nhắn tin giữa gia sư và phụ huynh/học sinh' },
      { status: 400 },
    )
  }

  const tutorId = user.role === 'TUTOR' ? user.id : other.id
  const studentId = user.role === 'TUTOR' ? other.id : user.id

  const conversation = await db.conversation.upsert({
    where: { tutorId_studentId: { tutorId, studentId } },
    create: { tutorId, studentId },
    update: {},
  })

  return NextResponse.json({ conversationId: conversation.id })
}
