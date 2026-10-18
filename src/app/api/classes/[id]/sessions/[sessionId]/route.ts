// PATCH /api/classes/[id]/sessions/[sessionId] — gia sư thao tác trên MỘT buổi học:
//  - action: 'reschedule' → DỜI BUỔI (dạy bù): đổi ngày/giờ của đúng buổi này,
//    không ảnh hưởng các buổi khác. Check conflict với lớp khác + buổi 1-1 cùng
//    khung giờ mới. Tự động thông báo cho toàn bộ học sinh trong lớp.
//  - action: 'cancel' → NGHỈ BUỔI: hủy đúng buổi này (lý do bắt buộc >= 5 ký tự),
//    các buổi khác vẫn diễn ra bình thường. Không trừ điểm uy tín (khác hủy 1-1 —
//    lớp nhóm là lịch cố định, nghỉ buổi là tình huống bình thường của lớp).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { checkSessionReschedule } from '@/lib/class-sessions'
import {
  notifyStudentsSessionRescheduled, notifyStudentsSessionCancelled, notifyStudentsMakeupScheduled,
} from '@/lib/notify'
import { formatDate } from '@/lib/format'
import { vnEpoch } from '@/lib/vn-time'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const patchSchema = z.object({
  action: z.enum(['reschedule', 'cancel']),
  date: z.string().regex(DATE_RE, 'Ngày không hợp lệ').optional(),
  startTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ').optional(),
  endTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ').optional(),
  reason: z.string().trim().max(300, 'Lý do tối đa 300 ký tự').optional(),
  // Buổi dạy bù đi kèm nghỉ buổi (tùy chọn)
  makeup: z
    .object({
      date: z.string().regex(DATE_RE, 'Ngày dạy bù không hợp lệ'),
      startTime: z.string().regex(TIME_RE, 'Giờ dạy bù không hợp lệ'),
      endTime: z.string().regex(TIME_RE, 'Giờ dạy bù không hợp lệ'),
    })
    .optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được thao tác buổi học' }, { status: 403 })
  }

  const { id, sessionId } = await params
  const raw = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const body = parsed.data

  const session = await db.classSession.findUnique({
    where: { id: sessionId },
    include: {
      class: {
        include: {
          tutor: { select: { id: true, name: true } },
          enrollments: { include: { studentParent: { select: { id: true, name: true } } } },
        },
      },
    },
  })
  if (!session || session.classId !== id) {
    return NextResponse.json({ error: 'Không tìm thấy buổi học' }, { status: 404 })
  }
  if (session.class.tutorId !== user.id) {
    return NextResponse.json({ error: 'Bạn không phải chủ lớp này' }, { status: 403 })
  }
  if (session.status !== 'SCHEDULED') {
    return NextResponse.json(
      { error: session.status === 'COMPLETED'
        ? 'Buổi này đã hoàn thành (đã điểm danh) — không thể dời/hủy'
        : 'Buổi này đã bị hủy trước đó' },
      { status: 400 },
    )
  }

  const approvedStudents = session.class.enrollments
    .filter(e => e.status === 'APPROVED')
    .map(e => ({ id: e.studentParent.id, name: e.studentParent.name }))

  // ===== Hành động: NGHỈ BUỔI (kèm tùy chọn xếp buổi DẠY BÙ) =====
  if (body.action === 'cancel') {
    const reason = body.reason?.trim() ?? ''
    if (reason.length < 5) {
      return NextResponse.json({ error: 'Vui lòng nhập lý do nghỉ buổi (tối thiểu 5 ký tự)' }, { status: 400 })
    }

    // Xếp buổi dạy bù đi kèm — validate + check conflict TRƯỚC khi hủy buổi gốc
    const mu = body.makeup ?? null
    if (mu) {
      if (mu.startTime >= mu.endTime) {
        return NextResponse.json({ error: 'Giờ bắt đầu buổi bù phải trước giờ kết thúc' }, { status: 400 })
      }
      if (mu.date === session.date && mu.startTime === session.startTime) {
        return NextResponse.json({ error: 'Buổi dạy bù trùng đúng buổi đang nghỉ — chọn ngày/giờ khác' }, { status: 400 })
      }
      // SẸ-TZ (B3): epoch theo giờ VN — không cho xếp bù vào quá khứ theo giờ VN
      if (vnEpoch(mu.date, mu.startTime) < Date.now()) {
        return NextResponse.json({ error: 'Không thể xếp buổi bù vào thời gian đã qua' }, { status: 400 })
      }
    }

    // SẸ-RACE4 (B11, audit CAO): check conflict + hủy buổi + tạo buổi bù trong
    // CÙNG transaction — trước đây check tách rời nên 2 thao tác song song có thể
    // cùng đè lên một khung giờ (check→act ngoài tx).
    const race = { conflictMsg: null as string | null }
    const result = await db.$transaction(async tx => {
      // Buổi đã nghỉ đúng slot makeup (nếu có) — sẽ được HỒI SINH thành buổi bù
      let rested: { id: string; note: string | null } | null = null
      if (mu) {
        // Trùng buổi lớp khác / buổi 1-1 cùng khung giờ mới? (exclude buổi gốc)
        const conflict = await checkSessionReschedule(user.id, sessionId, mu.date, mu.startTime, mu.endTime, tx)
        if (conflict) {
          race.conflictMsg = `Không thể xếp buổi bù — ${conflict}`
          return null
        }
        // Trùng buổi khác CÒN LỊCH của chính lớp này? (exclude buổi gốc — nó sắp bị hủy).
        // Buổi CANCELLED không còn chiếm khung giờ → dạy bù ĐÚNG slot buổi đã nghỉ
        // là hợp lệ: nghỉ lễ/hủy buổi giải phóng khung giờ (khớp luật
        // checkSessionReschedule vốn đã lọc status — trước đây existed check không
        // lọc nên buổi đã nghỉ vẫn chặn, phát hiện khi chạy E2E browser UI)
        const existed = await tx.classSession.findFirst({
          where: {
            classId: session.classId,
            date: mu.date,
            startTime: mu.startTime,
            status: { not: 'CANCELLED' },
          },
        })
        if (existed) {
          race.conflictMsg = 'Lớp đã có buổi cùng ngày cùng giờ này'
          return null
        }
        // Slot này từng có buổi đã nghỉ? Ghi nhận để HỒI SINH thành buổi bù bên dưới
        // (DB ràng buộc unique [classId, date, startTime] — hồi sinh dòng cũ thay vì
        // tạo dòng thứ 2 cùng slot: giữ nguyên ràng buộc, không cần migration)
        rested = await tx.classSession.findFirst({
          where: {
            classId: session.classId,
            date: mu.date,
            startTime: mu.startTime,
            status: 'CANCELLED',
          },
          select: { id: true, note: true },
        })
      }
      const updated = await tx.classSession.update({
        where: { id: sessionId },
        data: { status: 'CANCELLED', note: reason },
      })
      if (mu) {
        const makeupNote = `Dạy bù cho buổi ${formatDate(session.date)} (${reason})`
        // rested !== null → slot mục tiêu từng là buổi đã nghỉ: hồi sinh dòng đó
        // thành buổi bù (đổi endTime nếu khác, gắn makeupForId về buổi gốc mới)
        const makeupSession = rested
          ? await tx.classSession.update({
              where: { id: rested.id },
              data: {
                endTime: mu.endTime,
                status: 'SCHEDULED',
                makeupForId: sessionId,
                note: rested.note
                  ? `${makeupNote} — hồi sinh từ buổi đã nghỉ (${rested.note})`
                  : makeupNote,
              },
            })
          : await tx.classSession.create({
              data: {
                classId: session.classId,
                date: mu.date,
                startTime: mu.startTime,
                endTime: mu.endTime,
                status: 'SCHEDULED',
                makeupForId: sessionId,
                note: makeupNote,
              },
            })
        return { updated, makeupSession }
      }
      return { updated, makeupSession: null }
    })
    if (!result) {
      return NextResponse.json({ error: race.conflictMsg ?? 'Không thể xếp buổi bù' }, { status: 409 })
    }
    const { updated, makeupSession } = result

    if (body.makeup) {
      await notifyStudentsMakeupScheduled({
        tutorId: session.class.tutorId,
        tutorName: session.class.tutor.name,
        classTitle: session.class.title,
        oldDate: formatDate(session.date),
        oldTime: session.startTime,
        newDate: formatDate(body.makeup.date),
        newTime: `${body.makeup.startTime}–${body.makeup.endTime}`,
        reason,
        students: approvedStudents,
      }).catch(() => {})
      return NextResponse.json({
        session: updated,
        makeupSession,
        message: `Đã nghỉ buổi ${formatDate(session.date)} và xếp DẠY BÙ sang ${formatDate(body.makeup.date)} ${body.makeup.startTime} — học sinh đã nhận thông báo`,
      })
    }

    await notifyStudentsSessionCancelled({
      tutorId: session.class.tutorId,
      tutorName: session.class.tutor.name,
      classTitle: session.class.title,
      date: formatDate(session.date),
      time: `${session.startTime}–${session.endTime}`,
      reason,
      students: approvedStudents,
    }).catch(() => {})
    return NextResponse.json({ session: updated, message: `Đã nghỉ buổi ${formatDate(session.date)} — học sinh trong lớp đã nhận thông báo` })
  }

  // ===== Hành động: DỜI BUỔI (dạy bù) =====
  const newDate = body.date ?? session.date
  const newStart = body.startTime ?? session.startTime
  const newEnd = body.endTime ?? session.endTime
  const reason = body.reason?.trim() || null

  if (newStart >= newEnd) {
    return NextResponse.json({ error: 'Giờ bắt đầu phải trước giờ kết thúc' }, { status: 400 })
  }
  if (newDate === session.date && newStart === session.startTime && newEnd === session.endTime) {
    return NextResponse.json({ error: 'Bạn chưa thay đổi ngày hoặc giờ nào' }, { status: 400 })
  }
  // Chỉ dời tới tương lai (cho phép hôm nay nếu giờ còn tới)
  // SẸ-TZ (B3): epoch theo giờ VN
  if (vnEpoch(newDate, newStart) < Date.now()) {
    return NextResponse.json({ error: 'Không thể dời buổi về thời gian đã qua' }, { status: 400 })
  }

  // Chống trùng lịch: lớp khác + buổi 1-1 cùng ngày của gia sư
  // SẸ-RACE4 (B11): check + update trong cùng transaction
  const race2 = { conflictMsg: null as string | null }
  const updated = await db.$transaction(async tx => {
    const conflict = await checkSessionReschedule(user.id, sessionId, newDate, newStart, newEnd, tx)
    if (conflict) {
      race2.conflictMsg = `Không thể dời buổi — ${conflict}`
      return null
    }
    return tx.classSession.update({
      where: { id: sessionId },
      data: { date: newDate, startTime: newStart, endTime: newEnd, note: reason },
    })
  })
  if (!updated) {
    return NextResponse.json({ error: race2.conflictMsg ?? 'Không thể dời buổi' }, { status: 409 })
  }

  await notifyStudentsSessionRescheduled({
    tutorId: session.class.tutorId,
    tutorName: session.class.tutor.name,
    classTitle: session.class.title,
    oldDate: formatDate(session.date),
    oldTime: session.startTime,
    newDate: formatDate(newDate),
    newTime: `${newStart}–${newEnd}`,
    reason,
    students: approvedStudents,
  }).catch(() => {})

  return NextResponse.json({
    session: updated,
    message: `Đã dời buổi ${formatDate(session.date)} → ${formatDate(newDate)} ${newStart} — học sinh trong lớp đã nhận thông báo`,
  })
}
