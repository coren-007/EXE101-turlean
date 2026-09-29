# 🚀 Quick Start

## Yêu cầu
- **Bun** 1.0+ (khuyến nghị) hoặc Node.js 18+
- **PostgreSQL** — một trong hai cách:
  - **Docker** (dễ nhất): `docker compose up -d db`
  - **Supabase** (FREE): tạo project tại https://supabase.com

## Chạy dự án

```bash
# 1. Cài dependencies
bun install

# 2. Tạo file .env từ mẫu và điền DATABASE_URL + DIRECT_URL
cp .env.example .env

# 3. Tạo database + generate Prisma client
bun run db:push

# 4. Seed dữ liệu mẫu (34 môn, 26 gia sư, 12 học sinh, khóa học định kỳ demo)
bun run seed

# 5. Chạy dev server
bun run dev
```

Mở http://localhost:3000

## Chạy full stack bằng Docker (app + PostgreSQL)

```bash
# Khởi động app + db
docker compose up -d

# Lần đầu — tạo schema + seed (từ máy host, khi container db đã sẵn sàng)
DATABASE_URL=postgresql://giasuconnect:giasuconnect@localhost:5432/giasuconnect \
DIRECT_URL=postgresql://giasuconnect:giasuconnect@localhost:5432/giasuconnect \
  bun run db:push && \
DATABASE_URL=postgresql://giasuconnect:giasuconnect@localhost:5432/giasuconnect \
DIRECT_URL=postgresql://giasuconnect:giasuconnect@localhost:5432/giasuconnect \
  bun run seed
```

## Tài khoản demo (mật khẩu: 123456)
- Gia sư: `minhanh.tutor@example.com`
- Học sinh: `hoa.parent@example.com`

## Deploy lên production
Đọc file **[DEPLOYMENT.md](./DEPLOYMENT.md)**
