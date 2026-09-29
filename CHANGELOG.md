# Changelog

Mọi thay đổi đáng chú ý của dự án GiaSuConnect (Turlean).

## [1.0.0] — 2026-09-29

Release đầu tiên — hoàn thiện sản phẩm, sẵn sàng deploy production (Vercel + Supabase hoặc Docker + PostgreSQL).

### Nổi bật

- Sửa toàn bộ 12 lỗi audit P0/P1: trust framework thật (điểm uy tín + 8 quy tắc trừ điểm), review loop khép kín, chặn lộ email/SĐT, sửa bug endTime + giá dialog + logic COMPLETED
- Khóa học định kỳ (2/4/8/12 buổi) + dashboard lớp học có tiến độ + lịch tuần + tin nhắn 1-1 + thông báo tự động mọi sự kiện booking
- UX v2 chuẩn Airbnb/Grab/YouTube: trang chủ search-first + carousel, search chip lọc nhanh + map song song, Tutor Studio 1 trang (Tổng quan / Môn & giá / Lịch dạy)
- Chuyển database SQLite → PostgreSQL (Supabase), CI chuyển sang Bun, Docker kèm service PostgreSQL
- Gỡ 38 dependencies thừa, production build PASS (typecheck 0 lỗi, lint 0 lỗi)

---

> Ngày: 2026-09-19 · Phạm vi: Toàn bộ audit P0/P1 theo báo cáo đánh giá sản phẩm
> Môi trường: PostgreSQL (Supabase / Docker) cho cả dev lẫn production

---

## A. P0 — Vấn đề nghiêm trọng (đã sửa toàn bộ)

### P0-1 · Xây hệ thống Reliability Score THẬT (trước đây chỉ tồn tại trên README)

**Vấn đề:** README khai báo "điểm khác biệt cốt lõi" — 4 mức vi phạm, trừ điểm, tier XUẤT SẮC→CẦN CẢI THIỆN — nhưng **0 dòng code** tồn tại. Hủy lịch không có lý do, không hậu quả.

**Đã làm:**
- **Schema mới** `model Cancellation`: bookingId (unique), cancelledBy, reason, bookingStatus, hoursBefore, severity, points, createdAt
- **Thư viện** `src/lib/reliability.ts`: quy tắc phân loại vi phạm + tính điểm + tier + bulk compute cho trang search
- **Quy tắc trừ điểm** (công khai, công bằng 2 chiều):

| Ai hủy | Trạng thái | Độ sát giờ | Mức độ | Trừ điểm |
|---|---|---|---|---|
| Gia sư | CONFIRMED | < 2h | SEVERE (nghiêm trọng) | -20 |
| Gia sư | CONFIRMED | < 24h | VIOLATION | -15 |
| Gia sư | CONFIRMED | ≥ 24h | WARNING | -10 |
| Học sinh | CONFIRMED | < 2h | VIOLATION | -15 |
| Học sinh | CONFIRMED | < 24h | WARNING | -10 |
| Học sinh | CONFIRMED | ≥ 24h | MINOR | -5 |
| Bất kỳ | PENDING | ≥ 24h | NONE | 0 |
| Bất kỳ | PENDING | < 24h | MINOR | -5 |

- Score = max(0, 100 − tổng điểm trừ) · Tier: ≥90 Xuất sắc · 70-89 Tốt · 50-69 Trung bình · <50 Cần cải thiện
- **API mới:**
  - `POST /api/bookings/[id]/cancel` — hủy kèm lý do bắt buộc (≥5 ký tự, zod), transaction ghi Cancellation + đổi status, trả về mức vi phạm
  - `GET /api/users/me/violations` — lịch sử vi phạm + điểm của chính mình
  - `GET /api/tutors/[id]/reliability` — điểm công khai (phụ huynh xem trước khi đặt)
- **UI:** Reliability card trong Dashboard cả 2 vai trò (điểm + tier + progress + 3 chỉ số + lịch sử vi phạm), badge điểm tin cậy trên TutorCard + trang tìm kiếm, điểm tin cậy trong Quick Stats + sticky card trên profile
- **Chặn hủy "trơn":** `PATCH /api/bookings` từ chối status CANCELLED — mọi lần hủy phải qua /cancel
- Không cho hủy buổi đã đến giờ học

