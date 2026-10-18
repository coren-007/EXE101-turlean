import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const subs = await db.subject.findMany({ select: { id: true, name: true } })
  const sarahSubs = await db.tutorSubject.findMany({ where: { tutor: { email: 'sarah.tutor@example.com' } }, select: { subject: { select: { id: true, name: true } } } })
  console.log(JSON.stringify({ all: subs.slice(0, 12), sarahSubs }))
}
main().finally(() => db.$disconnect())
