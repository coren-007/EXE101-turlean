// scripts/alock_tools.ts — công cụ DB cho bộ test khóa tay + rà soát tự khóa (P6 hardening).
// Chạy: bun run scripts/alock_tools.ts <cmd> [args]
//   setup <tutorEmail> <studentEmail>
//       — tạo admin2 (role ADMIN — target cho guard "không khóa được admin")
//       — fabricate 8 booking PENDING + 8 cancellation (8 × 10 điểm) cho tutor
//         ⇒ score = 20 < 30 nhưng KHÔNG bị khóa (mô phỏng dữ liệu rơi dưới ngưỡng
//         qua con đường ngoài luồng hủy — đúng use case của sweep)
//       — in JSON {tutorId, studentId, admin2Id, logSince}
//   verify <email>      — in JSON {locked, lockedReason, score}
//   logs <sinceISO>     — in JSON mảng AdminActionLog createdAt > since (test tự lọc)
//   cleanup <tutorEmail> <studentEmail> <admin2Email> <sinceISO>
//       — xóa AdminActionLog tạo trong cửa sổ test + cancellations + bookings + 3 user
//       — in JSON {deleted}
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const [cmd, ...args] = process.argv.slice(2)

async function findUser(email: string) {
  return db.user.findUnique({ where: { email }, select: { id: true, name: true, role: true, lockedAt: true, lockedReason: true } })
}

async function scoreOf(userId: string): Promise<number> {
  const rows = await db.cancellation.findMany({
    where: { booking: { OR: [{ tutorId: userId }, { studentId: userId }] } },
    select: { points: true, cancelledBy: true, booking: { select: { tutorId: true, studentId: true } } },
  })
  const own = rows.filter(r => (r.booking.tutorId === userId ? r.cancelledBy === 'TUTOR' : r.cancelledBy === 'STUDENT'))
  return Math.max(0, 100 - own.reduce((s, r) => s + r.points, 0))
}

if (cmd === 'setup') {
  const [tutorEmail, studentEmail] = args
  const ts = Date.now().toString().slice(-6)
  const logSince = new Date()

  const admin2 = await db.user.create({
    data: {
      email: `alock.admin2.${ts}@example.com`,
      passwordHash: 'dummy-not-for-login',
      name: 'ALock Admin 2',
      role: 'ADMIN',
    },
    select: { id: true },
  })

  const tutor = await findUser(tutorEmail!)
  const student = await findUser(studentEmail!)
  if (!tutor || !student) throw new Error(`Không tìm thấy user test: ${tutorEmail} / ${studentEmail}`)

  // 1 môn thật cho booking
  const subject = await db.subject.findFirst({ select: { id: true } })
  if (!subject) throw new Error('DB không có Subject nào')

  // 8 booking + 8 cancellation × 10 điểm = -80 ⇒ score 20 (< 30, chưa khóa)
  const FUTURE_YEAR = new Date().getFullYear() + 1
  for (let i = 0; i < 8; i++) {
    const b = await db.booking.create({
      data: {
        studentId: student.id,
        tutorId: tutor.id,
        subjectId: subject.id,
        mode: 'ONLINE',
        date: `${FUTURE_YEAR}-01-${String(10 + i).padStart(2, '0')}`,
        startTime: '05:00',
        endTime: '06:00',
        durationHours: 1,
        status: 'PENDING',
        totalAmount: 100000,
      },
      select: { id: true },
    })
    await db.cancellation.create({
      data: {
        bookingId: b.id,
        cancelledBy: 'TUTOR',
        reason: 'fabricated by alock_tools (sweep test)',
        bookingStatus: 'CONFIRMED',
        hoursBefore: 48,
        severity: 'WARNING',
        points: 10,
      },
    })
  }

  console.log(JSON.stringify({
    tutorId: tutor.id,
    studentId: student.id,
    admin2Id: admin2.id,
    admin2Email: `alock.admin2.${ts}@example.com`,
    logSince: logSince.toISOString(),
    score: await scoreOf(tutor.id),
  }))
} else if (cmd === 'verify') {
  const u = await findUser(args[0]!)
  if (!u) throw new Error('Không tìm thấy user: ' + args[0])
  console.log(JSON.stringify({
    email: args[0],
    locked: !!u.lockedAt,
    lockedReason: u.lockedReason,
    score: await scoreOf(u.id),
  }))
} else if (cmd === 'logs') {
  const since = new Date(args[0]!)
  const logs = await db.adminActionLog.findMany({
    where: { createdAt: { gt: since } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, action: true, targetType: true, targetId: true, meta: true, createdAt: true },
  })
  console.log(JSON.stringify(logs))
} else if (cmd === 'cleanup') {
  const [tutorEmail, studentEmail, admin2Email, sinceISO] = args
  const ids: string[] = []
  for (const e of [tutorEmail!, studentEmail!, admin2Email!]) {
    const u = await findUser(e)
    if (u) ids.push(u.id)
  }
  const since = new Date(sinceISO!)
  const delLogs = await db.adminActionLog.deleteMany({ where: { createdAt: { gt: since } } })
  const delCx = await db.cancellation.deleteMany({
    where: { booking: { OR: [{ tutorId: { in: ids } }, { studentId: { in: ids } }] } },
  })
  const delBk = await db.booking.deleteMany({ where: { OR: [{ tutorId: { in: ids } }, { studentId: { in: ids } }] } })
  let delUsers = 0
  for (const id of ids) {
    await db.user.delete({ where: { id } }).catch(() => {})
    delUsers++
  }
  console.log(JSON.stringify({ deleted: { logs: delLogs.count, cancellations: delCx.count, bookings: delBk.count, users: delUsers } }))
} else {
  console.error('Dùng: setup <tutorEmail> <studentEmail> | verify <email> | logs <sinceISO> | cleanup <tutorEmail> <studentEmail> <admin2Email> <sinceISO>')
}

await db.$disconnect()