### P0-2 · Sửa luồng Review (trước đây đứt gãy 3 chỗ)

**Vấn đề:** Backend có POST /api/reviews nhưng UI chỉ hiện toast "sẽ có sớm" → không bao giờ có review thật; tutor bị đánh dấu hoàn thành TRƯỚC giờ học (logic đảo); avgRating chỉ tính 20 review mới nhất.

**Đã làm:**
- Dialog **đánh giá thật** trên Dashboard: chọn sao 1-5 + nhận xét → gọi API → toast cảm ơn
- Nút "Đánh giá buổi học" hiện cho mọi buổi COMPLETED **chưa** đánh giá (kể cả tab Lịch sử); buổi đã đánh giá hiện "Đã đánh giá x/5"
- `/api/bookings` GET trả kèm `review` để UI phân biệt trạng thái
- **Sửa logic hoàn thành:** tutor chỉ đánh dấu COMPLETED **sau** giờ bắt đầu buổi học (API chặn + UI chỉ hiện nút khi đến giờ)
- avgRating tính bằng `aggregate` từ **toàn bộ** review (không còn take:20)

### P0-3 · Ngừng lộ email/SĐT gia sư ra public

**Vấn đề:** `GET /api/tutors/[id]` trả email + phone cho bất kỳ ai không cần đăng nhập → rủi ro scrape/spam + bị "bay màu" nền tảng.

**Đã làm:**
- Loại email khỏi response; phone chỉ trả khi người xem là học sinh có booking PENDING/CONFIRMED/COMPLETED với gia sư đó
- Kiểm chứng: không login → phone null; có booking → phone hiện

### P0-4 · Xóa toàn bộ claims bịa trên UI

**Vấn đề:** "Đã xác minh bằng cấp" hiển thị cứng cho mọi gia sư; "Học thử miễn phí 30 phút"; "Phản hồi trong 2 giờ"; "Cao hơn 20% gia sư tương tự"; homepage "1.000+ gia sư", "4.8★" — trong khi DB chỉ có 26 gia sư, không có workflow verify.

**Đã làm:**
- Sticky card: chỉ hiện "Đã xác minh" khi `isVerified=true`, ngược lại "Chưa xác minh" xám trung thực; xóa 3 claims còn lại
- Homepage: badge "Minh bạch · Độ tin cậy theo điểm · Đặt lịch trực tiếp"; quick stats **lấy từ API thật** (26 gia sư, 4.7★ (39 đánh giá)) — tự cập nhật khi dữ liệu tăng
- Seed: `isVerified` chỉ còn ~1/4 gia sư (thực tế marketplace — phần còn lại "Chưa xác minh" chờ workflow verify Phase 2)
- Dialog đặt lịch: bỏ "xác nhận trong vòng 2 giờ"

### P0-5 · Sửa bug tính giờ kết thúc + validation server

**Vấn đề:** Client tính endTime bỏ qua phút bắt đầu (09:30 + 1.5h → 10:30 ❌); server tin durationHours client tự khai; không chặn đặt ngày quá khứ; PATCH /api/me không validate (post được học phí âm).

**Đã làm:**
- Tính endTime theo tổng phút: 08:30 + 1.5h = **10:00** ✅ (đã kiểm chứng API + DB)
- **Server tự tính** durationHours từ endTime − startTime (zod schema đầy đủ: regex date/giờ, mode ONLINE, duration 0.5-4h)
- Chặn: ngày quá khứ, endTime ≤ startTime, duration ngoài 0.5-4h
- PATCH /api/me validate zod: học phí 20.000-5.000.000đ, năm KN 0-60, lat/lng hợp lệ, regex SĐT
- **Bonus phát hiện thêm:** `durationHours Int` trong schema cắt mất 0.5h khi lưu (1.5→1) → đổi **Float**, giờ thống kê "Giờ dạy" chính xác

### P0-6 · Sửa hiển thị giá theo môn đã chọn

**Vấn đề:** Dialog đặt lịch hiển thị tổng tiền theo `hourlyRate` (giá rẻ nhất) thay vì giá môn đang chọn → UI nói một giá, backend lưu giá khác.

