// scripts/cleanup_race_test.ts — dọn user + enrollment test race B11
// (đọc /tmp/race_enroll_ids.json do test_race_b11.py ghi)
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'

const db = new PrismaClient()
const data = JSON.parse(readFileSync('/tmp/race_enroll_ids.json', 'utf-8'))

async function main() {
  // xóa user test (cascade enrollment) — an toàn hơn xóa enrollment lẻ
  for (const email of data.emails ?? []) {
    const u = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (u) {
      await db.session.deleteMany({ where: { userId: u.id } }).catch(() => {})
      await db.message.deleteMany({ where: { senderId: u.id } }).catch(() => {})
      await db.conversation.deleteMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] } }).catch(() => {})
      await db.user.delete({ where: { id: u.id } }).catch(e => console.log(`  (user ${email}: ${String(e).slice(0, 60)})`))
      console.log(`✓ xóa user test ${email}`)
    }
  }
  // fallback: xóa enrollment lẻ nếu user đã bị xóa trước đó
  for (const id of data.enrollmentIds ?? []) {
    await db.classEnrollment.delete({ where: { id } }).catch(() => {})
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
