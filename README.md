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
- Không cần cài đặt database riêng (SQLite tích hợp sẵn cho dev)

### Cài đặt & chạy

```bash
# 1. Clone repo
git clone https://github.com/coren-007/EXE101-turlean.git
cd EXE101-turlean

# 2. Cài dependencies
bun install

# 3. Tạo database + generate Prisma client
bun run db:push

# 4. Seed dữ liệu mẫu (34 môn, 26 gia sư, 12 học sinh, 50 bookings)
bun run seed

# 5. Chạy dev server
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
| **Database** | Prisma 6 ORM + SQLite (dev) → PostgreSQL (production) |
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
- **Filter đa tiêu chí**: cấp học (Tiểu học/THCS/THPT), phương thức dạy, tỉnh/thành, quận, giá (slider), đánh giá
- **Search text**: theo tên gia sư, nghề nghiệp, bio, tên môn học
- **2 view modes**: Grid (lưới card) và Map (bản đồ + list)
- **Sort**: đánh giá, giá, khoảng cách
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
- Dialog: chọn môn → phương thức → ngày → slot → ghi chú
- **Time slots tự generate** từ lịch trống của gia sư (30-min increments)
- Validation: không đặt ngày quá khứ, duration 0.5-4h, mode hợp lệ
- Conflict check: cả tutor và student không được trùng giờ
- Total amount tự tính từ giá × duration

### 📊 Dashboard
**Tutor**: Profile completeness, 4 stats (thu nhập/học sinh/giờ dạy/đánh giá), 3 tabs (Yêu cầu mới/Sắp dạy/Lịch sử), Reliability card
**Student**: 4 stats (sắp học/đã học/tổng chi/số gia sư), 2 tabs (Sắp tới/Lịch sử), Reliability card

### 🛡️ Hệ thống Hủy lịch + Vi phạm
- **Bắt buộc lý do hủy** (≥ 5 ký tự)
- **4 mức vi phạm** tùy ai hủy + status + thời gian:
  - Tutor hủy CONFIRMED < 2h → VI PHẠM NGHIÊM TRỌNG (-20 điểm)
  - Tutor hủy CONFIRMED < 24h → VI PHẠM (-20 điểm)
  - Tutor hủy CONFIRMED ≥ 24h → CẢNH BÁO (-10 điểm)
  - Student/Tutor hủy PENDING → cùng quy tắc (-15/-5/0)
- **Reliability score**: 100 - violations×15 - warnings×5
- **Tier**: XUẤT SẮC (≥90) → TỐT (70-89) → TRUNG BÌNH (50-69) → CẦN CẢI THIỆN (<50)
- **Public reliability**: student xem độ tin cậy của tutor trước khi đặt

### 🧙 Onboarding Wizard (Tutor mới)
3 bước: Thông tin chuyên môn → Môn dạy + giá → Phương thức & lịch dạy

### 📚 Quản lý môn dạy & Lịch trống
- CRUD môn dạy (thêm/sửa/xóa với check booking active)
- CRUD lịch trống theo tuần (thêm/xóa với check booking active)
- Auto-update hourlyRate = min của các môn

---

## 🗄️ Database Schema

9 models: **User, Subject, TutorSubject, Booking, Review, Cancellation, Availability, Session, MediaFile**

```
User (Student/Tutor)
├── TutorSubject ←→ Subject (môn dạy + giá)
├── Booking ←→ Subject (lịch đặt)
│   ├── Review (đánh giá sau buổi học)
│   └── Cancellation (record hủy + vi phạm)
├── Availability (lịch trống theo tuần)
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
| **Violations** | `GET /api/users/me/violations` |
| **Other** | `GET /api/subjects`, `GET /api/locations`, `GET /api/health` |

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
Tự động chạy khi push/PR lên `main` hoặc `staging`:
1. **Lint job**: Install → Generate Prisma → ESLint
2. **Build job**: Install → Generate Prisma → Build Next.js

