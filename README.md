# 🎓 GiaSuConnect (Turlean)

> Nền tảng kết nối gia sư với phụ huynh & học sinh tại Việt Nam.


---

## 📖 Giới thiệu

**GiaSuConnect** giải quyết bài toán: phụ huynh cần tìm gia sư uy tín, gần nhà, dạy đúng môn; gia sư cần tìm học sinh mà không qua trung gian.

### Điểm khác biệt cốt lõi

| Tính năng | Mô tả |
|---|---|
| 🏠 **Khớp vị trí 2 chiều** | Gia sư đến nhà HOẶC học sinh đến cơ sở — linh hoạt theo môn học |
| 🗺️ **Bản đồ tương tác** | Leaflet + OpenStreetMap, click card → map bay đến vị trí, click marker → scroll list |
| 🛡️ **Hệ thống độ tin cậy** | Track mọi lần hủy, phạt điểm nếu hủy sát giờ, hiển thị công khai trên profile |
| 📚 **34 môn theo cấp lớp** | Tiểu học → THCS → THPT, STEM + Ngoại ngữ + Nghệ thuật + Tin học |
| 🏙️ **5 thành phố** | Hà Nội, TP.HCM, Đà Nẵng, Hải Phòng, Cần Thơ |


---

## 🚀 Chạy dự án

### Yêu cầu
- **Bun** 1.0+ (khuyến nghị) hoặc Node.js 18+
- **PostgreSQL** — một trong hai cách:
  - **Docker**: `docker compose up -d db` (service `db` sẵn trong repo)
  - **Supabase** (FREE): tạo project tại https://supabase.com

### Cài đặt & chạy

```bash
# 1. Clone repo
git clone https://github.com/coren-007/EXE101-turlean.git
cd EXE101-turlean

# 2. Cài dependencies
bun install

# 3. Tạo .env từ mẫu, điền DATABASE_URL + DIRECT_URL (PostgreSQL)
cp .env.example .env

# 4. Tạo schema trong database
bun run db:push

# 5. Seed dữ liệu mẫu (34 môn, 26 gia sư, 12 học sinh, khóa định kỳ demo)
bun run seed

# 6. Chạy dev server
bun run dev
```

Mở http://localhost:3000

### Tài khoản demo (mật khẩu: `123456`)

| Vai trò | Email | Thành phố |
|---|---|---|
| Gia sư | `minhanh.tutor@example.com` | Hà Nội |
| Gia sư | `sarah.tutor@example.com` | TP.HCM |
| Gia sư | `kimngan.tutor@example.com` | Đà Nẵng |
| Học sinh | `hoa.parent@example.com` | Hà Nội |
| Học sinh | `minhtam.parent@example.com` | TP.HCM |

---

## 🛠️ Tech Stack

| Layer | Công nghệ |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, shadcn/ui (New York), Lucide icons |
| **Backend** | Next.js API Routes (built-in, không cần server riêng) |
| **Database** | Prisma 6 ORM + PostgreSQL (Supabase / Docker) |
| **Auth** | Session-based (cookie httpOnly + bcrypt hashing) |
| **State** | Zustand (client state) |
| **Map** | Leaflet + OpenStreetMap + MarkerCluster (FREE, không API key) |
| **Font** | Be Vietnam Pro (hỗ trợ tiếng Việt) |

### Dự kiến thêm (theo roadmap)
- **AI**: Python FastAPI microservice hoặc Node.js + LangChain
- **Chat**: Socket.io mini-service
- **Payment**: VNPay / MoMo SDK
- **File upload**: Cloudinary (FREE 25GB)
- **Email**: Resend (FREE 3,000/tháng)
- **Monitoring**: Sentry (FREE 5K errors/tháng)

---

## ✨ Tính năng đã hoàn thành

### 🔐 Xác thực
- Đăng ký với 2 vai trò: Gia sư / Phụ huynh-Học sinh
- Session cookie httpOnly + bcrypt password hashing
- Tutor mới đăng ký → tự động vào Onboarding Wizard 3 bước
- Demo account buttons (1-click fill credentials)

