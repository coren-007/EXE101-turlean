// Dọn toàn bộ dữ liệu E2E browser — trả DB demo về trạng thái chuẩn.
// Chạy: bun run scripts/e2e_cleanup.ts
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
const db = new PrismaClient()

async function main() {
  const log: string[] = []

  // 1. Booking review test (hoa × sarah, note 'E2E review test') + review của nó
  const rvBookings = await db.booking.findMany({ where: { note: 'E2E review test' }, select: { id: true } })
  for (const b of rvBookings) {
    await db.review.deleteMany({ where: { bookingId: b.id } })
    await db.cancellation.deleteMany({ where: { bookingId: b.id } })
    await db.booking.deleteMany({ where: { id: b.id } })
  }
  log.push(`review-test bookings xóa: ${rvBookings.length}`)

  // 2. Booking E2E của hoa × minhanh (đơn CN + series T7 x4) — mọi trạng thái
  // Ngày ĐỘNG theo prep (nextSunday/nextSaturday tính lại lúc dọn) + lịch sử cũ để an toàn
  function nextSaturday(from: Date): Date {
    const d = new Date(from)
    const add = (6 - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + add)
    return d
  }
  function nextSunday(from: Date): Date {
    const d = new Date(from)
    const add = (0 - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + add)
    return d
  }
  const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const dynDates: string[] = [fmtD(nextSunday(new Date()))]
  const satD = nextSaturday(new Date())
  for (let i = 0; i < 4; i++) { dynDates.push(fmtD(satD)); satD.setDate(satD.getDate() + 7) }
  const e2eDates = [...new Set([...dynDates, '2026-10-18', '2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14'])]
  const minhanh = await db.user.findUnique({ where: { email: 'minhanh.tutor@example.com' }, select: { id: true } })
  const hoa = await db.user.findUnique({ where: { email: 'hoa.parent@example.com' }, select: { id: true } })
  const testBookings = await db.booking.findMany({
    where: { tutorId: minhanh!.id, studentId: hoa!.id, date: { in: e2eDates } },
    select: { id: true, status: true },
  })
  for (const b of testBookings) {
    await db.review.deleteMany({ where: { bookingId: b.id } })
    await db.cancellation.deleteMany({ where: { bookingId: b.id } })
    await db.booking.deleteMany({ where: { id: b.id } })
  }
  log.push(`booking E2E xóa: ${testBookings.length}`)

  // 3. Revert series demo (T4 18:30 từ 28/10) về PENDING nếu bị confirm trong E2E
  const demoSeries = await db.booking.findMany({
    where: { tutorId: minhanh!.id, studentId: hoa!.id, startTime: '18:30', date: { gte: new Date().toISOString().slice(0, 10) }, status: { not: 'PENDING' } },
    select: { id: true },
  })
  if (demoSeries.length) {
    await db.booking.updateMany({ where: { id: { in: demoSeries.map((b) => b.id) } }, data: { status: 'PENDING' } })
  }
  log.push(`series demo revert về PENDING: ${demoSeries.length}`)

  // 4. Makeup E2E — dò theo NỘI DUNG (không phụ thuộc e2e_data.json bị prep ghi đè):
  //    buổi bù có note "Dạy bù cho buổi ... (E2E: ...)" → xóa + trả buổi gốc SCHEDULED
  const e2eMakeups = await db.classSession.findMany({
    where: { note: { contains: '(E2E:' }, makeupForId: { not: null } },
    select: { id: true, makeupForId: true },
  })
  for (const m of e2eMakeups) {
    await db.classAttendance.deleteMany({ where: { sessionId: m.id } })
    await db.classSession.delete({ where: { id: m.id } })
    if (m.makeupForId) {
      await db.classSession.update({ where: { id: m.makeupForId }, data: { status: 'SCHEDULED', note: null } }).catch(() => {})
    }
  }
  if (e2eMakeups.length) log.push(`makeup E2E dọn: ${e2eMakeups.length}`)

  // 4b. Buổi bù seed 26/10 (của buổi 20/10) có thể bị luồng Dời di chuyển → trả về 26/10
  const seedMk = await db.classSession.updateMany({
    where: { makeupForId: 'cmvcexzrm000amhczb30o91jn', date: { not: '2026-10-26' } },
    data: { date: '2026-10-26', startTime: '18:00', endTime: '20:30', note: 'Dạy bù cho buổi 20/10/2026 (test nghỉ buổi có bù)' },
  })
  if (seedMk.count) log.push(`buổi bù seed 26/10 khôi phục: ${seedMk.count}`)
  // 4c. thuha: request bị E2E từ chối → trả PENDING (trạng thái demo chuẩn)
  const th = await db.verificationRequest.updateMany({
    where: { tutor: { email: 'thuha.tutor@example.com' }, status: { not: 'PENDING' } },
    data: { status: 'PENDING', reviewNote: null, reviewedAt: null },
  })
  if (th.count) log.push(`thuha reset PENDING: ${th.count}`)

  // 5. Verification request E2E của minhanh
  const vr = await db.verificationRequest.deleteMany({ where: { fileName: 'e2e_degree.png' } })
  log.push(`verification e2e_degree xóa: ${vr.count}`)

  // 6. Throwaway users (booking/cancellation/favorite/session/review/conversation FK trước)
  for (const email of ['e2e.student@example.com', 'e2e.tutor@example.com']) {
    const u = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (!u) continue
    await db.review.deleteMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] } })
    await db.cancellation.deleteMany({ where: { booking: { OR: [{ tutorId: u.id }, { studentId: u.id }] } } })
    await db.booking.deleteMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] } })
    await db.favorite.deleteMany({ where: { OR: [{ userId: u.id }, { tutorId: u.id }] } })
    await db.classEnrollment.deleteMany({ where: { studentParentId: u.id } })
    await db.classFeePayment.deleteMany({ where: { enrollment: { studentParentId: u.id } } })
    await db.verificationRequest.deleteMany({ where: { tutorId: u.id } })
    // hội thoại + tin nhắn của throwaway
    const convs = await db.conversation.findMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] }, select: { id: true } })
    for (const c of convs) {
      await db.message.deleteMany({ where: { conversationId: c.id } })
      await db.conversation.delete({ where: { id: c.id } })
    }
    await db.session.deleteMany({ where: { userId: u.id } })
    await db.user.delete({ where: { id: u.id } })
    log.push(`đã xóa user ${email}`)
  }

  // 7. Favorite hoa → minhanh nếu còn
  const fav = await db.favorite.deleteMany({ where: { userId: hoa!.id, tutorId: minhanh!.id } })
  log.push(`favorite hoa→minhanh xóa: ${fav.count}`)

  // 8. Review E2E của hoa cho sarah (nếu gửi thành công)
  const rv2 = await db.review.deleteMany({ where: { studentId: hoa!.id, comment: { startsWith: 'Cô dạy nhiệt tình' } } })
  log.push(`review E2E xóa: ${rv2.count}`)

  // 9. Tin nhắn E2E trong hội thoại hoa↔minhanh (2 chiều)
  const msg1 = await db.message.deleteMany({ where: { body: { startsWith: 'Chào cô, cháu xác nhận buổi học sáng' } } })
  const msg2 = await db.message.deleteMany({ where: { body: { startsWith: 'Cô đã nhận được lịch' } } })
  log.push(`tin nhắn E2E xóa: ${msg1.count + msg2.count}`)

  // 10. AdminActionLog sinh bởi các run E2E (unlock/verify của e2e.student/thuha/e2e_degree) —
  // seed không tạo log nào nên xóa hết cho demo sạch + lần chạy sau verify đúng log MỚI
  const alog = await db.adminActionLog.deleteMany({})
  log.push(`audit log E2E xóa: ${alog.count}`)

  // 11. Cancellation do CÁC SUITE TEST API tạo cho user demo (test_booking/phase/repeatweeks
  //     hủy booking thật của minhanh/hoa/hoanglong... mỗi lần chạy) — mỗi lần -10 điểm
  //     reliability, tích lũy làm user demo bị TỰ KHÓA (điểm < 30) giữa chừng các đợt
  //     regression sau. Seed KHÔNG tạo cancellation nào (khảo sát 81 rows đều sinh trong
  //     ngày test) nên dọn sạch own-cancellation của user demo là an toàn.
  const DEMO_EMAILS = [
    'minhanh.tutor@example.com', 'hoa.parent@example.com', 'hoanglong.tutor@example.com',
    'hongnhung.tutor@example.com', 'minhtam.parent@example.com', 'thanhhha.parent@example.com',
    'sarah.tutor@example.com', 'thuha.tutor@example.com',
  ]
  const demoUsers = await db.user.findMany({ where: { email: { in: DEMO_EMAILS } }, select: { id: true, email: true } })
  let cancelCleaned = 0
  for (const du of demoUsers) {
    const rows = await db.cancellation.findMany({
      where: { booking: { OR: [{ tutorId: du.id }, { studentId: du.id }] } },
      select: { id: true, cancelledBy: true, booking: { select: { tutorId: true, studentId: true } } },
    })
    const own = rows.filter(r => (r.cancelledBy === 'TUTOR' ? r.booking.tutorId : r.booking.studentId) === du.id)
    if (own.length) {
      await db.cancellation.deleteMany({ where: { id: { in: own.map(r => r.id) } } })
      cancelCleaned += own.length
    }
  }
  if (cancelCleaned) log.push(`cancellation test-suite dọn (chống tự khóa reliability): ${cancelCleaned}`)

  // 12. User throwaway do CÁC SUITE TEST API tạo nhưng không tự dọn (repeat.*,
  //     booking.test*, secfix.*) — booking sót lại chiếm slot làm browser E2E
  //     đặt khóa định kỳ 4 buổi chỉ tạo được 2/4 (conflict slot). Dọn theo prefix email.
  const TEST_PREFIXES = ['repeat.', 'booking.test', 'secfix.', 'e2e-ui.', 'race.', 'mkc2.']
  const leftovers = await db.user.findMany({
    where: { email: { startsWith: TEST_PREFIXES[0] } },
    select: { id: true },
  })
  // Prisma không hỗ trợ OR-startsWith trực tiếp trong findMany where email — dò từng prefix
  for (const p of TEST_PREFIXES.slice(1)) {
    const more = await db.user.findMany({ where: { email: { startsWith: p } }, select: { id: true } })
    leftovers.push(...more)
  }
  let userCleaned = 0
  for (const u of leftovers) {
    await db.review.deleteMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] } })
    await db.cancellation.deleteMany({ where: { booking: { OR: [{ tutorId: u.id }, { studentId: u.id }] } } })
    await db.booking.deleteMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] } })
    await db.favorite.deleteMany({ where: { OR: [{ userId: u.id }, { tutorId: u.id }] } })
    await db.classEnrollment.deleteMany({ where: { studentParentId: u.id } })
    await db.classFeePayment.deleteMany({ where: { enrollment: { studentParentId: u.id } } })
    await db.verificationRequest.deleteMany({ where: { tutorId: u.id } })
    const convs = await db.conversation.findMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] }, select: { id: true } })
    for (const c of convs) {
      await db.message.deleteMany({ where: { conversationId: c.id } })
      await db.conversation.delete({ where: { id: c.id } })
    }
    await db.session.deleteMany({ where: { userId: u.id } })
    await db.user.delete({ where: { id: u.id } }).catch(() => {})
    userCleaned++
  }
  if (userCleaned) log.push(`user throwaway suite-test dọn: ${userCleaned}`)

  const [users, bookings, cancels, vrc] = await Promise.all([
    db.user.count(),
    db.booking.count(),
    db.cancellation.count(),
    db.verificationRequest.count(),
  ])
  console.log(log.join('\n'))
  console.log(`\nSau dọn: users=${users} bookings=${bookings} cancels=${cancels} verification=${vrc}`)
}
main().finally(() => db.$disconnect())
