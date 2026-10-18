import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const sess = await db.classSession.findMany({
    where: { classId: 'cmvcexzc40001mhb5fwmnkzba', date: { in: ['2026-10-20', '2026-10-22', '2026-10-26', '2026-10-27', '2026-10-30'] } },
    orderBy: { date: 'asc' },
    select: { id: true, date: true, startTime: true, status: true, note: true, makeupForId: true },
  })
  const att = await db.classAttendance.findMany({ where: { session: { date: { in: ['2026-10-30', '2026-10-26'] } } }, select: { sessionId: true } })
  console.log(JSON.stringify({ sess, attendance: att }, null, 1))
}
main().finally(() => db.$disconnect())