### 🔍 Tìm kiếm gia sư
- **Trang chủ search-first** (kiểu Airbnb): ô tìm kiếm 3 ngăn + chip danh mục + carousel gia sư nổi bật/lớp quanh bạn/mới nhất
- **Filter nhanh bằng chip**: cấp học, phương thức dạy, khoảng giá, đánh giá (tương tự Grab/YouTube)
- **Bộ lọc chi tiết** (Sheet): tỉnh/thành, quận, giá (slider), phương thức, đánh giá
- **Search text**: theo tên gia sư, nghề nghiệp, bio, tên môn học (không phân biệt hoa thường)
- **2 view modes**: Grid (lưới card) và Map (bản đồ + list song song)
- **Sort**: đánh giá, giá, mới nhất, khoảng cách
- **Phân trang**: 12 kết quả/trang + tổng số kết quả
- **ONLINE**: lọc + đặt lịch dạy trực tuyến đầy đủ
- **Geolocation**: "Vị trí của tôi" (GPS) hoặc "Chọn trên bản đồ" (click trên map)
- **localStorage**: lưu filter + vị trí, khôi phục khi reload
- **Empty state** đầy đủ cho cả grid và map view

### 🗺️ Bản đồ tương tác
- **Leaflet + OpenStreetMap** (real interactive map, miễn phí)
- **Price markers**: bubble giá (vd: "400k") thay vì pin truyền thống
- **Marker clustering**: tự gộp khi zoom out
- **Custom controls**: zoom in/out, locate, layer switcher
- **Layer switcher**: Street (OSM) / Satellite (Esri World Imagery)
- **Pick mode**: click vào map để chọn vị trí tìm kiếm
- **2-way interaction**: click card → pan map + mở popup; click marker → scroll list
- **Popup với nút "Xem chi tiết"**: navigate thẳng đến profile

### 👤 Hồ sơ gia sư (LinkedIn-style)
- Cover + avatar, badge verified, độ tin cậy
- Phương thức dạy (3 mode: đến nhà / tại cơ sở / online)
- Môn dạy + giá từng môn
- Học vấn & kinh nghiệm
- Lịch trống theo tuần
- Reviews từ phụ huynh
- Sticky booking card (desktop)
- Nút Share (native share mobile / copy link desktop)
- Nút Favorite (lưu vào localStorage)

### 📅 Đặt lịch (Booking Flow)
- Dialog: chọn môn → phương thức → **số buổi (1 lẻ hoặc khóa định kỳ 2/4/8/12 buổi)** → ngày → slot → ghi chú
- **Khóa học định kỳ**: các buổi cùng khóa chia sẻ `seriesId`, hiển thị "Buổi i/N" + tiến độ lớp học
- **Time slots tự generate** từ lịch trống của gia sư (giữ đúng phút bắt đầu: 09:30 + 1.5h = 11:00)
- Validation: không đặt ngày quá khứ, duration 0.5-4h, mode hợp lệ (zod cả client + server)
- Conflict check **2 phía**: tutor và student đều không được trùng giờ
- Total amount tự tính từ giá môn đã chọn × duration (server tự tính lại, không tin client)
- **Bảng giá minh bạch** trong dialog: giá môn + số buổi + tổng tiền, 0% phí nền tảng

### 📊 Dashboard
**Tutor — Tutor Studio 1 trang, 3 tab workspace** (Tổng quan | Môn & giá | Lịch dạy):
- Tổng quan: 4 stats (thu nhập buổi đã hoàn thành/học sinh/giờ dạy/đánh giá), yêu cầu chờ xác nhận, lịch tuần, lớp đang dạy, Reliability card
- Môn & giá: sửa giá inline tại chỗ, thêm môn theo nhóm, xóa từng dòng
- Lịch dạy: lưới tuần T2→CN bấm bật/tắt khung giờ, dialog khung giờ tùy chỉnh

