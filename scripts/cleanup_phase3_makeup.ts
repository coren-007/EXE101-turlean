// scripts/cleanup_phase3_makeup.ts — dọn dữ liệu test_phase3 B2 tích lũy:
// các buổi bù "test nghỉ buổi có bù" + restore buổi gốc về SCHEDULED.
// Chạy: bun scripts/cleanup_phase3_makeup.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const TEST_REASON = 'test nghỉ buổi có bù'

async function main() {
  // Buổi gốc bị CANCELLED vì lý do test → restore
  const cancelled = await db.classSession.findMany({
    where: { status: 'CANCELLED', note: { contains: TEST_REASON } },
    include: { class: { select: { title: true } } },
  })
  console.log(`buổi gốc bị hủy vì test: ${cancelled.length}`)
  for (const s of cancelled) {
    await db.classSession.update({
      where: { id: s.id },
      data: { status: 'SCHEDULED', note: null },
    })
    console.log(`  ✓ restore ${s.date} ${s.startTime} (${s.class.title})`)
  }

  // Buổi bù tạo bởi test (note có dạng "Dạy bù cho buổi ... (test nghỉ buổi có bù)")
  const makeups = await db.classSession.findMany({
    where: { makeupForId: { not: null }, note: { contains: TEST_REASON } },
    include: { class: { select: { title: true } } },
  })
  console.log(`buổi bù test: ${makeups.length}`)
  for (const m of makeups) {
    await db.classSession.delete({ where: { id: m.id } })
    console.log(`  ✓ xóa buổi bù ${m.date} ${m.startTime} (${m.class.title})`)
  }

  // Thông báo hệ thống của các lần test này cũng dọn luôn (tránh rác inbox)
  const notis = await db.message.deleteMany({
    where: { kind: 'SYSTEM', body: { contains: 'DẠY BÙ' } },
  })
  console.log(`thông báo DẠY BÙ dọn: ${notis.count}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
