// src/lib/class-sessions.ts
// ===== Sinh & quản lý buổi học (ClassSession) cho lớp học cố định (nhóm) =====
//
// Vấn đề gốc trước đây: lớp nhóm chỉ lưu ClassScheduleSlot (mẫu tuần) — không có
// "buổi học theo ngày cụ thể" nên không thể điểm danh, không thể dời 1 buổi,
// không hiển thị được trên lịch tuần dashboard.
//
// Giải pháp: sinh ClassSession theo ngày từ mẫu tuần:
// - Sinh 12 tuần trước (rolling), tự gia hạn khi còn < 4 buổi tương lai
// - Đổi lịch tuần → xóa buổi SCHEDULED tương lai + sinh lại (giữ buổi đã hoàn thành)
// - Dời/nghỉ từng buổi → PATCH đúng 1 session, không ảnh hưởng lớp

import { db } from './db'
import { CLASS_DAY_NAMES } from './format'

// Cấu hình rolling schedule
export const SESSIONS_WEEKS_AHEAD = 12 // sinh trước 12 tuần
export const SESSIONS_MIN_FUTURE = 4 // khi còn < 4 buổi tương lai → tự gia hạn

// ===== Date helpers (YYYY-MM-DD, local time — đồng nhất toàn app) =====

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysISO(iso: string, days: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

function maxISO(a: string, b: string): string {
  return a >= b ? a : b
}

export interface SlotLike {
  dayOfWeek: number
  startTime: string
  endTime: string
}

/** Tập ngày nghỉ lễ toàn hệ thống (YYYY-MM-DD) — sinh buổi sẽ bỏ qua */
export async function getHolidayDates(): Promise<Set<string>> {
  const rows = await db.holiday.findMany({ select: { date: true } })
  return new Set(rows.map(r => r.date))
}

/**
 * Thêm ngày lễ mới: hủy toàn bộ buổi SCHEDULED tương lai trúng đúng ngày
 * (trừ buổi dạy bù — gia sư chủ động xếp). Trả về danh sách buổi đã hủy kèm
 * thông tin lớp để NGƯỜI GỌI gửi thông báo cho học sinh.
 */
export async function cancelSessionsOnHoliday(date: string, holidayName: string) {
  const today = todayISO()
  // Chỉ xử lý ngày lễ trong tương lai — ngày đã qua không ảnh hưởng lịch
  if (date < today) return []
  const affected = await db.classSession.findMany({
    where: {
      status: 'SCHEDULED',
      date,
      makeupForId: null,
    },
    include: {
      class: {
        select: {
          id: true, title: true, tutorId: true,
          tutor: { select: { id: true, name: true } },
          enrollments: { where: { status: 'APPROVED' }, select: { studentParent: { select: { id: true, name: true } } } },
        },
      },
    },
  })
  if (affected.length === 0) return []
  await db.classSession.updateMany({
    where: { id: { in: affected.map(s => s.id) } },
    data: { status: 'CANCELLED', note: `Nghỉ lễ: ${holidayName}` },
  })
  return affected.map(s => ({
    sessionId: s.id,
    classId: s.class.id,
    classTitle: s.class.title,
    tutorId: s.class.tutorId,
    tutorName: s.class.tutor.name,
    date: s.date,
    time: `${s.startTime}–${s.endTime}`,
    students: s.class.enrollments.map(e => e.studentParent),
  }))
}

// Enrollment được thăng cấp từ danh sách chờ (dùng gửi thông báo)
export interface PromotedEnrollment {
  id: string
  classId: string
  studentParentId: string
  studentName: string | null
  status: string
  studentParent: { id: string; name: string }
}

/** Ngày occurrence đầu tiên của `dayOfWeek` tính từ `fromISODate` (bao gồm chính ngày đó) */
export function nextOccurrence(fromISODate: string, dayOfWeek: number): string {
  const d = fromISO(fromISODate)
  const diff = (dayOfWeek - d.getDay() + 7) % 7
  return addDaysISO(fromISODate, diff)
}

/** Sinh danh sách (date, startTime, endTime) cho `weeks` tuần kể từ fromDate */
export function generateSessionDates(
  slots: SlotLike[],
  fromDate: string,
  weeks: number,
): { date: string; startTime: string; endTime: string }[] {
  const out: { date: string; startTime: string; endTime: string }[] = []
  for (const slot of slots) {
    const first = nextOccurrence(fromDate, slot.dayOfWeek)
    for (let w = 0; w < weeks; w++) {
      out.push({
        date: addDaysISO(first, w * 7),
        startTime: slot.startTime,
        endTime: slot.endTime,
      })
    }
  }
  return out.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
}

/**
 * Sinh buổi học cho một lớp (idempotent — bỏ qua ngày đã có buổi).
 * Từ ngày max(hôm nay, startDate). Bỏ qua lớp CLOSED và NGÀY NGHỈ LỄ.
 * Trả về số buổi mới sinh.
 */
export async function generateSessionsForClass(classId: string): Promise<number> {
  const cls = await db.groupClass.findUnique({
    where: { id: classId },
    include: { schedule: true },
  })
  if (!cls || cls.status === 'CLOSED' || cls.schedule.length === 0) return 0

  const from = maxISO(todayISO(), cls.startDate ?? todayISO())
  const dates = generateSessionDates(cls.schedule, from, SESSIONS_WEEKS_AHEAD)

  const [holidays, existing] = await Promise.all([
    getHolidayDates(),
    db.classSession.findMany({
      where: { classId },
      select: { date: true, startTime: true },
    }),
  ])
  const seen = new Set(existing.map(e => `${e.date}|${e.startTime}`))
  const toCreate = dates.filter(
    d => !seen.has(`${d.date}|${d.startTime}`) && !holidays.has(d.date),
  )
  if (toCreate.length === 0) return 0

  await db.classSession.createMany({
    data: toCreate.map(d => ({ classId, ...d, status: 'SCHEDULED' })),
  })
  return toCreate.length
}

/**
 * Rolling: đảm bảo lớp luôn còn >= SESSIONS_MIN_FUTURE buổi SCHEDULED tương lai.
 * Gọi sau khi điểm danh hoàn thành 1 buổi / tải panel quản lý.
 */
export async function ensureRollingSessions(classId: string): Promise<number> {
  const cls = await db.groupClass.findUnique({
    where: { id: classId },
    include: { schedule: true },
  })
  if (!cls || cls.status === 'CLOSED' || cls.schedule.length === 0) return 0

  const today = todayISO()
  const future = await db.classSession.findMany({
    where: { classId, status: 'SCHEDULED', date: { gte: today } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })
  if (future.length >= SESSIONS_MIN_FUTURE) return 0

  // Sinh 12 tuần từ sau buổi tương lai cuối cùng (hoặc từ hôm nay nếu hết sạch)
  const from = future.length ? addDaysISO(future[future.length - 1].date, 1) : maxISO(today, cls.startDate ?? today)
  const dates = generateSessionDates(cls.schedule, from, SESSIONS_WEEKS_AHEAD)
  const [holidays, existing] = await Promise.all([
    getHolidayDates(),
    db.classSession.findMany({
      where: { classId },
      select: { date: true, startTime: true },
    }),
  ])
  const seen = new Set(existing.map(e => `${e.date}|${e.startTime}`))
  const toCreate = dates.filter(
    d => !seen.has(`${d.date}|${d.startTime}`) && !holidays.has(d.date),
  )
  if (toCreate.length === 0) return 0

  await db.classSession.createMany({
    data: toCreate.map(d => ({ classId, ...d, status: 'SCHEDULED' })),
  })
  return toCreate.length
}

/**
 * Đổi lịch tuần của lớp: xóa toàn bộ buổi SCHEDULED trong TƯƠNG LAI rồi sinh lại
 * theo mẫu mới. Buổi đã COMPLETED/CANCELLED hoặc đã qua giữ nguyên (lịch sử).
 * Trả về số buổi mới sinh. NGƯỜI GỌI chịu trách nhiệm gửi thông báo cho học sinh.
 */
export async function regenerateFutureSessions(classId: string): Promise<number> {
  const today = todayISO()
  await db.classSession.deleteMany({
    where: { classId, status: 'SCHEDULED', date: { gte: today } },
  })
  return generateSessionsForClass(classId)
}

/**
 * Chống trùng lịch CHÉO khi tạo/sửa lớp nhóm (điểm yếu B9 trước đây — chỉ check
 * trùng trong cùng lớp): lớp mới không được trùng (a) lớp nhóm khác của cùng gia sư
 * (OPEN/PAUSED), (b) buổi 1-1 đã đặt trong 8 tuần tới (PENDING/CONFIRMED).
 * Trả về danh sách lỗi (rỗng = hợp lệ).
 */
export async function checkClassSlotConflicts(
  tutorId: string,
  slots: SlotLike[],
  excludeClassId?: string,
): Promise<string[]> {
  const errors: string[] = []

  // (a) Trùng lớp nhóm khác của cùng gia sư
  const otherClasses = await db.groupClass.findMany({
    where: {
      tutorId,
      status: { in: ['OPEN', 'PAUSED'] },
      ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
    },
    include: { schedule: true },
  })
  for (const other of otherClasses) {
    for (const os of other.schedule) {
      for (const ns of slots) {
        if (os.dayOfWeek === ns.dayOfWeek && os.startTime < ns.endTime && ns.startTime < os.endTime) {
          errors.push(
            `Trùng lịch với lớp "${other.title}" — ${CLASS_DAY_NAMES[os.dayOfWeek]} ${os.startTime}–${os.endTime}`,
          )
        }
      }
    }
  }

  // (b) Trùng buổi 1-1 đã đặt trong 8 tuần tới
  const today = todayISO()
  const until = addDaysISO(today, 56)
  const bookings = await db.booking.findMany({
    where: {
      tutorId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      date: { gte: today, lte: until },
    },
    include: { student: { select: { name: true } }, subject: { select: { name: true } } },
  })
  for (const b of bookings) {
    const dow = fromISO(b.date).getDay()
    for (const ns of slots) {
      if (ns.dayOfWeek === dow && ns.startTime < b.endTime && b.startTime < ns.endTime) {
        errors.push(
          `Trùng buổi 1-1 đã nhận: ${b.subject.name} với học sinh ${b.student.name} — ${b.date} ${b.startTime}–${b.endTime}`,
        )
      }
    }
  }

  return [...new Set(errors)].slice(0, 8) // khử trùng + giới hạn thông báo
}

/**
 * Check conflict khi DỜI 1 buổi (dạy bù): khung giờ mới không được trùng
 * (a) buổi lớp nhóm khác cùng ngày của gia sư, (b) buổi 1-1 cùng ngày.
 * Trả về chuỗi lỗi (null = hợp lệ).
 */
export async function checkSessionReschedule(
  tutorId: string,
  sessionId: string,
  newDate: string,
  newStart: string,
  newEnd: string,
): Promise<string | null> {
  // (a) buổi lớp nhóm khác (kể cả cùng lớp — không dời đè lên buổi khác)
  const classSessions = await db.classSession.findMany({
    where: {
      id: { not: sessionId },
      status: { not: 'CANCELLED' },
      date: newDate,
      class: { tutorId },
    },
    include: { class: { select: { title: true } } },
  })
  for (const cs of classSessions) {
    if (newStart < cs.endTime && cs.startTime < newEnd) {
      return `Trùng buổi lớp "${cs.class.title}" — ${cs.date} ${cs.startTime}–${cs.endTime}`
    }
  }

  // (b) buổi 1-1 cùng ngày
  const bookings = await db.booking.findMany({
    where: {
      tutorId,
      date: newDate,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: { student: { select: { name: true } }, subject: { select: { name: true } } },
  })
  for (const b of bookings) {
    if (newStart < b.endTime && b.startTime < newEnd) {
      return `Trùng buổi 1-1 ${b.subject.name} với học sinh ${b.student.name} — ${b.date} ${b.startTime}–${b.endTime}`
    }
  }

  return null
}

/**
 * Waitlist: tự động chuyển học sinh chờ (WAITLIST) vào lớp (APPROVED) theo thứ tự
 * đăng ký khi có chỗ trống. Trả về danh sách enrollment đã được chuyển.
 * NGƯỜI GỌI chịu trách nhiệm gửi thông báo cho từng học sinh được chuyển.
 */
export async function promoteWaitlist(classId: string) {
  const cls = await db.groupClass.findUnique({
    where: { id: classId },
    include: {
      enrollments: { include: { studentParent: { select: { id: true, name: true } } } },
      schedule: true,
      tutor: { select: { id: true, name: true } },
      subject: { select: { name: true } },
    },
  })
  if (!cls || cls.status !== 'OPEN') return { cls: null, promoted: [] as PromotedEnrollment[] }

  let approved = cls.enrollments.filter(e => e.status === 'APPROVED').length
  const waiting = cls.enrollments
    .filter(e => e.status === 'WAITLIST')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  const promoted: PromotedEnrollment[] = []
  for (const w of waiting) {
    if (approved >= cls.capacity) break
    await db.classEnrollment.update({
      where: { id: w.id },
      data: { status: 'APPROVED', updatedAt: new Date() },
    })
    approved++
    promoted.push(w)
  }
  return { cls, promoted }
}
