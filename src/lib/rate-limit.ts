// src/lib/rate-limit.ts
// ===== Rate limiting in-memory (bảo vệ brute-force / spam) =====
//
// Giải pháp sliding-window đơn giản bằng Map trong bộ nhớ tiến trình:
//  · Đủ dùng cho triển khai 1 node (sandbox + self-host Docker Compose hiện tại).
//  · Khi scale nhiều instance → thay bằng Redis/Upstash (giữ nguyên interface
//    checkRateLimit(key, limit, windowMs) để đổi dễ).
//
// Ghi chú bảo mật (audit S-RL): trước đây KHÔNG route nào có rate limit —
// login/register có thể dò mật khẩu vô hạn. Giờ các route nhạy cảm gọi:
//   login 10 lần / 5 phút / (IP + email) · register 20 lần / giờ / IP
//   suggest 60 lần / phút / IP (public autocomplete) · booking 30 lần / giờ / user

interface Bucket {
  hits: number[] // timestamps (ms) của các lần gọi trong cửa sổ
}

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 10_000 // tránh Map phình to khi bị dọn dẹp key rác

function pruneKey(bucket: Bucket, now: number, windowMs: number) {
  // Bỏ các hit đã quá cửa sổ
  while (bucket.hits.length > 0 && now - bucket.hits[0] > windowMs) {
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
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) {
      pruneKey(b, now, windowMs)
      if (b.hits.length === 0) buckets.delete(k)
    }
  }

  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { hits: [] }
    buckets.set(key, bucket)
  }
  pruneKey(bucket, now, windowMs)

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
