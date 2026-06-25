# 🚀 Hướng dẫn CI/CD & Deployment — GiaSuConnect (Turlean)

> **Người phụ trách**: 
> **Chi phí**: 0₫ (100% FREE tier)
> **Cập nhật**: 2026-06-25

---

## 📋 Tổng quan hạ tầng (FREE)

| Dịch vụ | Mục đích | Free tier | Giới hạn |
|---|---|---|---|
| **GitHub** | Source code + CI/CD | Public repo free | Unlimited |
| **GitHub Actions** | CI pipeline (lint, build) | 2000 min/tháng (private) / Unlimited (public) | Đủ cho MVP |
| **Vercel** | Hosting Next.js | Hobby (free) | 100GB bandwidth/tháng |
| **Supabase** | PostgreSQL database | Free 500MB | Đủ cho ~50K users |
| **Sentry** (sau) | Error monitoring | 5K errors/tháng | Đủ cho beta |

---

## 🔧 Bước 1: Setup GitHub Repository

```bash
# Clone repo (đã có sẵn)
git clone https://github.com/coren-007/EXE101-turlean.git
cd EXE101-turlean

# Thêm remote upstream (nếu fork)
git remote add origin https://github.com/coren-007/EXE101-turlean.git

# Tạo branch protection rules:
# Vào GitHub → Settings → Branches → Add rule cho "main":
#   ✅ Require pull request before merging
#   ✅ Require status checks to pass (CI lint + build)
#   ✅ Require approvals: 1
```

### Branch convention
```
main          → Production (deploy tự động lên Vercel)
staging       → Test environment
feature/*     → Tính năng mới (vd: feature/payment-vnpay)
fix/*         → Sửa bug (vd: fix/booking-conflict)
```

---

## 🔄 Bước 2: CI Pipeline (GitHub Actions)

File `.github/workflows/ci.yml` đã tạo. Tự động chạy khi:
- Push lên `main` hoặc `staging`
- Tạo Pull Request lên `main` hoặc `staging`

### CI làm gì:
1. **Lint job**: Install → Generate Prisma → ESLint check
2. **Build job**: Install → Generate Prisma → Build Next.js

### Kiểm tra CI chạy:
```bash
# Push code lên GitHub
git add .
git commit -m "feat: setup CI/CD"
git push origin main

# Vào GitHub → Actions tab → xem pipeline chạy
```

---

## ☁️ Bước 3: Deploy lên Vercel (FREE)

### 3.1 Tạo tài khoản Vercel
1. Vào https://vercel.com → Sign up với GitHub account
2. Import project: chọn repo `EXE101-turlearn`
3. Framework preset: **Next.js** (tự động detect)

### 3.2 Cấu hình Environment Variables
Trong Vercel dashboard → Settings → Environment Variables:

```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
NEXT_PUBLIC_APP_NAME=GiaSuConnect
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### 3.3 Deploy
- Vercel tự động deploy khi push lên `main`
- Mỗi PR tự động tạo **Preview Deployment** (URL riêng để test)
- Production deploy: chỉ khi merge vào `main`

### 3.4 Custom Domain (sau)
- Vercel → Settings → Domains → Add domain
- DNS: trỏ `giasuconnect.vn` → Vercel (hoặc dùng `.vercel.app` free)

---

## 🗄️ Bước 4: Setup Supabase Database (FREE PostgreSQL)

### Tại sao cần?
Vercel (serverless) không hỗ trợ SQLite persistent storage → cần PostgreSQL bên ngoài.

### 4.1 Tạo Supabase project
1. Vào https://supabase.com → Sign up (FREE)
2. New Project → đặt tên `giasuconnect`
3. Chọn region: Singapore (gần VN nhất)
4. Đợi 2 phút cho project khởi tạo

### 4.2 Lấy connection string
- Settings → Database → Connection string → URI
- Format: `postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres`
- Copy vào Vercel Environment Variables: `DATABASE_URL`

### 4.3 Migrate schema
```bash
# Cài Prisma globally (nếu chưa)
npm install -g prisma

# Set DATABASE_URL tạm thời
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"

# Push schema lên Supabase
bun run db:push

# Seed dữ liệu
bun run scripts/seed.ts
```

### 4.4 Giới hạn FREE tier
- 500MB database → đủ ~50,000 users
- 2GB bandwidth/tháng
- 50 concurrent connections
- Pause sau 7 ngày không hoạt động (click resume)

---

## 🐳 Bước 5: Docker (tùy chọn — cho VPS)

### Chạy local với Docker:
```bash
# Build + run
docker-compose up -d

