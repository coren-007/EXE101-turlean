// src/lib/rate-limit.ts
// ===== Rate limiting in-memory (bảo vệ brute-force / spam) =====
//
// Giải pháp sliding-window đơn giản bằng Map trong bộ nhớ tiến trình:
//  · Đủ dùng cho triển khai 1 node (sandbox + self-host Docker Compose hiện tại).
//  · Khi scale nhiều instance → thay bằng Redis/Upstash (giữ nguyên interface
//    checkRateLimit(key, limit, windowMs) để đổi dễ).
//
// Ghi chú bảo mật (audit S-RL): trước đây KHÔNG route nào có rate limit —
//   login/register có thể dò mật khẩu vô hạn. Giờ các route nhạy cảm gọi:
//   login 10 lần / 5 phút / (IP + email) + 10 lần / 5 phút / email (SẸ-XFF)
//   register 20 lần / giờ / IP + 100 lần / giờ / global (SẸ-XFF)
//   suggest 60 lần / phút / IP (public autocomplete) · booking 30 lần / giờ / user
//   msg 30 tin / phút / user (SẸ-RL3) · tutors search 60 lần / phút / IP (SẸ-RL2)
//
// SẸ-XFF (B4, audit CAO): clientIp() tin header x-forwarded-for ĐẦU TIÊN.
//   Trên Vercel/proxy đúng cấu hình (ghi đè XFF) thì đó là IP client thật.
//   Nhưng self-host nếu proxy KHÔNG ghi đè XFF, kẻ tấn công tự đặt header
//   fake mỗi request → mỗi IP ảo một bucket → rate limit theo IP vô hiệu.
//   Giải pháp 2 LỚP (không phụ thuộc XFF):
//   · login: THÊM bucket key theo EMAIL THUẦN — email không spoof được, dò
//     brute-force một tài khoản luôn bị kẹp 10 lần/5 phút dù IP gì
//   · register: THÊM bucket global — spam tạo tài khoản rác bị kẹp tổng
//     quát dù fake bao nhiêu IP
//   · Khi triển khai sau proxy tự quản lý: đảm bảo proxy GHI ĐÈ x-forwarded-for
//     (Caddy/Nginx proxy_set_header) — chỉ khi đó IP-based bucket đúng nghĩa.
//
// SẸ-WIN (B12, audit TRUNG BÌNH): bucket tự lưu windowMs của route sở hữu nó —
//   trước đây dọn dẹp toàn cục dùng windowMs của request ĐANG gọi cho bucket
//   của route KHÁC (vd suggest 60s làm bucket login 5 phút bị prune sai).

interface Bucket {
  hits: number[] // timestamps (ms) của các lần gọi trong cửa sổ
  windowMs: number // cửa sổ CỦA ROUTE sở hữu bucket này (không phải của request đang dọn)
}

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 10_000 // tránh Map phình to khi bị dọn dẹp key rác

function pruneKey(bucket: Bucket, now: number) {
  // Bỏ các hit đã quá cửa sổ CỦA BUCKET (SẸ-WIN B12)
  while (bucket.hits.length > 0 && now - bucket.hits[0] > bucket.windowMs) {
    bucket.hits.shift()
  }
}

export interface RateLimitResult {
  ok: boolean
  /** Số lần còn lại trong cửa sổ (khi ok) */
  remaining: number
  /** Giây còn lại đến khi hết hạn (khi bị chặn) */
  retryAfterSec: number
}

/**
 * Kiểm tra + ghi nhận 1 lần gọi. Trả về ok=false nếu vượt ngưỡng.
 * @param key      khóa định danh (vd: `login:ip:email`, `suggest:ip`)
 * @param limit    số lần tối đa trong windowMs
 * @param windowMs cửa sổ thời gian (ms)
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  // Dọn rác định kỳ: khi quá nhiều key, xóa các bucket rỗng/cũ
  // (mỗi bucket tự dùng windowMs riêng — SẸ-WIN B12)
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) {
      pruneKey(b, now)
      if (b.hits.length === 0) buckets.delete(k)
    }
  }

  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { hits: [], windowMs }
    buckets.set(key, bucket)
  } else if (bucket.windowMs !== windowMs) {
    // Route chủ bucket đổi ngưỡng (hiếm) — đồng bộ cửa sổ mới
    bucket.windowMs = windowMs
  }
  pruneKey(bucket, now)

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0]
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    }
  }

  bucket.hits.push(now)
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSec: 0 }
}

/** Lấy IP client từ header chuẩn của proxy (Caddy/Nginx/Next). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