**Đã làm:** Price summary tính theo `pricePerHour` của môn đã chọn + hiện chi tiết "Môn (1.5h × 300.000đ/giờ)"; server tính totalAmount từ TutorSubject.pricePerHour × thời lượng thực.

---

## B. P1 — Cải thiện quan trọng (đã sửa)

| # | Vấn đề | Giải pháp |
|---|---|---|
| P1-7 | ONLINE mode hiển thị nhưng không filter/book được | Filter `?mode=ONLINE` (teachesOnline=true) + option "Học trực tuyến" trong booking dialog (không cần địa chỉ) + icon Video trên card + seed 5 gia sư online |
| P1-8 | Nút Share/Favorite không có onClick | Share: `navigator.share` (mobile) / copy link (desktop) + toast; Favorite: localStorage `favorite_tutors` + tim đỏ khi đã lưu |
| P1-10 | Conflict check chỉ cho gia sư | Thêm conflict check cho học sinh (không đặt 2 buổi trùng giờ) — đã test chặn |
| P1-11 | Search hoa-thường, không phân trang, tutor mới dồn đáy | Case-insensitive tương thích SQLite & PostgreSQL (env-detect); phân trang page/pageSize=12 + UI Trang x/y; sort "Mới nhất"; tutor <3 review dùng điểm khởi đầu 4.5 (cold-start) + badge "Gia sư mới"; "Chưa có đánh giá" thay vì "0.0★ (0 đánh giá)" |
| P1-12 | Cron reminder stub + sai timezone | Tính "ngày mai" theo Asia/Ho_Chi_Minh (UTC+7); gửi email thật qua Resend khi có RESEND_API_KEY (free 3.000 email/tháng), trả về emailsSent/emailsSkipped |
| P1-9 | Server validation toàn diện | Như P0-5 (zod cho booking POST + me PATCH + cancel POST) |

---

## C. Kết quả kiểm chứng (bằng chứng chạy thật)

**TypeScript: 0 lỗi · ESLint: 0 lỗi**

**13/13 API smoke tests PASS:**
1. Login 2 vai trò ✅ 2. Booking endTime 08:30+1.5h→10:00 ✅ 3. Chặn ngày quá khứ ✅ 4. Chặn endTime<sstartTime ✅ 5. Chặn double-booking học sinh ✅ 6. Chặn lý do hủy <5 ký tự ✅ 7. Hủy kèm lý do → ghi vi phạm đúng mức ✅ 8. Điểm tin cậy cập nhật ✅ 9. Chặn hủy trơn qua PATCH ✅ 10. Chặn học phí âm ✅ 11. SĐT chỉ hiện khi có booking ✅ 12. Search "toán"="Toán"=9 kết quả ✅ 13. Filter ONLINE=5 gia sư ✅

**Browser E2E (agent-browser) PASS:**
- Homepage hiển thị stats thật (26 gia sư · 4.7★ · 39 đánh giá)
- Trang tìm kiếm: badge độ tin cậy trên card, filter Trực tuyến, phân trang
- Profile: "Chưa xác minh" trung thực + "Độ tin cậy 70/100" + KHÔNG còn 4 claims bịa (check tự động)
- Dashboard: Reliability card, hủy lịch qua dialog (nút khóa đến khi đủ 5 ký tự), booking chuyển sang Lịch sử
- Review UI: chọn 4 sao + nhận xét → lưu DB đúng (rating=4, comment đủ)

**Screenshots:** `download/screenshots/01-homepage.png`, `02-search.png`, `03-tutor-profile.png`, `04-dashboard.png`

---

## D. Cách áp dụng vào repo GitHub của bạn

```bash
# Trong repo của bạn, giải nén giasuconnect-fixed.zip rồi copy đè:
cp -r giasuconnect-fixed/src ./            # toàn bộ code đã sửa
cp giasuconnect-fixed/prisma/schema.prisma ./prisma/
cp giasuconnect-fixed/scripts/seed.ts ./scripts/
# Lưu ý schema: bản zip dùng SQLite cho dev.
# Khi deploy Supabase/PostgreSQL: đổi 3 dòng datasource về:
#   datasource db {
#     provider  = "postgresql"
#     url       = env("DATABASE_URL")
#     directUrl = env("DIRECT_URL")
#   }
# (các model hoàn toàn tương thích cả 2 DB)
bun install          # nếu thiếu leaflet/bcryptjs: bun add bcryptjs leaflet leaflet.markercluster react-leaflet
bun run db:push      # cập nhật schema (thêm bảng Cancellation + durationHours Float)
bun run seed         # seed lại kèm dữ liệu reliability demo
```

