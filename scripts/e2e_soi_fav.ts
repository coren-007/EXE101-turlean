import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const f = await db.favorite.findMany({ where: { owner: { email: "hoa.parent@example.com" } }, select: { tutor: { select: { email: true } } } })
  console.log(JSON.stringify(f))
}
main().finally(() => db.$disconnect())