**Student**: 4 stats, banner "N yêu cầu đang chờ xác nhận", lịch tuần, lớp đang theo học (tiến độ + nút Nhắn tin), tabs Sắp tới/Lịch sử, Reliability card

### 📆 Lớp học định kỳ & quản lý lớp
- Đặt **khóa học 2/4/8/12 buổi** theo tuần (use case thật của gia sư)
- Dashboard nhóm theo **lớp học** (đối tác × môn): tiến độ x/y buổi, buổi tới, tổng tiền đã hoàn thành, badge trạng thái
- **Lịch tuần 7 ô** (T2→CN) với điều hướng trước/sau cho cả 2 vai trò

### 💬 Tin nhắn & Thông báo
- **Hội thoại 1-1** gia sư ↔ phụ huynh (mỗi cặp đúng 1 hội thoại)
- **Tin nhắn hệ thống tự động**: đặt lịch / xác nhận / hoàn thành / hủy kèm lý do → hiện dạng thẻ "Thông báo lớp học" trong luồng chat
- Badge số tin chưa đọc trên header + danh sách hội thoại

### ⭐ Đánh giá 2 chiều
- Dialog đánh giá thật (sao 1-5 + nhận xét) cho mọi buổi COMPLETED chưa đánh giá
- Tutor chỉ đánh dấu COMPLETED **sau** giờ học; avgRating tính từ toàn bộ review

### 🛡️ Hệ thống Hủy lịch + Điểm uy tín (Reliability)
- **Bắt buộc lý do hủy** (≥ 5 ký tự), mọi lần hủy được ghi lại kèm mức độ vi phạm
- **8 quy tắc trừ điểm** (công khai, công bằng 2 chiều):

| Ai hủy | Trạng thái | Độ sát giờ | Mức độ | Trừ điểm |
|---|---|---|---|---|
| Gia sư | CONFIRMED | < 2h | SEVERE | -20 |
| Gia sư | CONFIRMED | < 24h | VIOLATION | -15 |
| Gia sư | CONFIRMED | ≥ 24h | WARNING | -10 |
| Học sinh | CONFIRMED | < 2h | VIOLATION | -15 |
| Học sinh | CONFIRMED | < 24h | WARNING | -10 |
| Học sinh | CONFIRMED | ≥ 24h | MINOR | -5 |
| Bất kỳ | PENDING | ≥ 24h | NONE | 0 |
| Bất kỳ | PENDING | < 24h | MINOR | -5 |

- **Reliability score** = max(0, 100 − tổng điểm trừ)
- **Tier**: XUẤT SẮC (≥90) → TỐT (70-89) → TRUNG BÌNH (50-69) → CẦN CẢI THIỆN (<50)
- **Công khai 2 chiều**: phụ huynh xem điểm gia sư trước khi đặt; mỗi người xem điểm của chính mình

### 🧙 Onboarding Wizard (Tutor mới)
3 bước: Thông tin chuyên môn → Môn dạy + giá → Phương thức & lịch dạy (lưới T2→CN)
Thông điệp: "Đăng hồ sơ một lần — học sinh tự tìm đến" — sau khi đăng không cần thao tác thêm.

### 📚 Quản lý môn dạy & Lịch trống
- CRUD môn dạy (thêm/sửa/xóa với check booking active)
- CRUD lịch trống theo tuần (thêm/xóa với check booking active)
- Auto-update hourlyRate = min của các môn

---

## 🗄️ Database Schema

10 models: **User, Subject, TutorSubject, Booking, Cancellation, Review, Availability, Conversation, Message, Session**

```
User (Student/Tutor)
├── TutorSubject ←→ Subject (môn dạy + giá)
├── Booking ←→ Subject (lịch đặt, khóa định kỳ seriesId)
│   ├── Review (đánh giá sau buổi học)
│   └── Cancellation (record hủy + mức vi phạm)
├── Availability (lịch trống theo tuần)
├── Conversation → Message (tin nhắn 1-1 + tin hệ thống)
└── Session (session đăng nhập)
```