### Deploy lên Vercel
1. Import repo trên https://vercel.com
2. Set `DATABASE_URL` = Supabase PostgreSQL connection string
3. Auto-deploy khi push `main`

Xem hướng dẫn chi tiết: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

### Scripts có sẵn

```bash
bun run dev          # Dev server (port 3000)
bun run build        # Build production
bun run start        # Chạy production server
bun run lint         # ESLint check
bun run typecheck    # TypeScript type check
bun run db:push      # Push schema to DB
bun run db:generate  # Generate Prisma client
bun run seed         # Seed dữ liệu mẫu
```

---

## 📁 Cấu trúc thư mục

```
├── .github/workflows/ci.yml       # CI pipeline
├── .github/PULL_REQUEST_TEMPLATE.md
├── prisma/schema.prisma           # 9 models DB
├── scripts/seed.ts                # Seed data
├── src/
│   ├── app/
│   │   ├── api/                   # 20+ API endpoints
│   │   ├── globals.css            # Tailwind + custom CSS
│   │   ├── layout.tsx             # Root layout
│   │   └── page.tsx               # SPA router
│   ├── components/
│   │   ├── pages/                 # 9 page components
│   │   ├── map/tutor-map.tsx      # Leaflet map
│   │   ├── ui/                    # 50+ shadcn/ui components
│   │   ├── header.tsx
│   │   ├── footer.tsx
│   │   └── tutor-card.tsx
│   └── lib/
│       ├── auth.ts                # Session + bcrypt + distance
│       ├── db.ts                  # Prisma client
│       ├── store.ts               # Zustand store
│       └── format.ts              # formatVnd, formatDate, formatTime24h
├── Dockerfile                     # Docker cho VPS
├── docker-compose.yml
├── vercel.json                    # Vercel deploy config
├── DEPLOYMENT.md                  # Hướng dẫn deploy
└── QUICKSTART.md                  # Hướng dẫn chạy nhanh
```

---

## 🗺️ Roadmap

### ✅ Đã hoàn thành (MVP)
- [x] Auth (register/login/logout, session-based)
- [x] Tutor profile (LinkedIn-style) + reliability score
- [x] Search với filter + map (Leaflet + OSM)
- [x] Booking flow với validation + conflict check
- [x] Dashboard (tutor + student) + Reliability card
- [x] Onboarding wizard cho tutor mới
- [x] Manage subjects + availability
- [x] Hệ thống hủy lịch + tracking vi phạm (4 mức)
- [x] Bản đồ tương tác 2 chiều (card ↔ marker)
- [x] 5 thành phố + 34 môn học theo cấp lớp
- [x] CI/CD pipeline (GitHub Actions + Vercel + Supabase)
- [x] Docker + Health check endpoint

### 🔄 Đang phát triển
- [ ] **AI Matching** ( ) — ghép học sinh ↔ gia sư thông minh
- [ ] **Payment System** ( ) — VNPay/MoMo tích hợp
- [ ] **Admin Management** ( ) — dashboard quản trị
- [ ] **Media & Profile** ( ) — upload avatar + bằng cấp
- [ ] **Realtime Chat** ( ) — Socket.io chat + notification
- [ ] **Statistics** ( ) — biểu đồ doanh thu + booking

### 📋 Cần làm tiếp
- [ ] AI Search bằng ngôn ngữ tự nhiên ("gia sư toán cấp 2 cầu giấy")
- [ ] AI Chatbot hỗ trợ tìm gia sư
- [ ] Upload avatar thật (Cloudinary)
- [ ] Trang Favorites
- [ ] Dark mode toggle button
- [ ] Email notification (Resend)
- [ ] Tutor no-show detection (cron job)
- [ ] Tự động khóa tài khoản nếu reliability < 30
- [ ] Migrate SQLite → PostgreSQL (Supabase) cho production
- [ ] Sentry error monitoring
- [ ] PWA (Progressive Web App)

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

**Liên hệ**: hotro@giasu.vn | 1900 1234

*Made with ❤️ tại Việt Nam*
