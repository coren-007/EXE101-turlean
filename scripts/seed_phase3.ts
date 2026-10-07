// Seed PHASE 3 — quản lý lớp học: ngày nghỉ lễ VN + sổ học phí demo
// Chạy: bunx tsx scripts/seed_phase3.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // ===== 1. Ngày nghỉ lễ Việt Nam (12 tháng tới tính từ hiện tại) =====
  const holidays: { date: string; name: string }[] = [
    { date: '2027-01-01', name: 'Tết Dương lịch' },
    { date: '2027-02-16', name: 'Tết Nguyên Đán (Mùng 1)' },
    { date: '2027-02-17', name: 'Tết Nguyên Đán (Mùng 2)' },
    { date: '2027-02-18', name: 'Tết Nguyên Đán (Mùng 3)' },
    { date: '2027-02-19', name: 'Tết Nguyên Đán (Mùng 4)' },
    { date: '2027-02-20', name: 'Tết Nguyên Đán (Mùng 5)' },
    { date: '2027-04-16', name: 'Giỗ Tổ Hùng Vương' },
    { date: '2027-04-30', name: 'Ngày Giải phóng miền Nam' },
    { date: '2027-05-01', name: 'Ngày Quốc tế Lao động' },
    { date: '2027-09-02', name: 'Quốc khánh 2/9' },
  ]
  for (const h of holidays) {
    await db.holiday.upsert({ where: { date: h.date }, create: h, update: { name: h.name } })
  }
  console.log(`✔ Đã seed ${holidays.length} ngày nghỉ lễ`)

  // Dọn buổi SCHEDULED tương lai trúng ngày lễ (giống hành vi thêm lễ mới)
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  let cleaned = 0
  for (const h of holidays) {
    if (h.date < todayStr) continue
    const r = await db.classSession.updateMany({
      where: { status: 'SCHEDULED', date: h.date, makeupForId: null },
      data: { status: 'CANCELLED', note: `Nghỉ lễ: ${h.name}` },
    })
    cleaned += r.count
  }
  console.log(`✔ Đã hủy ${cleaned} buổi trúng ngày nghỉ lễ`)

  // ===== 2. Sổ học phí demo =====
  // Tháng 2026-09: mọi học sinh APPROVED đều đã đóng.
  // Tháng 2026-10: ~2/3 đã đóng — còn lại demo badge "chưa đóng tháng này".
  const classes = await db.groupClass.findMany({
    where: { monthlyFee: { not: null } },
    include: { enrollments: { where: { status: 'APPROVED' }, orderBy: { createdAt: 'asc' } } },
  })
  let paid09 = 0
  let paid10 = 0
  for (const cls of classes) {
    if (cls.monthlyFee == null) continue
    for (const [i, e] of cls.enrollments.entries()) {
      // Tháng 9: đóng đủ
      await db.classFeePayment.upsert({
        where: { classId_enrollmentId_period: { classId: cls.id, enrollmentId: e.id, period: '2026-09' } },
        create: {
          classId: cls.id,
          enrollmentId: e.id,
          studentParentId: e.studentParentId,
          period: '2026-09',
          amount: cls.monthlyFee,
          method: i % 2 === 0 ? 'CASH' : 'BANK',
          note: null,
          paidAt: new Date(2026, 8, 28 + (i % 3)), // cuối tháng 9
        },
        update: {},
      })
      paid09++
      // Tháng 10: bỏ mỗi học sinh thứ 3 (i % 3 === 2) để demo "chưa đóng"
      if (i % 3 !== 2) {
        await db.classFeePayment.upsert({
          where: { classId_enrollmentId_period: { classId: cls.id, enrollmentId: e.id, period: '2026-10' } },
          create: {
            classId: cls.id,
            enrollmentId: e.id,
            studentParentId: e.studentParentId,
            period: '2026-10',
            amount: cls.monthlyFee,
            method: i % 2 === 0 ? 'CASH' : 'MOMO',
            note: null,
            paidAt: new Date(2026, 9, 2 + (i % 5)), // đầu tháng 10
          },
          update: {},
        })
        paid10++
      }
    }
  }
  console.log(`✔ Đã ghi nhận học phí demo: tháng 9 = ${paid09} dòng · tháng 10 = ${paid10} dòng`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
