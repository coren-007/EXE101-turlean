// Revert series demo của hoa × minhanh (T4 18:30, 28/10→25/11) về PENDING —
// dùng giữa chừng E2E J3 vì vòng xác nhận có thể confirm nhầm series demo
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const r = await db.booking.updateMany({
    where: {
      tutor: { email: 'minhanh.tutor@example.com' },
      student: { email: 'hoa.parent@example.com' },
      startTime: '18:30',
      date: { gte: new Date().toISOString().slice(0, 10) }, // CHỈ buổi tương lai — không đụng lịch sử COMPLETED
      status: { not: 'PENDING' },
    },
    data: { status: 'PENDING' },
  })
  console.log(JSON.stringify({ reverted: r.count }))
}
main().finally(() => db.$disconnect())
