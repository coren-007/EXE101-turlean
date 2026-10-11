// P5: "Đã xem gần đây" — gia sư hồ sơ user đã mở (localStorage, tối đa 12).
// Đơn giản, không cần đăng nhập: lưu danh sách id theo thứ tự mới-nhất-trước.
// Trang chủ + trang Yêu thích đọc danh sách này rồi fetch /api/tutors?ids=... (giữ thứ tự).

const KEY = 'giasuconnect:recently-viewed'
const MAX = 12

export function getRecentlyViewed(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((x: unknown) => typeof x === 'string').slice(0, MAX)
  } catch {
    return []
  }
}

export function pushRecentlyViewed(tutorId: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const next = [tutorId, ...getRecentlyViewed().filter(id => id !== tutorId)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
    return next
  } catch {
    return []
  }
}

export function clearRecentlyViewed() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {}
}