**Files mới được thêm:**
- `src/lib/reliability.ts` — lõi hệ thống điểm tin cậy
- `src/app/api/bookings/[id]/cancel/route.ts` — hủy lịch kèm vi phạm
- `src/app/api/users/me/violations/route.ts` — lịch sử vi phạm cá nhân
- `src/app/api/tutors/[id]/reliability/route.ts` — điểm tin cậy công khai
- `scripts/smoke-test.sh` — 18 test nghiệp vụ (chạy lại bất cứ lúc nào)

**Files sửa chính:** `prisma/schema.prisma`, `scripts/seed.ts`, `src/app/api/bookings/route.ts`, `src/app/api/tutors/route.ts`, `src/app/api/tutors/[id]/route.ts`, `src/app/api/me/route.ts`, `src/app/api/cron/reminder/route.ts`, `src/components/pages/tutor-profile-page.tsx`, `src/components/pages/dashboard-page.tsx`, `src/components/pages/search-page.tsx`, `src/components/pages/home-page.tsx`, `src/components/tutor-card.tsx`

---

# PHASE 2 — Hoàn thiện theo 3 trụ cột sản phẩm (2026-09-29)

> 3 trụ cột: (1) Dễ quản lý lớp học cho 2 bên · (2) Dễ tìm kiếm, kết nối 2 bên · (3) Minh bạch giá cả

## F. Trụ cột 1 — Quản lý lớp học cho 2 bên

### F-1 · Lớp học định kỳ (recurring) — dạy kèm thật là học theo tuần
- Dialog đặt lịch thêm 2 kiểu: **"Đặt 1 buổi"** (làm quen) hoặc **"Khóa định kỳ"** 2/4/8/12 buổi, cùng khung giờ mỗi tuần
- Server kiểm tra conflict **từng tuần**, tự bỏ qua tuần trùng lịch và báo rõ `skipped` (ngày + lý do) trong phản hồi
- Các buổi cùng khóa chia sẻ `seriesId` + `seriesTotal`; tạo trong 1 transaction đảm bảo tính toàn vẹn
- Badge **"Buổi i/N của khóa định kỳ"** trên từng thẻ buổi học trong Dashboard
- Dialog hiển thị buổi đầu → buổi cuối + ghi chú "gia sư xác nhận từng buổi" + dòng xanh "Tuần nào bị trùng lịch sẽ được bỏ qua và báo rõ"

### F-2 · Dashboard "Lớp học của tôi" + Lịch tuần
- **Lịch tuần** 7 ô Thứ 2→CN, điều hướng tuần trước/sau, hôm nay được highlight; mỗi ô liệt kê buổi học màu theo trạng thái (chờ/xác nhận/xong)
- **Lớp học đang dạy (gia sư) / đang theo học (phụ huynh)**: nhóm buổi theo (đối tác × môn), thẻ hiển thị tiến độ **x/y buổi hoàn thành** + progress bar, buổi tới, số tiền đã xong (+chờ), badge "Đang hoạt động/Đã kết thúc", số buổi đã hủy, nút "Nhắn tin" và "N yêu cầu chờ duyệt"
- Thống kê "Thu nhập" đổi thành **"Thu nhập (buổi đã hoàn thành)"** + dòng phụ "Thanh toán trực tiếp · 0% phí nền tảng" (trụ cột 3)

## G. Trụ cột 2 — Kết nối 2 bên

### G-1 · Tin nhắn in-app 1-1
- Model `Conversation` (1 cặp tutor-student duy nhất) + `Message` (readAt, kind)
- Trang Tin nhắn layout 2 cột (mobile: stack + nút quay lại), poll danh sách 15s / thread 4s, optimistic UI khi gửi, "Đã xem", badge số chưa đọc trên header (poll 30s)
- Nút "Nhắn tin" trên hồ sơ gia sư **và trên từng thẻ buổi học/lớp học** trong Dashboard

