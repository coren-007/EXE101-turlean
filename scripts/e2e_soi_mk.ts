import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const mk = await db.classSession.findMany({ where: { makeupForId: { not: null } }, select: { date: true, startTime: true, endTime: true, status: true, note: true, makeupForId: true, classId: true } })
  console.log(JSON.stringify(mk, null, 1))
}
main().finally(() => db.$disconnect())