# Xem logs
docker-compose logs -f

# Stop
docker-compose down

# Rebuild sau khi thay đổi code
docker-compose up -d --build
```

### Deploy lên VPS (sau — nếu cần):
```bash
# SSH vào VPS
ssh user@your-vps-ip

# Clone repo
git clone https://github.com/coren-007/EXE101-turlean.git
cd EXE101-turlean

# Tạo .env
cp .env.example .env
nano .env  # điền DATABASE_URL

# Run
docker-compose up -d

# Health check
curl http://localhost:3000/api/health
```

---

## 📊 Bước 6: Monitoring (FREE)

### 6.1 Health Check Endpoint
```bash
# Đã tạo tại /api/health
# Test:
curl https://your-app.vercel.app/api/health
# → {"status":"healthy","db":"connected","uptime":...}
```

### 6.2 UptimeRobot (FREE — 50 monitors)
1. Vào https://uptimerobot.com → Sign up
2. Add Monitor → HTTP(s) → URL: `https://your-app.vercel.app/api/health`
3. Interval: 5 phút
4. Alert: email khi down

### 6.3 Sentry Error Tracking (FREE — sau)
```bash
# 1. Tạo account tại https://sentry.io
# 2. Tạo project Next.js
# 3. Lấy DSN
# 4. Thêm vào Vercel env: SENTRY_DSN=...
# 5. Install: bun add @sentry/nextjs
# 6. Follow Sentry setup wizard
```

---

## 🔄 Bước 7: Backup Database (FREE)

### Supabase tự backup:
- Daily backup (FREE tier)
- 7 ngày retention
- Restore từ Supabase Dashboard → Database → Backups

### Manual backup script:
```bash
# Tạo file scripts/backup-db.sh
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL > backups/backup_$DATE.sql
# Giữ 7 ngày gần nhất
find backups/ -name "backup_*.sql" -mtime +7 -delete
```

```bash
# Crontab (chạy 2h sáng hàng ngày)
crontab -e
0 2 * * * /path/to/scripts/backup-db.sh
```

---

## 📝 Bước 8: Git Workflow cho cả team

### Quy trình làm việc:
```bash
# 1. Tạo branch mới từ main
git checkout main
git pull origin main
git checkout -b feature/ten-feature

# 2. Code + commit
git add .
git commit -m "feat: mô tả tính năng"

# 3. Push + tạo PR
git push origin feature/ten-feature
# Vào GitHub → tạo Pull Request → assign reviewer

# 4. CI tự động chạy (lint + build)
# 5. Reviewer approve → merge vào main
# 6. Vercel tự động deploy
```

### Conventional Commits:
```
feat:     tính năng mới
fix:      sửa bug
docs:     documentation
style:    format code (không đổi logic)
refactor: refactor code
test:     thêm test
chore:    config, dependencies
```

---

## ✅ Checklist Deploy Production

- [ ] GitHub repo public + CI pipeline chạy
- [ ] Vercel project đã import + env vars đã set
- [ ] Supabase project đã tạo + schema đã push
- [ ] Seed data đã chạy trên production DB
- [ ] Health check endpoint trả 200
- [ ] UptimeRobot đã setup
- [ ] Custom domain đã trỏ (nếu có)
- [ ] Branch protection rules đã set
- [ ] PR template đã có
- [ ] Team đã biết git workflow

---

## 🆘 Troubleshooting

### CI fail: "Cannot find module '.prisma/client'"
```bash
# Thêm step generate Prisma trước lint/build
bun run db:generate
```

### Vercel deploy fail: DB connection
```bash
# Kiểm tra DATABASE_URL trong Vercel env vars
# Phải dùng PostgreSQL (Supabase), KHÔNG dùng SQLite
```

### Supabase paused (7 ngày không hoạt động)
```bash
# Vào Supabase Dashboard → Resume project
# Chạy lại db:push + seed
```

### Docker build fail
```bash
# Xóa cache + rebuild
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

---

## 💰 Chi phí ước tính

| Giai đoạn | Dịch vụ | Chi phí |
|---|---|---|
| Development | GitHub + Vercel + Supabase | **0₫** |
| Beta (1K users) | Vercel Hobby + Supabase Free | **0₫** |
| Growth (10K users) | Vercel Pro ($20/mo) + Supabase Free | ~500K₫/tháng |
| Scale (100K users) | Vercel Pro + Supabase Pro ($25/mo) | ~1.2M₫/tháng |

**Kết luận**: MVP + Beta hoàn toàn FREE. Bắt đầu trả phí khi > 10K users.

---


