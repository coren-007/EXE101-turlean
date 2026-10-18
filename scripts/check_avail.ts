import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const total = await db.availability.count()
  const byDay = await db.availability.groupBy({ by: ['dayOfWeek'], _count: true, orderBy: { dayOfWeek: 'asc' } })
  const sample = await db.availability.findMany({ take: 8, orderBy: { tutorId: 'asc' } })
  console.log('TOTAL:', total)
  console.log('BY DAY:', JSON.stringify(byDay))
  console.log('SAMPLE:', JSON.stringify(sample.map(s => ({ d: s.dayOfWeek, s: s.startTime, e: s.endTime })), null, 1))
}
main().then(() => db.$disconnect())
