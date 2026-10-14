export function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatVndShort(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}tr`
  }
  if (amount >= 1_000) {
    return `${Math.round(amount / 1_000)}k`
  }
  return String(amount)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(iso: string | Date): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + hh + ':' + mm
}

// Format time string "HH:MM" or Date to 24h format "HH:MM"
export function formatTime24h(time: string | Date): string {
  if (time instanceof Date) {
    const hh = String(time.getHours()).padStart(2, '0')
    const mm = String(time.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  // Already "HH:MM" string - normalize to 24h
  const [h, m] = time.split(':')
  const hh = String(parseInt(h, 10)).padStart(2, '0')
  const mm = (m || '00').padStart(2, '0').slice(0, 2)
  return `${hh}:${mm}`
}

export function timeAgo(iso: string | Date): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)

  if (months > 0) return `${months} tháng trước`
  if (days > 0) return `${days} ngày trước`
  if (hours > 0) return `${hours} giờ trước`
  if (minutes > 0) return `${minutes} phút trước`
  return 'vừa xong'
}

// ===== Lớp học cố định (nhóm) =====
// dayOfWeek: 0 = Chủ nhật ... 6 = Thứ 7 (đồng nhất convention của Availability)
export const CLASS_DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
export const CLASS_DAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export interface ClassSlot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

// Sắp xếp các buổi trong tuần: Thứ 2 → Chủ nhật
export function sortClassSlots<T extends ClassSlot>(slots: T[]): T[] {
  return [...slots].sort((a, b) => {
    const av = a.dayOfWeek === 0 ? 7 : a.dayOfWeek
    const bv = b.dayOfWeek === 0 ? 7 : b.dayOfWeek
    return av - bv || a.startTime.localeCompare(b.startTime)
  })
}

// "T3 18:00–20:30 · T5 18:00–20:30" — tóm tắt lịch học cố định trong tuần
export function formatClassSchedule(slots: ClassSlot[]): string {
  if (slots.length === 0) return 'Chưa có lịch'
  return sortClassSlots(slots)
    .map(s => `${CLASS_DAY_SHORT[s.dayOfWeek]} ${s.startTime}–${s.endTime}`)
    .join(' · ')
}
