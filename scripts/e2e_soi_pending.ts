import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const p = await db.booking.findMany({
    where: { status: 'PENDING' },
    select: { date: true, startTime: true, status: true, note: true, tutor: { select: { email: true } }, student: { select: { email: true } }, review: { select: { id: true } }, createdAt: true },
    orderBy: { date: 'asc' },
  })
  console.log(JSON.stringify(p, null, 1))
}
main().finally(() => db.$disconnect())
