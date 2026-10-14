// scripts/backfill_sessions.ts
// Sinh ClassSession cho các lớp học cố định ĐÃ TỒN TẠI (chạy 1 lần sau khi cập nhật
// schema — các lớp tạo SAU này được sinh tự động trong API POST /api/classes).
//
// Backfill:
//  1. Sinh buổi học từ ngày khai giảng (hoặc ngày tạo lớp) tới 12 tuần tương lai
//  2. Buổi trong QUÁ KHỨ → đánh dấu COMPLETED + sinh điểm danh demo (xác suất ~85% có mặt,
//     deterministic theo hash để chạy lại ra cùng kết quả)
//  3. 1-2 buổi quá khứ ngẫu nhiên → CANCELLED kèm lý do (demo "nghỉ buổi")
//  4. Lớp đã đủ sĩ số → thêm 2 đăng ký WAITLIST demo (danh sách chờ)
//
// Chạy: bun run scripts/backfill_sessions.ts

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ---- Copy lại logic date từ src/lib/class-sessions (không import để script độc lập) ----
function fromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysISO(iso: string, days: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}
function nextOccurrence(fromISODate: string, dayOfWeek: number): string {
  const d = fromISO(fromISODate)
  const diff = (dayOfWeek - d.getDay() + 7) % 7
  return addDaysISO(fromISODate, diff)
}
function generateSessionDates(
  slots: { dayOfWeek: number; startTime: string; endTime: string }[],
  fromDate: string,
  weeks: number,
): { date: string; startTime: string; endTime: string }[] {
  const out: { date: string; startTime: string; endTime: string }[] = []
  for (const slot of slots) {
    const first = nextOccurrence(fromDate, slot.dayOfWeek)
    for (let w = 0; w < weeks; w++) {
      out.push({ date: addDaysISO(first, w * 7), startTime: slot.startTime, endTime: slot.endTime })
    }
  }
  return out.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
}

// Hash chuỗi đơn giản → pseudo-random deterministic
function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

async function run() {
  const today = toISO(new Date())
  const classes = await db.groupClass.findMany({
    include: {
      schedule: true,
      enrollments: { include: { studentParent: { select: { id: true, name: true } } } },
    },
  })

  if (classes.length === 0) {
    console.log('Không có lớp nào để backfill.')
    return
  }

  console.log(`🌱 Backfill buổi học cho ${classes.length} lớp học...`)

  for (const cls of classes) {
    if (cls.schedule.length === 0) continue

    // Mốc bắt đầu: ngày khai giảng nếu có, không thì ngày tạo lớp
    const startISO = toISO(cls.startDate ? fromISO(cls.startDate) : cls.createdAt)
    // Số tuần từ mốc bắt đầu tới hôm nay + 12 tuần tương lai
    const daysDiff = Math.max(0, Math.round((fromISO(today).getTime() - fromISO(startISO).getTime()) / 86400000))
    const weeksTotal = Math.ceil(daysDiff / 7) + 12

    const dates = generateSessionDates(cls.schedule, startISO, weeksTotal)
    const existing = await db.classSession.findMany({ where: { classId: cls.id } })
    const seen = new Set(existing.map(e => `${e.date}|${e.startTime}`))
    const toCreate = dates.filter(d => !seen.has(`${d.date}|${d.startTime}`))
    if (toCreate.length > 0) {
      await db.classSession.createMany({
        data: toCreate.map(d => ({ classId: cls.id, ...d, status: 'SCHEDULED' })),
      })
    }

    // Lấy lại toàn bộ buổi của lớp
    const sessions = await db.classSession.findMany({
      where: { classId: cls.id },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    })
    const approved = cls.enrollments.filter(e => e.status === 'APPROVED')

    // 1 buổi quá khứ đầu tiên → CANCELLED (demo nghỉ buổi), các buổi quá khứ còn lại → COMPLETED + điểm danh
    let cancelledOne = false
    let completed = 0, attendanceRows = 0
    for (const s of sessions) {
      if (s.date >= today) continue // chỉ xử lý buổi quá khứ
      if (s.status !== 'SCHEDULED') continue

      if (!cancelledOne && approved.length > 1 && hash01(cls.id + s.id) < 0.5) {
        await db.classSession.update({
          where: { id: s.id },
          data: { status: 'CANCELLED', note: 'Gia sư đi công tác đột xuất (dữ liệu demo)' },
        })
        cancelledOne = true
        continue
      }

      await db.classSession.update({ where: { id: s.id }, data: { status: 'COMPLETED' } })
      completed++
      for (const e of approved) {
        const r = hash01(s.id + e.studentParentId)
        await db.classAttendance.create({
          data: {
            sessionId: s.id,
            studentParentId: e.studentParentId,
            status: r < 0.85 ? 'PRESENT' : 'ABSENT',
          },
        })
        attendanceRows++
      }
    }

    const upcoming = sessions.filter(s => s.date >= today && s.status === 'SCHEDULED').length
    console.log(
      `✓ "${cls.title}": +${toCreate.length} buổi (${upcoming} tương lai, ${completed} đã học${cancelledOne ? ', 1 nghỉ demo' : ''}, ${attendanceRows} dòng điểm danh)`,
    )
  }

  // ===== Demo danh sách chờ: lớp đã đủ sĩ số =====
  const fullClasses = await db.groupClass.findMany({
    where: { status: 'OPEN' },
    include: { enrollments: true },
  })
  let waitlistAdded = 0
  for (const cls of fullClasses) {
    const approved = cls.enrollments.filter(e => e.status === 'APPROVED').length
    if (approved < cls.capacity) continue // chỉ lớp ĐÃ ĐỦ sĩ số

    const students = await db.user.findMany({
      where: {
        role: 'STUDENT',
        id: { notIn: cls.enrollments.map(e => e.studentParentId) },
      },
      take: 2,
      orderBy: { createdAt: 'asc' },
    })
    for (const [i, st] of students.entries()) {
      const exists = await db.classEnrollment.findFirst({
        where: { classId: cls.id, studentParentId: st.id },
      })
      if (exists) continue
      await db.classEnrollment.create({
        data: {
          classId: cls.id,
          studentParentId: st.id,
          studentName: null,
          note: i === 0 ? 'Cho con xin 1 chỗ ạ, lớp gần nhà quá!' : null,
          status: 'WAITLIST',
          createdAt: new Date(Date.now() - (i + 1) * 86400000 * 2),
        },
      })
      waitlistAdded++
    }
    if (students.length > 0) {
      console.log(`✓ Danh sách chờ demo cho "${cls.title}" (đủ ${approved}/${cls.capacity}): +${students.length} người chờ`)
    }
  }

  console.log(`\n✅ Backfill hoàn tất! (+${waitlistAdded} đăng ký danh sách chờ demo)`)
}

run()
  .catch(e => {
    console.error('Backfill lỗi:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
