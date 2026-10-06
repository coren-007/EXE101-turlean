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

// ===== Lớp học cố định (nhóm) — thông báo đăng ký / duyệt học sinh =====

/** Thông báo cho GIA SƯ khi phụ huynh/học sinh đăng ký vào lớp học cố định */
export async function notifyTutorNewEnrollment(params: {
  tutorId: string
  studentParentId: string
  parentName: string
  studentName: string
  classTitle: string
  schedule: string // "T3 18:00–20:30 · T5 18:00–20:30"
  enrolledCount: number // sĩ số đã duyệt hiện tại
  capacity: number
  note?: string | null
}) {
  const who =
    params.studentName && params.studentName !== params.parentName
      ? `học sinh ${params.studentName} (do ${params.parentName} đăng ký)`
      : params.parentName
  const lines = [
    `[Đăng ký lớp học] ${who} đã gửi đăng ký vào lớp "${params.classTitle}".`,
    `Lịch học cố định: ${params.schedule}. Lớp hiện có ${params.enrolledCount}/${params.capacity} học sinh.`,
    'Vui lòng duyệt hoặc từ chối trong Bảng điều khiển — tab "Lớp học".',
  ]
  if (params.note) lines.push(`Lời nhắn: ${params.note}`)
  await pushSystemMessage({
    tutorId: params.tutorId,
    studentId: params.studentParentId,
    senderId: params.studentParentId,
    body: lines.join('\n'),
  })
}

/** Thông báo cho PHỤ HUYNH/HỌC SINH khi được duyệt vào lớp */
export async function notifyStudentEnrollmentApproved(params: {
  tutorId: string
  studentId: string
  tutorName: string
  studentName: string
  classTitle: string
  schedule: string
  address?: string | null
  monthlyFee?: number | null
}) {
  const lines = [
    `[Đã vào lớp] Gia sư ${params.tutorName} đã duyệt ${params.studentName} vào lớp "${params.classTitle}".`,
    `Lịch học cố định: ${params.schedule}.`,
  ]
  if (params.address) lines.push(`Địa điểm: ${params.address}.`)
  if (params.monthlyFee) lines.push(`Học phí: ${vnd(params.monthlyFee)}/tháng — thanh toán trực tiếp cho gia sư.`)
  lines.push('Chi tiết lớp học trong Bảng điều khiển của bạn.')
  await pushSystemMessage({
    tutorId: params.tutorId,
    studentId: params.studentId,
    senderId: params.tutorId,
    body: lines.join('\n'),
  })
}

/** Thông báo cho PHỤ HUYNH/HỌC SINH khi đăng ký lớp bị từ chối */
export async function notifyStudentEnrollmentRejected(params: {
  tutorId: string
  studentId: string
  tutorName: string
  studentName: string
  classTitle: string
}) {
  const body =
    `[Từ chối đăng ký] Gia sư ${params.tutorName} chưa nhận ${params.studentName} vào lớp "${params.classTitle}".` +
    ' Có thể lớp đã đủ sĩ số. Bạn vẫn có thể nhắn tin cho gia sư hoặc tìm lớp khác phù hợp.'
  await pushSystemMessage({
    tutorId: params.tutorId,
    studentId: params.studentId,
    senderId: params.tutorId,
    body,
  })
}

/** Thông báo cho GIA SƯ khi phụ huynh/học sinh rút đăng ký (hoặc rời lớp) */
export async function notifyTutorEnrollmentCancelled(params: {
  tutorId: string
  studentId: string
  parentName: string
  studentName: string
  classTitle: string
  wasApproved: boolean // true = đã từng vào lớp rồi rời, false = rút đăng ký đang chờ duyệt
}) {
  const who =
    params.studentName && params.studentName !== params.parentName
      ? `học sinh ${params.studentName} (phụ huynh ${params.parentName})`
      : params.parentName
  const body =
    `[${params.wasApproved ? 'Rời lớp' : 'Rút đăng ký'}] ${who} đã ${
      params.wasApproved ? 'rời' : 'rút đăng ký khỏi'
    } lớp "${params.classTitle}". Sĩ số lớp được cập nhật tự động.`
  await pushSystemMessage({
    tutorId: params.tutorId,
    studentId: params.studentId,
    senderId: params.studentId,
    body,
  })
}

// ===== Lớp học cố định — waitlist, buổi học & thay đổi lịch =====

/** Thông báo cho GIA SƯ khi có học sinh vào DANH SÁCH CHỜ (lớp đã đủ sĩ số) */
export async function notifyTutorNewWaitlist(params: {
  tutorId: string
  studentParentId: string
  parentName: string
  studentName: string
  classTitle: string
  position: number
  note?: string | null
}) {
  const who =
    params.studentName && params.studentName !== params.parentName
      ? `học sinh ${params.studentName} (do ${params.parentName} đăng ký)`
      : params.parentName
  const lines = [
    `[Danh sách chờ] ${who} đã đăng ký vào danh sách chờ của lớp "${params.classTitle}" — vị trí #${params.position}.`,
    'Lớp hiện đã đủ sĩ số. Khi có học sinh rời lớp hoặc bạn tăng sĩ số, hệ thống tự động chuyển học sinh chờ vào lớp.',
  ]
  if (params.note) lines.push(`Lời nhắn: ${params.note}`)
  await pushSystemMessage({
    tutorId: params.tutorId,
    studentId: params.studentParentId,
    senderId: params.studentParentId,
    body: lines.join('\n'),
  })
}

