import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

// Reliability = 100 - tổng points trừ (từ Cancellation qua Booking → tutor)
async function main() {
  const [users, tutors, students, bookings, vr, cancels] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: 'TUTOR' } }),
    db.user.count({ where: { role: 'STUDENT' } }),
    db.booking.count(),
    db.verificationRequest.count(),
    db.cancellation.count(),
  ])
  const byStatus = await db.booking.groupBy({ by: ['status'], _count: true })
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { email: true } })
  const vrByStatus = await db.verificationRequest.groupBy({ by: ['status'], _count: true })
  const lockedUsers = await db.user.findMany({
    where: { lockedAt: { not: null } },
    select: { email: true, lockedReason: true },
  })

  const c = await db.cancellation.findMany({
    select: { points: true, booking: { select: { tutorId: true } } },
  })
  const rel: Record<string, number> = {}
  for (const x of c) rel[x.booking.tutorId] = (rel[x.booking.tutorId] ?? 100) - x.points
  // rel[tutorId] = 100 - tổng points trừ = reliability score
  const entries = Object.entries(rel).sort((a, b) => a[1] - b[1]).slice(0, 6)
  const lowRel = await Promise.all(
    entries.map(([tid, score]) =>
      db.user.findUnique({ where: { id: tid }, select: { email: true } }).then((u) => ({
        email: u?.email,
        reliability: score,
      })),
    ),
  )

  console.log(
    JSON.stringify(
      { users, tutors, students, bookings, cancels, byStatus, admin: admin?.email, vrByStatus, lockedUsers, lowRelTutors: lowRel },
      null,
      1,
    ),
  )
}
main().finally(() => db.$disconnect())
