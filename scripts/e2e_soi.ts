import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const vr = await db.verificationRequest.findMany({ select: { fileName: true, status: true, tutor: { select: { email: true } } }, orderBy: { createdAt: 'asc' } })
  const e2eB = await db.booking.findMany({ where: { OR: [{ note: { contains: 'E2E' } }] }, select: { date: true, note: true, status: true } })
  const users = await db.user.findMany({ where: { email: { contains: 'e2e.' } }, select: { email: true } })
  console.log(JSON.stringify({ vr, e2eB, users }, null, 1))
}
main().finally(() => db.$disconnect())
