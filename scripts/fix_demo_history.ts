// Reset demo để lớp học có LỊCH SỬ (5 tuần quá khứ):
//  1. Xóa sạch ClassSession (+điểm danh cascade) + ClassFeePayment
//  2. Lùi startDate của mọi lớp về 5 tuần trước, createdAt enrollments về tuần đó
// Sau đó chạy lại: backfill_sessions.ts → seed_phase3.ts
// Chạy: bunx tsx scripts/fix_demo_history.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function main() {
  const now = Date.now()
  const startISO = toISO(new Date(now - 35 * 86400000)) // 5 tuần trước (tháng trước)
  const enrollAt = new Date(now - 33 * 86400000) // 2 ngày sau khai giảng

  // 1. Xóa sạch buổi học + học phí (điểm danh cascade theo session)
  const delS = await db.classSession.deleteMany({})
  const delF = await db.classFeePayment.deleteMany({})
  console.log(`✔ Đã xóa ${delS.count} buổi học · ${delF.count} dòng học phí`)

  // 2. Lùi mốc thời gian
  await db.groupClass.updateMany({ data: { startDate: startISO } })
  const upd = await db.classEnrollment.updateMany({
    where: { status: { in: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] } },
    data: { createdAt: enrollAt, updatedAt: enrollAt },
  })
  console.log(`✔ Đã lùi startDate về ${startISO} · ${upd.count} đăng ký về ${toISO(enrollAt)}`)
  console.log('→ Chạy tiếp: bunx tsx scripts/backfill_sessions.ts && bunx tsx scripts/seed_phase3.ts')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
