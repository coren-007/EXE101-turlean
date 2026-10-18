// Phục hồi 1 lần: trả đúng trạng thái seed cho các buổi hoa×minhanh 18:30 bị revert nhầm
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const today = new Date().toISOString().slice(0, 10)
  // quá khứ + có review → COMPLETED
  const a = await db.booking.updateMany({
    where: { tutor: { email: 'minhanh.tutor@example.com' }, student: { email: 'hoa.parent@example.com' }, startTime: '18:30', date: { lt: today }, status: 'PENDING', review: { isNot: null } },
    data: { status: 'COMPLETED' },
  })
  // tương lai gần nhất không review → CONFIRMED (trạng thái seed gốc)
  const b = await db.booking.updateMany({
    where: { tutor: { email: 'minhanh.tutor@example.com' }, student: { email: 'hoa.parent@example.com' }, startTime: '18:30', date: '2026-10-21', status: 'PENDING' },
    data: { status: 'CONFIRMED' },
  })
  console.log(JSON.stringify({ completed: a.count, confirmed: b.count }))
}
main().finally(() => db.$disconnect())
