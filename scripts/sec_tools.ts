// scripts/sec_tools.ts — công cụ DB cho bộ test xác minh bảo mật (verify Bảng 2).
// Chạy: bun run scripts/sec_tools.ts <cmd> [args]
//   snapshot                 — chọn ngày D (today+5..+16) nhiều buổi SCHEDULED nhất,
//                              không trùng holiday; lưu snapshot để restore sau test
//   shift <bookingId>        — đưa booking về 3 ngày trước (mô phỏng thời gian trôi)
//                              cho test PATCH PENDING → COMPLETED
//   countcxl <bookingId>     — đếm bản ghi Cancellation của booking (test hủy 2 lần)
//   verify-holiday <name>    — đếm buổi bị hủy theo ngày lễ test + chủ lớp (cross-tenant)
//   verify-class <classId>   — in capacity vs số APPROVED thực tế (test race sĩ số)
//   cleanup                  — phục hồi DB demo về trạng thái trước test (dựa snapshot)
import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const db = new PrismaClient()
const SNAP_PATH = 'scripts/logs/sec_snapshot.json'

function iso(off = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + off)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function main() {
  const cmd = process.argv[2]

  if (cmd === 'snapshot') {
    const holidays = await db.holiday.findMany({ select: { date: true } })
    const holidayDates = new Set(holidays.map(h => h.date))
    let best: { date: string; n: number } | null = null
    for (let off = 5; off <= 16; off++) {
      const d = iso(off)
      if (holidayDates.has(d)) continue
      const n = await db.classSession.count({ where: { date: d, status: 'SCHEDULED' } })
      if (!best || n > best.n) best = { date: d, n }
    }
    if (!best || best.n === 0) {
      console.log(JSON.stringify({ error: 'Không tìm thấy ngày nào có buổi SCHEDULED' }))
      return
    }
    const sessions = await db.classSession.findMany({
      where: { date: best.date },
      select: { id: true, status: true, note: true, classId: true, class: { select: { tutorId: true, title: true } } },
    })
    const messages = await db.message.findMany({ select: { id: true } })
    const conversations = await db.conversation.findMany({ select: { id: true, lastMessageAt: true } })
    const snap = {
      runAt: new Date().toISOString(),
      date: best.date,
      scheduledBefore: best.n,
      sessions: sessions.map(s => ({ id: s.id, status: s.status, note: s.note })),
      messageIds: messages.map(m => m.id),
      conversations: conversations.map(c => ({ id: c.id, lastMessageAt: c.lastMessageAt.toISOString() })),
    }
    fs.writeFileSync(SNAP_PATH, JSON.stringify(snap))
    const tutors = new Set(sessions.map(s => s.class.tutorId))
    console.log(`Ngày D=${best.date} | SCHEDULED=${best.n} | lớp thuộc ${tutors.size} gia sư khác nhau`)
    console.log(`Snapshot: ${sessions.length} buổi, ${messages.length} tin nhắn, ${conversations.length} hội thoại`)
    console.log('SEC_SNAP=' + JSON.stringify({ date: best.date, scheduled: best.n, tutors: tutors.size }))
  }

  else if (cmd === 'shift') {
    const id = process.argv[3]
    const b = await db.booking.findUnique({ where: { id } })
    if (!b) { console.log('NOT_FOUND'); return }
    await db.booking.update({ where: { id }, data: { date: iso(-3) } })
    console.log(`SHIFTED ${id}: ${b.date} → ${iso(-3)} (giờ giữ nguyên)`)
  }

  else if (cmd === 'countcxl') {
    const id = process.argv[3]
    const n = await db.cancellation.count({ where: { bookingId: id } })
    console.log('SEC_CXL=' + JSON.stringify({ bookingId: id, cancellations: n }))
  }

  else if (cmd === 'verify-holiday') {
    const name = process.argv[3]
    const snap = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'))
    const rows = await db.classSession.findMany({
      where: { date: snap.date, status: 'CANCELLED', note: { contains: name } },
      include: { class: { select: { tutorId: true, title: true, tutor: { select: { name: true } } } } },
    })
    const tutors = new Set(rows.map(r => r.class.tutorId))
    console.log(`Buổi bị hủy bởi lễ "${name}" trên ${snap.date}: ${rows.length} buổi, thuộc ${tutors.size} gia sư`)
    const names = [...new Set(rows.map(r => r.class.tutor.name))].slice(0, 8)
    console.log('SEC_HOL=' + JSON.stringify({ cancelled: rows.length, distinctTutors: tutors.size, tutorNames: names }))
  }

  else if (cmd === 'verify-class') {
    const id = process.argv[3]
    const cls = await db.groupClass.findUnique({
      where: { id },
      include: { enrollments: { select: { id: true, status: true } } },
    })
    if (!cls) { console.log('NOT_FOUND'); return }
    const approved = cls.enrollments.filter(e => e.status === 'APPROVED').length
    console.log('SEC_CLASS=' + JSON.stringify({ classId: id, capacity: cls.capacity, approved, overflow: approved - cls.capacity }))
  }

  else if (cmd === 'purge-classes') {
    const d = await db.groupClass.deleteMany({ where: { title: { startsWith: 'SEC Race' } } })
    console.log(`SEC classes purged: ${d.count} (cascade slot/session/attendance/enrollment/fee)`)
  }

  else if (cmd === 'emails') {
    const us = await db.user.findMany({ where: { email: { startsWith: 'sec.' } }, select: { email: true, role: true } })
    console.log('SEC_EMAILS=' + JSON.stringify(us))
  }

  else if (cmd === 'cleanup') {
    const snap = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'))
    const log: string[] = []

    // 1. Phục hồi trạng thái các buổi trên ngày D
    let restored = 0
    for (const s of snap.sessions) {
      const r = await db.classSession.update({
        where: { id: s.id },
        data: { status: s.status, note: s.note },
      }).catch(() => null)
      if (r) restored++
    }
    log.push(`phục hồi buổi ngày ${snap.date}: ${restored}/${snap.sessions.length}`)

    // 2. Xóa holiday test (theo ngày D + phòng hờ theo tên SEC)
    const h = await db.holiday.deleteMany({ where: { OR: [{ date: snap.date }, { name: { startsWith: 'SEC' } }] } })
    log.push(`holiday test xóa: ${h.count}`)

    // 3. Xóa SYSTEM message sinh trong lúc test (không có trong snapshot)
    const m = await db.message.deleteMany({
      where: { kind: 'SYSTEM', createdAt: { gt: new Date(snap.runAt) }, id: { notIn: snap.messageIds } },
    })
    log.push(`SYSTEM message test xóa: ${m.count}`)

    // 4. Xóa hội thoại mới sinh giữa 2 user thật (không có trong snapshot)
    const c = await db.conversation.deleteMany({ where: { id: { notIn: snap.conversations.map((x: any) => x.id) } } })
    log.push(`hội thoại test xóa: ${c.count}`)

    // 5. Trả lastMessageAt về như cũ
    let convFixed = 0
    for (const cv of snap.conversations) {
      const r = await db.conversation.update({
        where: { id: cv.id },
        data: { lastMessageAt: new Date(cv.lastMessageAt) },
      }).catch(() => null)
      if (r) convFixed++
    }
    log.push(`lastMessageAt khôi phục: ${convFixed}`)

    // 6. Xóa toàn bộ user test (sec.*) — teardown FK đầy đủ
    const secUsers = await db.user.findMany({ where: { email: { startsWith: 'sec.' } }, select: { id: true, email: true } })
    for (const u of secUsers) {
      await db.groupClass.deleteMany({ where: { tutorId: u.id } }) // cascade slot/session/attendance/enrollment/fee
      await db.review.deleteMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] } })
      await db.cancellation.deleteMany({ where: { booking: { OR: [{ tutorId: u.id }, { studentId: u.id }] } } })
      await db.booking.deleteMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] } })
      await db.favorite.deleteMany({ where: { OR: [{ userId: u.id }, { tutorId: u.id }] } })
      await db.classEnrollment.deleteMany({ where: { studentParentId: u.id } })
      await db.classFeePayment.deleteMany({ where: { studentParentId: u.id } })
      await db.verificationRequest.deleteMany({ where: { tutorId: u.id } })
      const convs = await db.conversation.findMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] }, select: { id: true } })
      for (const cv of convs) {
        await db.message.deleteMany({ where: { conversationId: cv.id } })
        await db.conversation.delete({ where: { id: cv.id } }).catch(() => {})
      }
      await db.message.deleteMany({ where: { senderId: u.id } })
      await db.session.deleteMany({ where: { userId: u.id } })
      await db.user.delete({ where: { id: u.id } }).catch(() => {})
      log.push(`đã xóa user ${u.email}`)
    }

    // 7. Đối chiếu cuối
    const [users, bookings, cancels, msgs, sess] = await Promise.all([
      db.user.count(),
      db.booking.count(),
      db.cancellation.count(),
      db.message.count(),
      db.classSession.count({ where: { date: snap.date, status: 'SCHEDULED' } }),
    ])
    console.log(log.join('\n'))
    console.log(`\nSau cleanup: users=${users} bookings=${bookings} cancellations=${cancels} messages=${msgs}`)
    console.log(`Ngày ${snap.date}: SCHEDULED=${sess}/${snap.scheduledBefore} (mong đợi = ${snap.scheduledBefore})`)
    console.log('SEC_CLEANUP_DONE')
  }

  else {
    console.log('Dùng: snapshot | shift <bookingId> | countcxl <bookingId> | verify-holiday <name> | verify-class <classId> | cleanup')
  }
}

main().finally(() => db.$disconnect())
