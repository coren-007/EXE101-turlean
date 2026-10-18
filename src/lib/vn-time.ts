// src/lib/vn-time.ts
// ===== Giờ Việt Nam (UTC+7) cho TOÀN BỘ logic thời gian phía server =====
//
// Audit SẸ-TZ (B3): 13 chỗ parse `new Date(`${date}T${time}`)` theo múi giờ
// SERVER. Dev/test ở máy VN thì đúng, nhưng deploy lên host UTC (Vercel,
// Docker mặc định) thì mọi cổng thời gian lệch 7 tiếng: hủy "trước 24h"
// thành "trước 17h", cho đánh dấu COMPLETED sớm 7h, dời buổi vào quá khứ…
//
// Nguyên tắc sau fix:
//  · Ngày/giờ trong DB (booking.date, classSession.date, availability…) là
//    GIỜ VIỆT NAM (người dùng VN nhập) → mọi phép so sánh với "hiện tại"
//    phải quy về epoch tuyệt đối theo +07:00, KHÔNG theo TZ server.
//  · Phép toán cộng/trừ ngày làm trên CHUỖI thuần (không qua Date object
//    local) để không bao giờ bị kéo lệch.
//  · Cron đã tự offset +07 từ trước (P1-12) — giữ nguyên.
//  · Docker/runtime additionally set TZ=Asia/Ho_Chi_Minh (Dockerfile,
//    docker-compose) để log/định dạng hiển thị cũng thống nhất; còn logic
//    thì KHÔNG phụ thuộc vào biến TZ này nữa.

/** Độ lệch giờ Việt Nam so với UTC (ms) — Asia/Ho_Chi_Minh (UTC+7, không DST) */
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * Epoch tuyệt đối (ms) của một ngày + giờ theo GIỜ VIỆT NAM.
 * `vnEpoch('2026-10-18', '18:00')` === epoch của 2026-10-18T18:00:00+07:00
 * (tức 11:00Z) — bất chấp TZ server là gì.
 * Thời gian mặc định '00:00' khi chỉ cần mốc đầu ngày.
 */
export function vnEpoch(dateISO: string, time = '00:00'): number {
  const t = time.length === 5 ? `${time}:00` : time
  return Date.parse(`${dateISO}T${t}+07:00`)
}

/** "Hôm nay" (YYYY-MM-DD) theo giờ Việt Nam — không phụ thuộc TZ server. */
export function vnTodayISO(): string {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10)
}

/** Kỳ tháng hiện tại "YYYY-MM" theo giờ Việt Nam. */
export function vnCurrentPeriod(): string {
  return vnTodayISO().slice(0, 7)
}

/** Kỳ tháng "YYYY-MM" của một Date object (epoch tuyệt đối) quy về giờ VN. */
export function vnMonthOf(date: Date): string {
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 7)
}

/** Thứ trong tuần (0=CN..6=T7) của một ngày YYYY-MM-DD (ngày VN). */
export function vnDayOfWeek(dateISO: string): number {
  return new Date(vnEpoch(dateISO) + VN_OFFSET_MS).getUTCDay()
}

/** Cộng/trừ ngày trên chuỗi YYYY-MM-DD (toán học thuần, không lệch TZ). */
export function addDaysISO(iso: string, days: number): string {
  return new Date(vnEpoch(iso) + days * 86_400_000 + VN_OFFSET_MS).toISOString().slice(0, 10)
}

/** Cộng n tuần — giữ nguyên thứ trong tuần (toán học thuần). */
export function addWeeksISO(iso: string, weeks: number): string {
  return addDaysISO(iso, weeks * 7)
}

/** Định dạng "20/10/2026" từ YYYY-MM-DD (tách chuỗi — tránh new Date(iso) lệch TZ). */
export function fmtDateVi(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}