/** Thông báo cho PHỤ HUYNH khi được TỰ ĐỘNG chuyển từ danh sách chờ vào lớp */
export async function notifyStudentWaitlistPromoted(params: {
  tutorId: string
  studentId: string
  tutorName: string
  studentName: string
  classTitle: string
  schedule: string
  address?: string | null
  monthlyFee?: number | null
}) {
  const lines = [
    `[Có chỗ trống!] Học sinh ${params.studentName} vừa được chuyển TỰ ĐỘNG từ danh sách chờ vào lớp "${params.classTitle}" (gia sư ${params.tutorName}).`,
    `Lịch học cố định: ${params.schedule}.`,
  ]
  if (params.address) lines.push(`Địa điểm: ${params.address}.`)
  if (params.monthlyFee) lines.push(`Học phí: ${vnd(params.monthlyFee)}/tháng — thanh toán trực tiếp cho gia sư.`)
  lines.push('Chi tiết buổi học trong Bảng điều khiển của bạn.')
  await pushSystemMessage({
    tutorId: params.tutorId,
    studentId: params.studentId,
    senderId: params.tutorId,
    body: lines.join('\n'),
  })
}

/** Thông báo cho TOÀN BỘ học sinh trong lớp khi GIA SƯ ĐỔI LỊCH TUẦN của lớp */
export async function notifyStudentsScheduleChanged(params: {
  tutorId: string
  tutorName: string
  classTitle: string
  newSchedule: string
  students: { id: string; name: string }[]
}) {
  for (const s of params.students) {
    const body =
      `[Đổi lịch lớp] Gia sư ${params.tutorName} đã thay đổi lịch học tuần của lớp "${params.classTitle}".\n` +
      `Lịch mới: ${params.newSchedule}.\n` +
      'Các buổi đã hoàn thành giữ nguyên — chỉ buổi chưa diễn ra được cập nhật theo lịch mới.'
    await pushSystemMessage({
      tutorId: params.tutorId,
      studentId: s.id,
      senderId: params.tutorId,
      body,
    })
  }
}

/** Thông báo cho học sinh trong lớp khi 1 BUỔI được dời (dạy bù) */
export async function notifyStudentsSessionRescheduled(params: {
  tutorId: string
  tutorName: string
  classTitle: string
  oldDate: string
  oldTime: string
  newDate: string
  newTime: string
  reason?: string | null
  students: { id: string; name: string }[]
}) {
  for (const s of params.students) {
    const body =
      `[Dời buổi học] Buổi ${params.oldDate} ${params.oldTime} của lớp "${params.classTitle}" đã được gia sư ${params.tutorName} dời sang ${params.newDate} ${params.newTime}.` +
      (params.reason ? `\nLý do: ${params.reason}.` : '')
    await pushSystemMessage({
      tutorId: params.tutorId,
      studentId: s.id,
      senderId: params.tutorId,
      body,
    })
  }
}

/** Thông báo cho học sinh trong lớp khi 1 BUỔI bị nghỉ (hủy buổi) */
export async function notifyStudentsSessionCancelled(params: {
  tutorId: string
  tutorName: string
  classTitle: string
  date: string
  time: string
  reason: string
  students: { id: string; name: string }[]
}) {
  for (const s of params.students) {
    const body =
      `[Nghỉ buổi] Buổi ${params.date} ${params.time} của lớp "${params.classTitle}" đã bị hủy bởi gia sư ${params.tutorName}.\n` +
      `Lý do: ${params.reason}.\n` +
      'Các buổi khác trong tuần vẫn diễn ra bình thường.'
    await pushSystemMessage({
      tutorId: params.tutorId,
      studentId: s.id,
      senderId: params.tutorId,
      body,
    })
  }
}

/** Thông báo cho học sinh trong lớp khi lớp ĐÓNG / bị XÓA */
export async function notifyStudentsClassClosed(params: {
  tutorId: string
  tutorName: string
  classTitle: string
  deleted: boolean
  students: { id: string; name: string }[]
}) {
  for (const s of params.students) {
    const body =
      `[${params.deleted ? 'Lớp đã xóa' : 'Lớp đã đóng'}] Lớp "${params.classTitle}" (gia sư ${params.tutorName}) ` +
        `${params.deleted ? 'đã bị xóa khỏi hệ thống' : 'đã kết thúc, không còn nhận học sinh'}. ` +
        'Bạn có thể nhắn tin cho gia sư hoặc tìm lớp khác phù hợp.'
    await pushSystemMessage({
      tutorId: params.tutorId,
      studentId: s.id,
      senderId: params.tutorId,
      body,
    })
  }
}

/**
 * Nhắc lịch NGÀY MAI cho học sinh trong lớp nhóm (cron /api/cron/reminder).
 * Gửi SYSTEM message vào hội thoại tutor↔student (kèm email nếu cấu hình Resend).
 */
export async function notifyStudentsClassSessionReminder(params: {
  tutorId: string
  tutorName: string
  classTitle: string
  subjectName: string
  date: string
  time: string
  endTime: string
  address: string | null
  students: { id: string; name: string }[]
}) {
  for (const s of params.students) {
    const body =
      `[Nhắc lịch] Lớp "${params.classTitle}" (môn ${params.subjectName}) có buổi học NGÀY MAI: ` +
      `${params.date} · ${params.time}–${params.endTime}.` +
      (params.address ? `\nĐịa điểm: ${params.address}.` : '') +
      '\nVui lòng đến đúng giờ.'
    await pushSystemMessage({
      tutorId: params.tutorId,
      studentId: s.id,
      senderId: params.tutorId,
      body,
    })
  }
}
