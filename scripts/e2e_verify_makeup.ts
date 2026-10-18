// Verify luồng NGHỈ BUỔI + DẠY BÙ tạo qua UI trong E2E J3 (exit 0 nếu đúng)
// Kỳ vọng: buổi gốc (e2e_data.makeup.sessionId) → CANCELLED
//          + buổi bù mới (makeup.newDate — thứ Sáu kế sau, do prep/driver tính) 18:00–20:30
//            SCHEDULED, makeupForId = buổi gốc
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
const db = new PrismaClient()

async function main() {
  const data = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/e2e_data.json', 'utf8'))
  const mk = data.makeup
  if (!mk) {
    console.error('NO_MAKEUP_DATA')
    process.exit(1)
  }
  const [origin, makeup] = await Promise.all([
    db.classSession.findUnique({ where: { id: mk.sessionId }, select: { date: true, status: true } }),
    db.classSession.findFirst({
      where: { makeupForId: mk.sessionId },
      select: { date: true, startTime: true, endTime: true, status: true },
    }),
  ])
  const expectDate: string | null = mk.newDate ?? null
  const ok =
    origin?.status === 'CANCELLED' &&
    makeup?.startTime === '18:00' &&
    makeup?.endTime === '20:30' &&
    makeup?.status === 'SCHEDULED' &&
    (expectDate ? makeup?.date === expectDate : !!makeup?.date)
  console.log(JSON.stringify({ origin, makeup, ok: !!ok }))
  process.exit(ok ? 0 : 1)
}
main().finally(() => db.$disconnect())
