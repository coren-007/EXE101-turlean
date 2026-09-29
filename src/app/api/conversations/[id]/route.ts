// GET  /api/conversations/[id] — lấy toàn bộ tin nhắn + đánh dấu đã đọc
// POST /api/conversations/[id] — gửi tin nhắn trong hội thoại
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const sendSchema = z.object({
  body: z.string().trim().min(1, 'Tin nhắn không được để trống').max(1000, 'Tin nhắn tối đa 1000 ký tự'),
})

async function getOwnedConversation(id: string, userId: string) {
  const c = await db.conversation.findUnique({
    where: { id },
    include: {
      tutor: { select: { id: true, name: true, avatar: true, profession: true, role: true } },
      student: { select: { id: true, name: true, avatar: true, role: true } },
    },
  })
  if (!c) return null
  if (c.tutorId !== userId && c.studentId !== userId) return null
  return c
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await params
  const conversation = await getOwnedConversation(id, user.id)
  if (!conversation) return NextResponse.json({ error: 'Không tìm thấy hội thoại' }, { status: 404 })

  // Đánh dấu đã đọc toàn bộ tin của đối tác (người mở thread)
  await db.message.updateMany({
    where: { conversationId: id, senderId: { not: user.id }, readAt: null },
    data: { readAt: new Date() },
  })

  const messages = await db.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
    take: 200, // giới hạn bảo vệ — đủ cho hội thoại dài
  })

  const isTutorSide = conversation.tutorId === user.id
  const other = isTutorSide ? conversation.student : conversation.tutor

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      other: {
        id: other.id,
        name: other.name,
        avatar: other.avatar,
        profession: 'profession' in other ? other.profession : undefined,
        role: other.role,
      },
    },
    messages: messages.map(m => ({
      id: m.id,
      body: m.body,
      kind: m.kind,
      fromMe: m.senderId === user.id,
      createdAt: m.createdAt,
      readAt: m.readAt,
    })),
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await params
  const conversation = await getOwnedConversation(id, user.id)
  if (!conversation) return NextResponse.json({ error: 'Không tìm thấy hội thoại' }, { status: 404 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const parsed = sendSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }

  // Gửi tin + cập nhật lastMessageAt trong 1 transaction
  const message = await db.$transaction(async tx => {
    const created = await tx.message.create({
      data: {
        conversationId: id,
        senderId: user.id,
        body: parsed.data.body,
      },
    })
    await tx.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    })
    return created
  })

  return NextResponse.json({
    message: {
      id: message.id,
      body: message.body,
      fromMe: true,
      createdAt: message.createdAt,
    },
  })
}
