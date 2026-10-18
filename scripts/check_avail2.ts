import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  // Đa dạng khung giờ theo tutor
  const tutors = await db.user.findMany({ where: { role: 'TUTOR' }, select: { id: true, name: true, availabilities: true }, take: 8 })
  for (const t of tutors) {
    const days = t.availabilities.map(a => `${a.dayOfWeek}:${a.startTime}-${a.endTime}`).join(' ')
    console.log(t.name.padEnd(22), '|', days)
  }
  // Có tutor nào KHÔNG rảnh buổi sáng (05-11h) ngày nào không?
  const all = await db.user.findMany({ where: { role: 'TUTOR' }, select: { name: true, availabilities: true } })
  const noMorning = all.filter(t => !t.availabilities.some(a => a.startTime < '11:00' && a.endTime > '05:00'))
  const noEvening = all.filter(t => !t.availabilities.some(a => a.startTime < '22:30' && a.endTime > '17:00'))
  const noSat = all.filter(t => !t.availabilities.some(a => a.dayOfWeek === 6))
  console.log('Không có sáng nào:', noMorning.length, '| Không có tối nào:', noEvening.length, '| Không rảnh T7:', noSat.length)
}
main().then(() => db.$disconnect())
