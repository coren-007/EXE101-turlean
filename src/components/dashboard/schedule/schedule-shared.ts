// ===== Types & helpers dùng chung cho Lịch dạy (calendar) =====

export interface Slot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface SessionAttendance {
  studentParentId: string
  status: string // PRESENT | ABSENT
  markedAt: string
}

export interface ClassSessionItem {
  id: string
  date: string // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string // HH:MM
  status: string // SCHEDULED | COMPLETED | CANCELLED
  note?: string | null
  attendance: SessionAttendance[]
}

export interface Enrollment {
  id: string
  status: string
  studentName: string | null
  note: string | null
  createdAt: string
  parent: { id: string; name: string; avatar?: string | null; phone?: string | null; district?: string | null }
}

export interface GroupClass {
  id: string
  title: string
  subject: { id: string; name: string }
  gradeLevel: string | null
  description: string | null
  meetingType: string
  address: string | null
  capacity: number
  monthlyFee: number | null
  status: string
  startDate: string | null
  schedule: Slot[]
  enrollments: Enrollment[]
  sessions: ClassSessionItem[]
  stats: {
    upcomingCount: number
    nextSession: { date: string; startTime: string; endTime: string } | null
    completedCount: number
    cancelledCount: number
  }
}

export interface BookingItem {
  id: string
  tutorId: string
  studentId: string
  mode: string
  date: string
  startTime: string
  endTime: string
  durationHours: number
  status: string
  note?: string | null
  totalAmount: number
  seriesId?: string | null
  seriesTotal?: number | null
  student: { id: string; name: string; avatar?: string | null; phone?: string | null; address?: string | null; district?: string | null }
  subject: { id: string; name: string }
}

export interface AvailabilitySlot {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
}

// Sự kiện hợp nhất trên lịch: buổi lớp nhóm hoặc buổi 1-1
export type CalEvent =
  | { kind: 'group'; cls: GroupClass; session: ClassSessionItem }
  | { kind: 'one'; booking: BookingItem }

// ===== Date helpers (múi giờ local, chuỗi YYYY-MM-DD) =====

export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// "HH:MM" → số phút từ 00:00
export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function addMinutesToKey(key: string, t: string, addMin: number): Date {
  const d = parseKey(key)
  d.setMinutes(toMinutes(t) + addMin)
  return d
}

// Thứ Hai của tuần chứa `d`
export function weekStartOf(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const dow = x.getDay() // 0 = Chủ nhật
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow))
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1)
  x.setHours(0, 0, 0, 0)
  return x
}

// Thứ trong tuần tiếng Việt (d.getDay(): 0=CN)
export const VN_DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
export const VN_DAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

// Thứ 2 → Chủ nhật
export const MON_FIRST = [1, 2, 3, 4, 5, 6, 0]

export function formatEventDate(key: string): string {
  const d = parseKey(key)
  return `${VN_DAY_NAMES[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function formatVndShort(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}tr₫`
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k₫`
  return `${amount}₫`
}

// ===== Nhãn + màu sự kiện =====

export function eventTitle(e: CalEvent): string {
  return e.kind === 'group' ? e.cls.title : e.booking.subject.name
}

export function eventSubtitle(e: CalEvent): string {
  return e.kind === 'group'
    ? `${e.cls.subject.name}${e.cls.gradeLevel ? ` · ${e.cls.gradeLevel}` : ''}`
    : `1-1 · ${e.booking.subject.name}`
}

export function eventDate(e: CalEvent): string {
  return e.kind === 'group' ? e.session.date : e.booking.date
}

export function eventStart(e: CalEvent): string {
  return e.kind === 'group' ? e.session.startTime : e.booking.startTime
}

export function eventEnd(e: CalEvent): string {
  return e.kind === 'group' ? e.session.endTime : e.booking.endTime
}

export function eventStatus(e: CalEvent): string {
  return e.kind === 'group' ? e.session.status : e.booking.status
}

export function eventTimeText(e: CalEvent): string {
  return `${eventStart(e)} – ${eventEnd(e)}`
}

// Khối màu block sự kiện trên lịch
export function eventBlockClass(e: CalEvent): string {
  if (e.kind === 'group') {
    switch (e.session.status) {
      case 'COMPLETED':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
      case 'CANCELLED':
        return 'bg-rose-100 hover:bg-rose-200 text-rose-700 border-rose-300'
      default:
        return 'bg-violet-600 hover:bg-violet-700 text-white border-violet-700'
    }
  }
  switch (e.booking.status) {
    case 'COMPLETED':
      return 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600'
    case 'PENDING':
      return 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600'
    case 'CONFIRMED':
      return 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

// Chấm màu trên lịch tháng
export function eventDotClass(e: CalEvent): string {
  if (e.kind === 'group') {
    switch (e.session.status) {
      case 'COMPLETED': return 'bg-emerald-600'
      case 'CANCELLED': return 'bg-rose-400'
      default: return 'bg-violet-600'
    }
  }
  switch (e.booking.status) {
    case 'COMPLETED': return 'bg-emerald-500'
    case 'PENDING': return 'bg-amber-500'
    case 'CONFIRMED': return 'bg-blue-600'
    default: return 'bg-muted-foreground/40'
  }
}

export const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Chờ diễn ra',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã nghỉ / hủy',
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
}

export const STATUS_BADGE_CLASS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
  PENDING: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
}

// Buổi đã đến giờ bắt đầu
export function isEventStarted(e: CalEvent): boolean {
  return new Date(`${eventDate(e)}T${eventStart(e)}`).getTime() <= Date.now()
}

// Buổi đã qua giờ kết thúc
export function isEventPast(e: CalEvent): boolean {
  return addMinutesToKey(eventDate(e), eventEnd(e), 0).getTime() <= Date.now()
}
