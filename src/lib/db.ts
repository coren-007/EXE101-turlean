import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// OPT-3: Production chỉ log lỗi (tránh spam query log trên Vercel).
// Dev: mặc định cũng tắt query log — mỗi lần tải trang sinh ra HÀNG NGHÌN dòng
// prisma:query (chậm I/O, dev.log phình to rất khó đọc). Bật lại khi cần debug SQL:
//   PRISMA_QUERY_LOG=1 bun run dev
const logConfig =
  process.env.NODE_ENV === 'production'
    ? (['error'] as const)
    : process.env.PRISMA_QUERY_LOG === '1'
      ? (['query', 'warn', 'error'] as const)
      : (['warn', 'error'] as const)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [...logConfig],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db