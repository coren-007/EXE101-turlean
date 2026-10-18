// Khôi phục sau debug: xóa makeup 02/11, trả buổi 26/10 (makeup seed) về SCHEDULED
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const bad = await db.classSession.findFirst({ where: { makeupForId: 'cmvcf6y5l002qmhugu0unyaso' }, select: { id: true } })
  if (bad) {
    await db.classAttendance.deleteMany({ where: { sessionId: bad.id } })
    await db.classSession.delete({ where: { id: bad.id } })
  }
  const r = await db.classSession.updateMany({
    where: { id: 'cmvcf6y5l002qmhugu0unyaso' },
    data: { status: 'SCHEDULED', note: 'Dạy bù cho buổi 20/10/2026 (test nghỉ buổi có bù)' },
  })
  console.log(JSON.stringify({ deleted: !!bad, restored: r.count }))
}
main().finally(() => db.$disconnect())
