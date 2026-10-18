// scripts/cleanup_dbg_users.ts — xóa user test throwaway (dbg.*, p6lock.*, booking.test.*, repeat.*)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const all = await db.user.findMany({
    where: {
      OR: [
        { email: { startsWith: 'dbg.' } },
        { email: { startsWith: 'p6lock.' } },
        { email: { startsWith: 'booking.test' } },
        { email: { startsWith: 'repeat.' } },
        { email: { startsWith: 'secfix.' } },
      ],
    },
    select: { id: true, email: true },
  })
  // Xóa lớp nhóm test do các user này tạo (SEC Fix Race Lop…)
  const cls = await db.groupClass.deleteMany({
    where: { title: { startsWith: 'SEC' } },
  })
  console.log(`lớp test xóa: ${cls.count}`)
  for (const u of all) {
    await db.cancellation.deleteMany({ where: { booking: { OR: [{ tutorId: u.id }, { studentId: u.id }] } } })
    await db.booking.deleteMany({ where: { OR: [{ tutorId: u.id }, { studentId: u.id }] } })
    const convs = await db.conversation.findMany({
      where: { OR: [{ tutorId: u.id }, { studentId: u.id }] },
      select: { id: true },
    })
    for (const cv of convs) {
      await db.message.deleteMany({ where: { conversationId: cv.id } })
      await db.conversation.delete({ where: { id: cv.id } }).catch(() => {})
    }
    await db.message.deleteMany({ where: { senderId: u.id } })
    await db.session.deleteMany({ where: { userId: u.id } })
    await db.user.delete({ where: { id: u.id } })
    console.log('đã xóa', u.email)
  }
  console.log('tổng:', all.length)
}
main().finally(() => db.$disconnect())
