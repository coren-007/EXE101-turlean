// P5: đa dạng hóa availability của các gia sư trong DB HIỆN TẠI (không cần re-seed).
// Seed cũ: mọi gia sư cùng khung (T2-T7 18-21h, CN 8-20h) → filter khung giờ vô nghĩa.
// Mẫu mới theo thứ tự createdAt (giữ nguyên phần còn lại của DB: lớp học, học phí, điểm danh...).
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Khớp mẫu trong scripts/seed.ts (idx % 5)
function patternRows(pattern: number): { dayOfWeek: number; startTime: string; endTime: string }[] {
  const rows: { dayOfWeek: number; startTime: string; endTime: string }[] = []
  if (pattern === 0) {
    for (let day = 1; day <= 6; day++) rows.push({ dayOfWeek: day, startTime: '18:00', endTime: '21:00' })
    rows.push({ dayOfWeek: 0, startTime: '08:00', endTime: '20:00' })
  } else if (pattern === 1) {
    rows.push({ dayOfWeek: 5, startTime: '18:00', endTime: '21:00' })
    for (const day of [6, 0]) {
      rows.push({ dayOfWeek: day, startTime: '08:00', endTime: '11:30' })
      rows.push({ dayOfWeek: day, startTime: '13:30', endTime: '18:00' })
    }
  } else if (pattern === 2) {
    for (let day = 1; day <= 5; day++) rows.push({ dayOfWeek: day, startTime: '07:00', endTime: '11:30' })
  } else if (pattern === 3) {
    for (let day = 1; day <= 6; day++) rows.push({ dayOfWeek: day, startTime: '14:00', endTime: '20:00' })
    rows.push({ dayOfWeek: 0, startTime: '14:00', endTime: '18:00' })
  } else {
    rows.push({ dayOfWeek: 1, startTime: '18:30', endTime: '21:30' })
    rows.push({ dayOfWeek: 3, startTime: '18:30', endTime: '21:30' })
    for (const day of [6, 0]) rows.push({ dayOfWeek: day, startTime: '07:30', endTime: '11:30' })
  }
  return rows
}

async function main() {
  const tutors = await db.user.findMany({
    where: { role: 'TUTOR' },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`Đa dạng hóa availability cho ${tutors.length} gia sư...`)
  await db.availability.deleteMany()
  for (const [idx, t] of tutors.entries()) {
    const rows = patternRows(idx % 5)
    await db.availability.createMany({ data: rows.map(r => ({ tutorId: t.id, ...r })) })
  }
  // Thống kê để kiểm chứng
  const all = await db.user.findMany({ where: { role: 'TUTOR' }, select: { name: true, availabilities: true }, orderBy: { createdAt: 'asc' } })
  const stat = (label: string, pred: (rows: { dayOfWeek: number; startTime: string; endTime: string }[]) => boolean) => {
    const n = all.filter(t => pred(t.availabilities)).length
    console.log(`  ${label}: ${n}/${all.length}`)
  }
  stat('Rảnh sáng', rows => rows.some(a => a.startTime < '11:00' && a.endTime > '05:00'))
  stat('Rảnh chiều', rows => rows.some(a => a.startTime < '17:00' && a.endTime > '11:00'))
  stat('Rảnh tối', rows => rows.some(a => a.startTime < '22:30' && a.endTime > '17:00'))
  stat('Rảnh T7', rows => rows.some(a => a.dayOfWeek === 6))
  stat('Rảnh CN', rows => rows.some(a => a.dayOfWeek === 0))
}

main().then(() => db.$disconnect()).catch(e => { console.error(e); process.exit(1) })
