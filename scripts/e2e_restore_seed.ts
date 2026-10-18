// Khôi phục 1 lần: buổi bù seed 26/10 của buổi 20/10 (bị E2E run 4 dời sang 30/10)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const r = await db.classSession.updateMany({
    where: { makeupForId: 'cmvcexzrm000amhczb30o91jn', date: { not: '2026-10-26' } },
    data: { date: '2026-10-26', startTime: '18:00', endTime: '20:30', note: 'Dạy bù cho buổi 20/10/2026 (test nghỉ buổi có bù)' },
  })
  // thuha về PENDING nếu E2E từ chối rồi
  const th = await db.verificationRequest.updateMany({
    where: { tutor: { email: 'thuha.tutor@example.com' }, status: { not: 'PENDING' } },
    data: { status: 'PENDING', reviewNote: null, reviewedAt: null },
  })
  console.log(JSON.stringify({ makeupRestored: r.count, thuhaReset: th.count }))
}
main().finally(() => db.$disconnect())