### G-2 · Thông báo booking tự động (notification) — 2 bên luôn biết chuyện gì đang xảy ra
- Thư viện `src/lib/notify.ts`; mỗi sự kiện rơi thẳng vào hội thoại Tin nhắn dạng **thẻ "Thông báo lớp học"** (không phải bong bóng chat):
  - Học sinh đặt lịch/khóa → gia sư nhận `[Lớp học mới]` / `[Khóa học định kỳ]` (kèm số buổi, khung giờ, học phí, các tuần bị bỏ qua)
  - Gia sư xác nhận → học sinh nhận `[Đã xác nhận]` (kèm học phí + cách thanh toán)
  - Gia sư đánh dấu xong → `[Hoàn thành]` + lời mời đánh giá
  - Một bên hủy → bên kia nhận `[Đã hủy]` kèm **lý do** + mức ảnh hưởng độ tin cậy
- Tin hệ thống tính vào badge chưa đọc; mở thread là tự đánh dấu đã đọc; notify lỗi không bao giờ làm fail giao dịch booking (best-effort)

## H. Trụ cột 3 — Minh bạch giá cả
- Bảng giá trong dialog: đơn giá môn × giờ × số buổi → **tổng khóa**, dòng **"Phí nền tảng: 0đ — miễn phí"**, chú thích "Học phí thanh toán trực tiếp cho gia sư sau mỗi buổi — cả hai bên thấy cùng một con số, không phí ẩn"
- Thông báo hệ thống luôn kèm học phí buổi + tổng khóa
- Dashboard gia sư: thu nhập chỉ tính buổi HOÀN THÀNH + ghi rõ "thanh toán trực tiếp, 0% phí"

## I. Kiểm chứng Phase 2
- **TypeScript 0 lỗi · ESLint 0 lỗi** (sửa 1 lỗi react-hooks/set-state-in-effect ở header)
- **18/18 smoke test PASS**, thêm 5 test mới: (14) đặt khóa định kỳ 2 tuần → 2 buổi + seriesId + tổng tiền; (15) gia sư nhận thông báo hệ thống + badge chưa đọc; (16) xác nhận → học sinh nhận `[Đã xác nhận]`; (17) gửi tin nhắn → gia sư thấy chưa đọc; (18) hủy kèm lý do → thông báo `[Đã hủy]` cho bên kia
- **Browser E2E PASS**: dashboard 2 vai trò (lịch tuần có buổi 18:30 thứ Tư, thẻ lớp "8 buổi · khóa định kỳ · 2/8 hoàn thành", 5 yêu cầu chờ duyệt), trang Tin nhắn (4 thẻ thông báo hệ thống + badge 5 chưa đọc), dialog đặt lịch (2/4/8/12 buổi + bảng giá minh bạch)
- Screenshots mới: `05-dashboard-classes.png`, `06-messages-notifications.png`, `07-tutor-dashboard.png`, `08-booking-dialog.png`
- Seed: khóa demo 8 buổi Toán (2 xong + 1 xác nhận + 5 chờ) + 2 hội thoại mẫu có tin thật & tin hệ thống

## J. Files Phase 2
**Mới:** `src/lib/notify.ts`, `src/app/api/conversations/route.ts`, `src/app/api/conversations/[id]/route.ts`, `src/components/pages/messages-page.tsx`, `scripts/daemon_dev.py`
**Sửa:** `prisma/schema.prisma` (Conversation, Message + kind, Booking.seriesId/seriesTotal), `scripts/seed.ts`, `src/app/api/bookings/route.ts`, `src/app/api/bookings/[id]/cancel/route.ts`, `src/components/pages/dashboard-page.tsx`, `src/components/pages/tutor-profile-page.tsx`, `src/components/header.tsx`

---

## K. Còn lại cho Phase 3 (Launch & Grow)

- Workflow verify bằng cấp thật (upload → admin duyệt) — hiện "Đã xác minh" là flag qua DB
- Payment (VNPay/MoMo) — hiện "Thanh toán trực tiếp sau buổi học" (0% phí giai đoạn Founding Tutor)
- Admin dashboard + tự khóa tài khoản khi reliability < 30
- SEO/multi-page routing, push notification (email Resend đã sẵn đường qua cron reminder)

---

# PHASE 2.5 — UX/UI REDESIGN v2 (chuẩn Airbnb/Grab/YouTube)

