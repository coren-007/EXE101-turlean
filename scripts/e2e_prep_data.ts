// Chuẩn bị dữ liệu cho E2E browser chi tiết:
// 1. Tính slot trống cho booking đơn lẻ (CN 18/10) + khóa định kỳ (T7 24/10 x4) của hoa × minhanh
// 2. Tạo booking COMPLETED (hoa × sarah) chưa review để test UI đánh giá
// 3. Ghi scripts/e2e_data.json cho driver Python đọc
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
const db = new PrismaClient()

function nextSaturday(from: Date): Date {
  const d = new Date(from)
  const add = (6 - d.getDay() + 7) % 7 || 7 // thứ 7 tới (dayOfWeek 6)
  d.setDate(d.getDate() + add)
  return d
}
function nextSunday(from: Date): Date {
  const d = new Date(from)
  const add = (0 - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + add)
  return d
}
const fmt = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

async function main() {
  const minhanh = await db.user.findUniqueOrThrow({ where: { email: 'minhanh.tutor@example.com' }, select: { id: true } })
  const hoa = await db.user.findUniqueOrThrow({ where: { email: 'hoa.parent@example.com' }, select: { id: true } })
  const sarah = await db.user.findUniqueOrThrow({ where: { email: 'sarah.tutor@example.com' }, select: { id: true } })
  const ielts = await db.subject.findFirstOrThrow({ where: { name: 'IELTS' }, select: { id: true } })

  const now = new Date()
  const yd = new Date(now.getTime() - 864e5)
  const yesterday = fmt(yd)
  const sun = fmt(nextSunday(now))     // booking đơn lẻ — CN, avail 08:00-20:00
  const sat = fmt(nextSaturday(now))   // series 4 tuần — T7, avail 18:00-21:00

  // Thu thập booking hiện có của minhanh + hoa trong 6 tuần tới
  const dates = new Set<string>([sun])
  const satD = nextSaturday(now)
  for (let i = 0; i < 4; i++) { dates.add(fmt(satD)); satD.setDate(satD.getDate() + 7) }
  const busyTutor = await db.booking.findMany({
    where: { tutorId: minhanh.id, date: { in: [...dates] }, status: { in: ['PENDING', 'CONFIRMED'] } },
    select: { date: true, startTime: true, durationHours: true },
  })
  const busyStudent = await db.booking.findMany({
    where: { studentId: hoa.id, date: { in: [...dates] }, status: { in: ['PENDING', 'CONFIRMED'] } },
    select: { date: true, startTime: true, durationHours: true },
  })
  const overlap = (list: { date: string; startTime: string; durationHours: number }[], date: string, start: string, dur: number) =>
    list.some(b => b.date === date && {
      // so khung giờ
    }) // placeholder — tính dưới

  const overlaps = (b: { date: string; startTime: string; durationHours: number }, date: string, startH: number, dur: number): boolean => {
    if (b.date !== date) return false
    const [h, m] = b.startTime.split(':').map(Number)
    const bs = h + m / 60, be = bs + b.durationHours
    return bs < startH + dur && startH < be
  }

  // CN: slot 08:00 (1.5h) — avail 08:00-20:00
  const singleSlot = '08:00'
  const singleOK = ![...busyTutor, ...busyStudent].some(b => overlaps(b, sun, 8, 1.5))

  // T7: slot 18:00 (1.5h) x4 tuần
  const satDates: string[] = []
  const sd = nextSaturday(now)
  for (let i = 0; i < 4; i++) { satDates.push(fmt(sd)); sd.setDate(sd.getDate() + 7) }
  const seriesOK = satDates.every(d => ![...busyTutor, ...busyStudent].some(b => overlaps(b, d, 18, 1.5)))

  // Booking COMPLETED cho review test (hoa × sarah, quá khứ, chưa review)
  const oldReview = await db.review.findFirst({ where: { tutorId: sarah.id, studentId: hoa.id } })
  const reviewBooking = await db.booking.create({
    data: {
      tutorId: sarah.id, studentId: hoa.id, subjectId: ielts.id,
      date: yesterday, startTime: '09:00', endTime: '10:30', durationHours: 1.5,
      mode: 'ONLINE', status: 'COMPLETED', totalAmount: 450000,
      note: 'E2E review test',
    },
  })

  // Lớp Toán 12 của minhanh — buổi TỚI để test nghỉ/dạy bù (chọn 1 buổi >= mai)
  const toan12 = await db.groupClass.findFirst({
    where: { tutorId: minhanh.id, status: 'OPEN' },
    select: { id: true, title: true },
  })
  // Buổi target dạy bù: SCHEDULED, chưa là buổi bù, và CHƯA bị dời (không xuất hiện trong makeupForId nào)
  const existingMakeups = await db.classSession.findMany({ where: { makeupForId: { not: null } }, select: { makeupForId: true } })
  const rescheduledIds = new Set(existingMakeups.map((m) => m.makeupForId!))
  let futureSession: { id: string; date: string; startTime: string; endTime: string } | null = null
  if (toan12) {
    const cands = await db.classSession.findMany({
      where: { classId: toan12.id, status: 'SCHEDULED', makeupForId: null, date: { gte: fmt(new Date(now.getTime() + 864e5)) } },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, startTime: true, endTime: true },
    })
    futureSession = cands.find((c) => !rescheduledIds.has(c.id)) ?? null
  }

  const data = {
    single: { date: sun, slot: singleSlot, ok: singleOK },
    series: { dates: satDates, slot: '18:00', ok: seriesOK },
    review: { bookingId: reviewBooking.id, tutorId: sarah.id, hadOldReview: !!oldReview },
    makeup: toan12 && futureSession ? { classId: toan12.id, className: toan12.title, sessionId: futureSession.id, date: futureSession.date, startTime: futureSession.startTime, endTime: futureSession.endTime } : null,
    users: { minhanhId: minhanh.id, hoaId: hoa.id },
  }
  fs.writeFileSync('/home/z/my-project/scripts/e2e_data.json', JSON.stringify(data, null, 1))
  console.log(JSON.stringify(data, null, 1))
}
main().finally(() => db.$disconnect())