---

## 🔌 API Endpoints

| Nhóm | Endpoints |
|---|---|
| **Auth** | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` |
| **Profile** | `GET /api/me`, `PATCH /api/me` |
| **Tutors** | `GET /api/tutors` (search), `GET /api/tutors/[id]`, `GET /api/tutors/[id]/reliability` |
| **Tutor Manage** | `GET/POST /api/tutors/me/subjects`, `PATCH/DELETE /api/tutors/me/subject/[id]` |
| | `GET/POST /api/tutors/me/availability`, `DELETE /api/tutors/me/availability/[id]` |
| | `GET /api/tutors/me/stats` |
| **Bookings** | `GET/POST /api/bookings`, `PATCH /api/bookings`, `POST /api/bookings/[id]/cancel` |
| **Reviews** | `POST /api/reviews` |
| **Messaging** | `GET /api/conversations`, `GET /api/conversations/[id]` (tin nhắn + đánh dấu đã đọc) |
| **Violations** | `GET /api/users/me/violations` |
| **Other** | `GET /api/subjects`, `GET /api/locations`, `GET /api/health`, `POST /api/cron/reminder` |

---

## 🚀 CI/CD & Deployment

### Hạ tầng (100% FREE)

| Dịch vụ | Mục đích | Free tier |
|---|---|---|
| **GitHub Actions** | CI pipeline (lint + typecheck + build) | Unlimited (public repo) |
| **Vercel** | Hosting Next.js | 100GB bandwidth/tháng |
| **Supabase** | PostgreSQL database | 500MB + 2GB bandwidth |
| **UptimeRobot** | Uptime monitoring | 50 monitors |

### CI Pipeline (`.github/workflows/ci.yml`)
Tự động chạy khi push/PR lên `main` hoặc `staging` (Bun):
1. **Lint job**: Install → Generate Prisma → ESLint → Type Check
2. **Build job**: Install → Generate Prisma → Build Next.js (standalone)

### Deploy lên Vercel
1. Import repo trên https://vercel.com (Bun được cấu hình sẵn trong `vercel.json`)
2. Set env vars: `DATABASE_URL` (pooled) + `DIRECT_URL` (direct) = Supabase connection strings
3. Auto-deploy khi push `main`

Xem hướng dẫn chi tiết: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

### Scripts có sẵn

```bash
bun run dev          # Dev server (port 3000)
bun run build        # Build production (standalone)
bun run start        # Chạy production server
bun run lint         # ESLint check
bun run typecheck    # TypeScript type check
bun run db:push      # Push schema to PostgreSQL (cần DIRECT_URL)
bun run db:generate  # Generate Prisma client
bun run seed         # Seed dữ liệu mẫu
bun run smoke        # Smoke test 18 kịch bản (cần dev server + DB đã seed)
```

---

## 📁 Cấu trúc thư mục

```
├── .github/workflows/ci.yml       # CI pipeline (Bun: lint + typecheck + build)
├── .github/PULL_REQUEST_TEMPLATE.md
├── prisma/schema.prisma           # 10 models DB (PostgreSQL)
├── scripts/seed.ts                # Seed data
├── scripts/smoke-test.sh           # 18 kịch bản smoke test API
├── src/
│   ├── app/
│   │   ├── api/                   # 23 API endpoints (zod validation)
│   │   ├── globals.css            # Tailwind 4 + design system v2
│   │   ├── layout.tsx             # Root layout (Be Vietnam Pro)
│   │   └── page.tsx               # SPA router (theo vai trò)
│   ├── components/
│   │   ├── pages/                 # 10 trang (thêm messages-page)
│   │   ├── dashboard/             # Tutor Studio panels + lịch tuần + lớp học
│   │   ├── map/tutor-map.tsx      # Leaflet map 2 chiều
│   │   ├── ui/                    # shadcn/ui (đã tinh gọn còn thành phần dùng)
│   │   ├── header.tsx / footer.tsx
│   │   └── tutor-card.tsx         # Thẻ listing kiểu Airbnb
│   ├── hooks/use-toast.ts
│   └── lib/
│       ├── auth.ts                # Session + bcrypt + distance
│       ├── reliability.ts         # 8 quy tắc trừ điểm + tier
│       ├── notify.ts              # Thông báo tự động vào hội thoại
│       ├── db.ts                  # Prisma client
│       ├── store.ts               # Zustand store
│       └── format.ts              # formatVnd, formatDate, formatTime24h
├── Dockerfile                     # Docker (Bun, 3 stage) cho VPS
├── docker-compose.yml             # Full stack: app + PostgreSQL 16
├── vercel.json                    # Vercel deploy config (Bun + cron)
├── CHANGELOG.md                   # Lịch sử thay đổi chi tiết
├── DEPLOYMENT.md                  # Hướng dẫn deploy
└── QUICKSTART.md                  # Hướng dẫn chạy nhanh
```

---

## 🗺️ Roadmap

### ✅ Đã hoàn thành (v1.0)
- [x] Auth (register/login/logout, session-based, 2 vai trò)
- [x] Tutor profile (LinkedIn-style) + điểm uy tín công khai (8 quy tắc)
- [x] Search + filter + map (Leaflet + OSM) + phân trang + sort mới nhất
- [x] Booking flow: validation zod + conflict check 2 phía + khóa định kỳ 2/4/8/12 buổi
- [x] Dashboard 2 vai trò + Tutor Studio 1 trang (Tổng quan/Môn & giá/Lịch dạy)
- [x] Tin nhắn 1-1 + tin hệ thống tự động + badge chưa đọc
- [x] Review loop khép kín (COMPLETED sau giờ học → đánh giá → avgRating đầy đủ)
- [x] Hủy lịch kèm lý do → trừ điểm uy tín theo 8 quy tắc
- [x] Onboarding wizard + UX v2 chuẩn Airbnb/Grab/YouTube
- [x] 5 thành phố + 34 môn học theo cấp lớp + ONLINE đầy đủ
- [x] CI/CD (GitHub Actions + Vercel + Supabase) + Docker + PostgreSQL

### 🔄 Kế hoạch tiếp theo
- [ ] **Payment** — VNPay/MoMo tích hợp
- [ ] **Xác minh 2 bước** — OTP email/SĐT, upload bằng cấp
- [ ] **Admin dashboard** — quản trị viên
- [ ] **Upload avatar** thật (Cloudinary)
- [ ] **Email notification** (Resend) + nhắc buổi học qua email
- [ ] **SEO** — routing theo URL thật cho trang gia sư (chia sẻ/index tốt hơn)
- [ ] **Sentry** error monitoring
- [ ] **PWA** (Progressive Web App)

---

## 🤝 Quy trình làm việc (Git Workflow)

### Branch convention
```
main          → Production (deploy tự động lên Vercel)
staging       → Test environment
feature/*     → Tính năng mới (vd: feature/ai-matching)
fix/*         → Sửa bug (vd: fix/booking-conflict)
```

### Conventional Commits
```
feat:     tính năng mới        (vd: feat: thêm AI matching API)
fix:      sửa bug               (vd: fix: booking conflict check)
docs:     documentation         (vd: docs: cập nhật README)
style:    format code           (vd: style: format tutor-card)
refactor: refactor              (vd: refactor: tách dashboard component)
chore:    config, dependencies  (vd: chore: thêm leaflet package)
```

### Pull Request
1. Tạo branch: `git checkout -b feature/ten-feature`
2. Code + commit
3. Push: `git push origin feature/ten-feature`
4. Tạo PR trên GitHub → assign reviewer
5. CI tự động chạy (lint + typecheck + build)
6. Reviewer approve → merge vào `main`
7. Vercel tự động deploy



---

**Liên hệ**: https://github.com/coren-007/EXE101-turlean

*Made with ❤️ tại Việt Nam*