Phản hồi người dùng: (1) giao diện/bố cục khó dùng; (2) quy trình gia sư rườm rà (phải quản lý "slot lịch trống", "quản lý môn dạy" rời rạc); (3) luồng phụ huynh cần hợp lý hơn; (4) trải nghiệm tìm kiếm lạc hậu so với Airbnb/Grab/YouTube.

## L. Design system v2 (`globals.css`)
- Token làm mới: nền giấy ấm (`oklch(0.99 0.003 20)`), radius mặc định 1rem, border/foreground dịu hơn
- Bộ tiện ích mới: **elevation 4 mức** (`shadow-e1..e4`), **card-lift** (hover nổi thẻ), **chip** (pill lọc kiểu danh mục Airbnb, trạng thái `is-active` đảo màu), **row-scroll** (carousel ngang scroll-snap, ẩn scrollbar), **skeleton-shimmer** (loading nhấp nháy), **search-pill** (thanh tìm pill Airbnb), **section-pad**
- Font Be Vietnam Pro giữ nguyên (đã đúng chuẩn Việt)

## M. Header — gọn theo vai trò
- Nav giữa dạng **pill tabs** (Khám phá / Tìm gia sư / Trang quản lý) thay nav chữ rời
- Menu thả xuống chỉ còn 4 mục theo vai trò (Trang quản lý, Tin nhắn, Hồ sơ công khai/Tìm gia sư, Đăng xuất) — **bỏ hẳn** "Quản lý môn dạy" + "Lịch trống" + "Chỉnh sửa hồ sơ" (đã gộp vào workspace)
- Guest thấy CTA "Trở thành gia sư" + Đăng ký pill

## N. Trang chủ — "Airbnb của gia sư"
- Hero giữa: headline mới + **search pill 3 ngăn** (Môn học | Thành phố | Tìm kiếm)
- **Chip danh mục sticky** cuộn ngang (11 môn nóng: Toán, Vật lý, IELTS, Piano…) → bấm vào là vào search có sẵn bộ lọc
- **3 carousel ngang kiểu YouTube** (Gia sư đánh giá cao / Gia sư Toán / Gia sư Tiếng Anh-IELTS) với nút mũi tên, thẻ 270–290px, skeleton shimmer khi tải
- Mục **"Hai luồng đơn giản"**: 2 thẻ song song — phụ huynh 3 bước (Tìm & so sánh → Đặt học thử → Theo dõi & đánh giá) và **gia sư 3 bước đúng như mong muốn** (Đăng hồ sơ 5 phút → Nhận yêu cầu → Xác nhận & dạy), kèm dòng "không cần thao tác slot rời rạc — mọi thứ trong một trang"
- WHY-US viết lại đúng sự thật (điểm uy tín công khai, đánh giá thật, 0 phí ẩn) + CTA theo vai trò

## O. Trang tìm kiếm — discovery hiện đại
- **Sticky top**: search pill (từ khóa + thành phố + nút Tìm) + nút GPS "Gần tôi" + nút "Bộ lọc (n)" + toggle Lưới/Bản đồ
- **Hàng chip lọc nhanh** cuộn ngang: 4 cấp học · 3 phương thức · 4 mức giá · đánh giá 4★+/4.5★+ — bấm là lọc
- Bộ lọc chi tiết (thành phố có số lượng, quận có số lượng, slider giá, đánh giá) chuyển sang **Sheet trượt phải**
- Giữ 100% logic cũ: localStorage bộ lọc, phân trang 12, sort 5 kiểu, conflict GPS 15km, bản đồ Leaflet split-view + pick vị trí + cluster; `alert()` thay bằng toast
- Card danh sách bản đồ + skeleton dạng shimmer

