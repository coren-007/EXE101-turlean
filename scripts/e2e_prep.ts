import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const minhanh = await db.user.findUnique({ where: { email: 'minhanh.tutor@example.com' }, select: { id: true, name: true, isVerified: true } })
  const avail = await db.availability.findMany({ where: { tutorId: minhanh!.id }, select: { dayOfWeek: true, startTime: true, endTime: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] })
  const pending = await db.booking.findMany({ where: { status: 'PENDING' }, select: { id: true, tutor: { select: { name: true } }, student: { select: { name: true } }, date: true, startTime: true, durationHours: true } })
  const hoa = await db.user.findUnique({ where: { email: 'hoa.parent@example.com' }, select: { id: true } })
  const hoaCompleted = await db.booking.findMany({
    where: { studentId: hoa!.id, status: 'COMPLETED' },
    select: { id: true, date: true, tutor: { select: { id: true, name: true } }, review: { select: { id: true } } },
    orderBy: { date: 'desc' }, take: 12,
  })
  const favs = await db.favorite.findMany({ where: { userId: hoa!.id }, select: { tutor: { select: { name: true } } } })
  const hoaPending = await db.booking.findMany({ where: { studentId: hoa!.id, status: 'PENDING' }, select: { id: true, tutor: { select: { name: true } }, date: true, startTime: true } })
  console.log(JSON.stringify({ minhanh: { id: minhanh!.id, name: minhanh!.name, verified: minhanh!.isVerified }, minhanhAvail: avail, pendingBookings: pending, hoaCompleted, hoaFavorites: favs.map(f => f.tutor.name), hoaPending }, (k, v) => (k === 'date' && typeof v === 'string' ? v.slice(0, 10) : v), 1))
}
main().finally(() => db.$disconnect())
