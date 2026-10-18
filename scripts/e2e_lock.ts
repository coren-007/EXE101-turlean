// Khóa / mở tài khoản qua DB — dùng trong E2E J4 (mô phỏng auto-lock đã có test riêng)
// Cách chạy: bun run scripts/e2e_lock.ts <email> <lock|unlock>
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const [email, action] = process.argv.slice(2)
  if (!email || !['lock', 'unlock'].includes(action || '')) {
    console.error('usage: bun run scripts/e2e_lock.ts <email> <lock|unlock>')
    process.exit(1)
  }
  const u = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (!u) {
    console.error('not found:', email)
    process.exit(1)
  }
  if (action === 'lock') {
    await db.user.update({
      where: { id: u.id },
      data: { lockedAt: new Date(), lockedReason: 'E2E: mô phỏng tài khoản bị khóa do reliability thấp' },
    })
    console.log('locked:', email)
  } else {
    await db.user.update({ where: { id: u.id }, data: { lockedAt: null, lockedReason: null } })
    console.log('unlocked:', email)
  }
}
main().finally(() => db.$disconnect())
