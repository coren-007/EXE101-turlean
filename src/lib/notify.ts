// src/lib/notify.ts
// Thông báo tự động về sự kiện booking, gửi thẳng vào hội thoại giữa 2 bên
// (Mục đích 1 & 2: quản lý lớp học + kết nối — 2 bên luôn biết chuyện gì đang xảy ra).
//
// Thiết kế:
// - Tin hệ thống (kind = "SYSTEM") do NGƯỜI HÀNH ĐỘNG tạo (senderId = actor)
//   → bên kia thấy badge chưa đọc; khi mở thread sẽ được đánh dấu đã đọc.
// - Không bao giờ fail luồng chính: notify lỗi chỉ log, không chặn booking.

import { db } from '@/lib/db'
import { formatVnd } from '@/lib/format'

/** formatVnd-safe: đảm bảo có đơn vị tiền cho số tiền trong thông báo */
function vnd(n: number): string {
  return formatVnd(n)
}

// Đảm bảo hội thoại giữa tutor & student tồn tại (tìm hoặc tạo)
async function ensureConversation(tutorId: string, studentId: string) {
  return db.conversation.upsert({
    where: { tutorId_studentId: { tutorId, studentId } },
    create: { tutorId, studentId },
    update: {},
  })
}

async function pushSystemMessage(params: {
  tutorId: string
  studentId: string
  senderId: string // người gây ra sự kiện
  body: string
}): Promise<void> {
  try {
    const conversation = await ensureConversation(params.tutorId, params.studentId)
    await db.$transaction([
      db.message.create({
        data: {
          conversationId: conversation.id,
          senderId: params.senderId,
          body: params.body,
          kind: 'SYSTEM',
        },
      }),
      db.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      }),
    ])
  } catch (e) {
    // Thông báo là best-effort — không làm fail giao dịch booking
    console.error('[notify] không gửi được thông báo:', e)
  }
}

const MODE_LABEL: Record<string, string> = {
  TUTOR_TO_STUDENT: 'gia sư đến tận nhà',
  STUDENT_TO_TUTOR: 'tại cơ sở của gia sư',
  ONLINE: 'học trực tuyến',
}

/** Thông báo cho GIA SƯ khi học sinh đặt lịch (buổi lẻ hoặc khóa định kỳ) */
export async function notifyTutorNewBooking(params: {
  tutorId: string
  studentId: string
  studentName: string
  subjectName: string
  mode: string
  startTime: string
  endTime: string
  firstDate: string
  lastDate?: string
  sessionCount: number
  amountPerSession: number
  skippedWeeks?: { date: string; reason: string }[]
}) {
  const when = `${params.startTime}–${params.endTime}`
  const mode = MODE_LABEL[params.mode] ?? params.mode
  const lines: string[] = []

  if (params.sessionCount > 1 && params.lastDate) {
    lines.push(
      `[Khóa học định kỳ] ${params.studentName} đã đặt khóa ${params.subjectName} — ` +
        `${params.sessionCount} buổi, mỗi tuần 1 buổi cùng khung giờ ${when}, ` +
        `từ ${params.firstDate} đến ${params.lastDate} (${mode}).`,
    )
    lines.push(
      `Học phí ${vnd(params.amountPerSession)}/buổi · tổng ${vnd(params.amountPerSession * params.sessionCount)}. ` +
        'Vui lòng xác nhận từng buổi trong Bảng điều khiển.',
    )
    if (params.skippedWeeks?.length) {
      lines.push(
        `Lưu ý: ${params.skippedWeeks.length} tuần bị bỏ qua do trùng lịch: ` +
          params.skippedWeeks.map(s => s.date).join(', ') +
          '.',
      )
    }
  } else {
    lines.push(
      `[Lớp học mới] ${params.studentName} đã đặt lịch ${params.subjectName} — ` +
        `${params.firstDate}, ${when} (${mode}).`,
    )
    lines.push(
      `Học phí ${vnd(params.amountPerSession)} · thanh toán trực tiếp sau buổi học. ` +
        'Vui lòng xác nhận trong Bảng điều khiển.',
    )
  }

  await pushSystemMessage({
    tutorId: params.tutorId,
    studentId: params.studentId,
    senderId: params.studentId,
    body: lines.join('\n'),
  })
}

/** Thông báo cho HỌC SINH khi gia sư xác nhận buổi học */
export async function notifyStudentConfirmed(params: {
  tutorId: string
  studentId: string
  tutorName: string
  subjectName: string
  date: string
  startTime: string
  endTime: string
  amount: number
}) {
  const body =
    `[Đã xác nhận] ${params.tutorName} đã xác nhận buổi ${params.subjectName} — ` +
    `${params.date}, ${params.startTime}–${params.endTime}.\n` +
    `Học phí ${vnd(params.amount)} · thanh toán trực tiếp cho gia sư sau buổi học. ` +
    'Chi tiết trong Bảng điều khiển.'
  await pushSystemMessage({
    tutorId: params.tutorId,
    studentId: params.studentId,
    senderId: params.tutorId,
    body,
  })
}

/** Thông báo cho HỌC SINH khi gia sư đánh dấu buổi học hoàn thành */
export async function notifyStudentCompleted(params: {
  tutorId: string
  studentId: string
  tutorName: string
  subjectName: string
  date: string
}) {
  const body =
    `[Hoàn thành] ${params.tutorName} đã đánh dấu buổi ${params.subjectName} ngày ${params.date} là đã dạy xong.\n` +
    'Nếu bạn thấy buổi học tốt, hãy đánh giá trong Bảng điều khiển để giúp các phụ huynh khác tin tưởng chọn gia sư.'
  await pushSystemMessage({
    tutorId: params.tutorId,
    studentId: params.studentId,
    senderId: params.tutorId,
    body,
  })
}

/** Thông báo cho BÊN KIA khi một bên hủy buổi học */
export async function notifyCancellation(params: {
  tutorId: string
  studentId: string
  cancelledBy: string // 'TUTOR' | 'STUDENT'
  cancellerName: string
  subjectName: string
  date: string
  startTime: string
  reason: string
  points: number // điểm trừ của người hủy
}) {
  const who =
    params.cancelledBy === 'TUTOR' ? `Gia sư ${params.cancellerName}` : params.cancellerName
  const impact =
    params.points > 0
      ? ` Việc hủy này ảnh hưởng độ tin cậy của người hủy (-${params.points} điểm).`
      : ''
  const body =
    `[Đã hủy] Buổi ${params.subjectName} — ${params.date}, ${params.startTime} đã bị hủy bởi ${who}.\n` +
    `Lý do: ${params.reason}.${impact}`
  await pushSystemMessage({
    tutorId: params.tutorId,
    studentId: params.studentId,
    // người hủy là người "gửi" — để bên kia thấy unread
    senderId: params.cancelledBy === 'TUTOR' ? params.tutorId : params.studentId,
    body,
  })
}