## P. Tutor Studio — 1 trang quản lý duy nhất (trụ cột "quản lý lớp học")
- **Dashboard gia sư có 3 tab workspace** (sticky pill bar): **Tổng quan | Môn & giá | Lịch dạy** — URL đồng bộ `?view=dashboard&tab=…`
- `manage-subjects` / `manage-availability` (trang riêng rời) → **tự chuyển hướng vào tab tương ứng** (tương thích link cũ)
- **Panel Môn & giá mới** (`src/components/dashboard/tutor-subjects-panel.tsx`): danh sách thẻ môn với giá to rõ, **sửa inline tại chỗ** (giá + mô tả), dialog thêm môn theo nhóm + tìm kiếm + chọn nhiều, xóa từng dòng, ghi chú "0% phí nền tảng" + tham chiếu thị trường
- **Panel Lịch dạy mới** (`src/components/dashboard/tutor-schedule-panel.tsx`): **lưới tuần T2→CN bấm ô bật/tắt khung giờ 2h** (API sync tức thì), tổng hợp 7 thẻ ngày dạng chip xóa nhanh, dialog khung giờ tùy chỉnh (19:00–21:00…), hiển thị "đang mở N khung giờ/tuần"
- Sửa bug: POST availability trả object trực tiếp — panel cũ đọc `data.availability` (undefined) gây crash khi toggle ô lưới
- Onboarding wizard: thông điệp mới "Đăng hồ sơ một lần — học sinh tự tìm đến", nhãn 3 bước, lưới lịch T2→CN khớp workspace, thông báo "Sau khi đăng bạn không cần làm gì thêm", nút cuối = "Đăng hồ sơ lên sóng"

## Q. Dashboard phụ huynh — hành động nhanh trước
- Thẻ **"N yêu cầu đang chờ gia sư xác nhận"** (vàng) ngay dưới lời chào → bấm Xem chiếu tab Sắp tới
- **Banner gradient "Tìm gia sư phù hợp hôm nay"** với CTA trắng nổi bật
- Giữ nguyên: 4 stat, độ tin cậy, lịch tuần, lớp học đang theo học (có tiến độ + nhắn tin), tabs sắp tới/lịch sử, đánh giá sau buổi

## R. TutorCard — thẻ listing hiện đại
- Cover gradient cá nhân hóa (ổn định theo tên), avatar lớn viền trắng, giá overlay pill dưới phải, **sao vàng gộp bên phải tên**, badge Đã xác minh/Gia sư mới/độ tin cậy màu theo tier (trắng→màu đậm), chip môn + "+N", icon 3 phương thức, hover card-lift

## S. Kiểm chứng Phase 2.5
- **TSC 0 lỗi · ESLint 0 lỗi**
- **18/18 smoke test PASS** (chạy lại toàn bộ sau redesign)
- **Browser E2E PASS**: home (hero + chip + carousel render), search (bấm chip THCS + Trực tuyến → 26→18→3 kết quả đúng API), map split-view Leaflet render OK, tutor login → workspace 3 tab + URL sync, panel Môn & giá sửa inline, **lưới Lịch dạy toggle ô T2 06:00 thêm/xóa thành công qua API** (đã dọn slot test), student dashboard (banner 5 yêu cầu chờ + CTA), onboarding mới
- VLM review 2 vòng: phát hiện **CSS chunk stale của Turbopack** (chip/class mới không được serve) → đã xóa `.next` + restart daemon, xác minh computed style chip đúng (flex/nowrap/pill/999px); các cảnh báo "overflow" còn lại là hành vi cuộn ngang chủ ý (pattern Airbnb) + artifact cắt viewport khi chụp
- Screenshots mới: `10–20` (hero, carousel, 2 luồng, search chip, search lọc, dashboard gia sư, tab Môn&giá, tab Lịch dạy, dashboard phụ huynh, bản đồ, onboarding)
- Lưu ý vận hành: sau khi sửa `globals.css` cần **xóa `.next`** rồi restart dev server (cache Turbopack)

## T. Files Phase 2.5
**Mới:** `src/components/dashboard/tutor-subjects-panel.tsx`, `src/components/dashboard/tutor-schedule-panel.tsx`
**Sửa:** `src/app/globals.css`, `src/components/header.tsx`, `src/components/tutor-card.tsx`, `src/components/pages/home-page.tsx`, `src/components/pages/search-page.tsx`, `src/components/pages/dashboard-page.tsx`, `src/components/pages/onboarding-page.tsx`, `src/lib/store.ts` (View dashboard + tab), `src/app/page.tsx` (manage-* → dashboard tab)
**Không dùng nữa (giữ tương thích):** `manage-subjects-page.tsx`, `manage-availability-page.tsx` (URL cũ vẫn hoạt động qua redirect nội bộ)
