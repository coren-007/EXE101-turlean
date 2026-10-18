import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const vr = await db.verificationRequest.findMany({ orderBy: { createdAt: 'asc' }, select: { fileName: true, status: true, reviewedAt: true, tutor: { select: { email: true, isVerified: true } } } })
  console.log(JSON.stringify(vr, null, 1))
}
main().finally(() => db.$disconnect())
