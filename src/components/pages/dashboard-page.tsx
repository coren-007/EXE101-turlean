'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { RatingStars } from '@/components/rating-stars'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import {
  Calendar, Clock, MapPin, Home, School, Wallet, TrendingUp,
  CheckCircle2, XCircle, AlertCircle, Phone, MessageSquare,
  Star, BookOpen, Users, ArrowRight, Briefcase, GraduationCap,
  PencilLine, BookOpenCheck, CalendarCheck, ExternalLink, Sparkles,
  Award, ChevronRight, ChevronLeft, UserCheck, Clock3, ShieldCheck, Video, Repeat2,
  Search
} from 'lucide-react'
import { formatVnd, formatDate, timeAgo } from '@/lib/format'
import { toast } from 'sonner'
import { TutorSubjectsPanel } from '@/components/dashboard/tutor-subjects-panel'
import { TutorScheduleCalendar } from '@/components/dashboard/schedule/tutor-schedule-calendar'
import { TutorClassManager } from '@/components/dashboard/tutor-class-manager'
import { StudentClassesPanel } from '@/components/dashboard/student-classes-panel'

interface Booking {
  id: string
  tutorId: string
  studentId: string
  mode: string
  date: string
  startTime: string
  endTime: string
  durationHours: number
  status: string
  createdAt?: string
  address?: string | null
  note?: string | null
  totalAmount: number
  seriesId?: string | null
  seriesTotal?: number | null
  review?: { id: string; rating: number } | null // P0-2: đã đánh giá chưa
  tutor: { id: string, name: string, avatar?: string | null, profession?: string | null, phone?: string | null, address?: string | null, district?: string | null, lat?: number | null, lng?: number | null }
  student: { id: string, name: string, avatar?: string | null, phone?: string | null, address?: string | null, district?: string | null }
  subject: { id: string, name: string }
}

interface Stats {
  subjectCount: number
  availabilityCount: number
  reviewCount: number
  avgRating: number
  totalEarnings: number
  totalHours: number
  uniqueStudents: number
  totalBookings: number
}

interface Completeness {
  percent: number
  checks: Record<string, boolean>
  missing: string[]
}

interface ReliabilityData {
  reliability: {
    score: number
    tier: { key: string; label: string; color: string }
    totalCancellations: number
    violations: number
    warnings: number
  }
  violations: {
    id: string
    severity: string
    points: number
    reason: string
    hoursBefore: number
    createdAt: string
    subject: string
    counterpart: string
    date: string
    startTime: string
  }[]
}

const SEVERITY_MAP: Record<string, { label: string; color: string }> = {
  SEVERE: { label: 'Vi phạm nghiêm trọng', color: 'text-rose-600 bg-rose-100' },
  VIOLATION: { label: 'Vi phạm', color: 'text-rose-600 bg-rose-50' },
  WARNING: { label: 'Cảnh báo', color: 'text-amber-600 bg-amber-100' },
  MINOR: { label: 'Nhẹ', color: 'text-amber-600 bg-amber-50' },
  NONE: { label: 'Không ảnh hưởng', color: 'text-muted-foreground bg-muted' },
}

const TIER_COLOR_CLASS: Record<string, string> = {
  EXCELLENT: 'text-emerald-600',
  GOOD: 'text-blue-600',
  AVERAGE: 'text-amber-600',
  POOR: 'text-rose-600',
}

const STATUS_MAP: Record<string, { label: string, color: string, icon: any }> = {
  PENDING: { label: 'Chờ xác nhận', color: 'bg-amber-100 text-amber-700', icon: AlertCircle },
  CONFIRMED: { label: 'Đã xác nhận', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
  COMPLETED: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  CANCELLED: { label: 'Đã hủy', color: 'bg-rose-100 text-rose-700', icon: XCircle },
}

const COMPLETENESS_LABELS: Record<string, string> = {
  hasBio: 'Giới thiệu bản thân',
  hasProfession: 'Chức danh chuyên môn',
  hasEducation: 'Học vấn',
  hasHourlyRate: 'Học phí',
  hasSubjects: 'Môn dạy',
  hasAvailability: 'Lịch trống',
  hasTeachingMode: 'Phương thức dạy',
  hasLocation: 'Vị trí',
}

// ===== Helpers cho lịch tuần (Mục đích 1 — quản lý lớp học) =====
const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

// Buổi học lớp nhóm hiển thị trên lịch tuần hợp nhất (Mục đích 1 — trước đây
// WeekSchedule chỉ hiện buổi 1-1, lịch lớp nhóm bị tách rời)
interface GroupSessionEntry {
  id: string
  classId: string
  date: string
  startTime: string
  endTime: string
  status: string
  title: string
  subjectName: string
  counterpartName: string // gia sư (đối với học sinh) / không dùng (đối với gia sư)
}

// Thứ Hai của tuần cách hiện tại `offset` tuần
function weekStart(offset: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0 = Chủ nhật
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diffToMonday + offset * 7)
  return d
}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface ClassGroup {
  key: string
  isSeries: boolean
  counterpartId: string
  counterpartName: string
  counterpartAvatar?: string | null
  counterpartProfession?: string | null
  subjectName: string
  mode: string
  sessions: Booking[]
  completed: number
  upcoming: number
  pending: number
  cancelled: number
  activeTotal: number // tổng tiền các buổi chưa hủy
  completedAmount: number
  pendingAmount: number
  nextSession?: Booking
  lastCompleted?: Booking
  unitPrice: number
}

export function DashboardPage() {
  const { user, navigate, view } = useApp()

  // Workspace tab cho gia sư: Tổng quan / Môn & giá / Lịch dạy / Lớp học
  // (tương thích view cũ manage-subjects / manage-availability)
  const activeWsTab: 'overview' | 'subjects' | 'schedule' | 'classes' =
    view.name === 'dashboard' && view.tab
      ? view.tab
      : view.name === 'manage-subjects'
        ? 'subjects'
        : view.name === 'manage-availability'
          ? 'schedule'
          : 'overview'
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'requests' | 'upcoming' | 'history'>('requests')
  const [stats, setStats] = useState<Stats | null>(null)
  const [completeness, setCompleteness] = useState<Completeness | null>(null)
  const [reliabilityData, setReliabilityData] = useState<ReliabilityData | null>(null)
  // Mục đích 1 — lịch tuần: điều hướng giữa các tuần
  const [weekOffset, setWeekOffset] = useState(0)
  // Lớp học cố định (nhóm): đếm cho thẻ hành động nhanh + badge tab
  const [classStats, setClassStats] = useState<{ open: number; pending: number } | null>(null)
  // Buổi học lớp nhóm (hợp nhất vào lịch tuần + hiển thị buổi tới)
  const [groupSessions, setGroupSessions] = useState<GroupSessionEntry[]>([])

  // P0-1: dialog hủy lịch kèm lý do
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [submittingCancel, setSubmittingCancel] = useState(false)

  // P0-2: dialog đánh giá buổi học (thay cho toast "sẽ có sớm")
  const [reviewTarget, setReviewTarget] = useState<Booking | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([
      fetch(`/api/bookings?role=${user.role === 'TUTOR' ? 'tutor' : 'student'}`).then(r => r.json()),
      user.role === 'TUTOR'
        ? fetch('/api/tutors/me/stats').then(r => r.json())
        : Promise.resolve(null),
      // P0-1: điểm tin cậy & lịch sử vi phạm của chính mình
      fetch('/api/users/me/violations').then(r => r.json()).catch(() => null),
      // Lớp học cố định (nhóm) của gia sư — đếm lớp đang mở + đơn chờ duyệt
      // + BUỔI HỌC lớp nhóm (hợp nhất lịch tuần)
      user.role === 'TUTOR'
        ? fetch('/api/classes/mine').then(r => r.json()).catch(() => null)
        : Promise.resolve(null),
      // Học sinh: buổi học lớp nhóm của các lớp đã VÀO LỚP (hợp nhất lịch tuần)
      user.role === 'STUDENT'
        ? fetch('/api/enrollments/mine').then(r => r.json()).catch(() => null)
        : Promise.resolve(null),
    ]).then(([data, s, rel, clsMine, enrollMine]) => {
      setBookings(data.bookings || [])
      if (s?.stats) setStats(s.stats)
      if (s?.completeness) setCompleteness(s.completeness)
      if (rel?.reliability) setReliabilityData(rel)
      if (clsMine?.classes) {
        const open = clsMine.classes.filter((c: any) => c.status === 'OPEN').length
        const pending = clsMine.classes.reduce(
          (sum: number, c: any) => sum + c.enrollments.filter((e: any) => e.status === 'PENDING').length, 0,
        )
        setClassStats({ open, pending })
        // Trích buổi học lớp nhóm của gia sư (loại buổi đã nghỉ)
        const sessions: GroupSessionEntry[] = []
        for (const c of clsMine.classes as any[]) {
          for (const s2 of c.sessions ?? []) {
            if (s2.status === 'CANCELLED') continue
            sessions.push({
              id: s2.id,
              classId: c.id,
              date: s2.date,
              startTime: s2.startTime,
              endTime: s2.endTime,
              status: s2.status,
              title: c.title,
              subjectName: c.subject.name,
              counterpartName: '',
            })
          }
        }
        setGroupSessions(sessions)
      }
      if (enrollMine?.enrollments) {
        // Chỉ lớp đã APPROVED mới hiện buổi học trên lịch tuần của học sinh
        const sessions: GroupSessionEntry[] = []
        for (const e of enrollMine.enrollments as any[]) {
          if (e.status !== 'APPROVED') continue
          for (const s2 of e.class.sessions ?? []) {
            if (s2.status === 'CANCELLED') continue
            sessions.push({
              id: s2.id,
              classId: e.class.id,
              date: s2.date,
              startTime: s2.startTime,
              endTime: s2.endTime,
              status: s2.status,
              title: e.class.title,
              subjectName: e.class.subject.name,
              counterpartName: e.class.tutor.name,
            })
          }
        }
        setGroupSessions(sessions)
      }
      setLoading(false)
    })
  }, [user])

  if (!user) {
    return (
      <div className="container mx-auto max-w-md py-16 text-center">
        <h2 className="text-2xl font-bold mb-2">Cần đăng nhập</h2>
        <Button onClick={() => navigate({ name: 'login' })}>Đăng nhập</Button>
      </div>
    )
  }

  const isTutor = user.role === 'TUTOR'
  const otherParty = isTutor ? 'student' : 'tutor'

  const now = new Date()
  // Tutor: requests = pending bookings they need to confirm
  // Student: requests = pending bookings waiting for tutor's confirmation (also visible in upcoming)
  const requests = bookings.filter(b => b.status === 'PENDING' && new Date(b.date + 'T' + b.startTime) >= now)

  // Upcoming: confirmed OR pending (for student) bookings that haven't passed
  const upcoming = bookings.filter(b => {
    if (new Date(b.date + 'T' + b.startTime) < now) return false
    if (isTutor) return b.status === 'CONFIRMED'
    // Student: see both PENDING (awaiting confirmation) and CONFIRMED
    return b.status === 'CONFIRMED' || b.status === 'PENDING'
  })
  const history = bookings.filter(b =>
    b.status === 'COMPLETED' || b.status === 'CANCELLED' ||
    new Date(b.date + 'T' + b.startTime) < now
  )

  requests.sort((a, b) => a.createdAt?.localeCompare(b.createdAt?.toString() || '') || 0)
  upcoming.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
  history.sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))

  const totalSpent = !isTutor
    ? bookings.filter(b => b.status === 'COMPLETED').reduce((s, b) => s + b.totalAmount, 0)
    : 0

  const handleStatusChange = async (bookingId: string, status: string) => {
    const actionLabel = status === 'CONFIRMED' ? 'xác nhận' : 'cập nhật'
    try {
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, status })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Cập nhật thất bại')
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b))
      toast.success(`Đã ${actionLabel} thành công`)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  // P0-1: mở dialog hủy lịch (bắt buộc lý do >= 5 ký tự)
  const openCancelDialog = (b: Booking) => {
    setCancelTarget(b)
    setCancelReason('')
  }

  const submitCancel = async () => {
    if (!cancelTarget) return
    if (cancelReason.trim().length < 5) {
      toast.error('Vui lòng nhập lý do hủy (tối thiểu 5 ký tự)')
      return
    }
    setSubmittingCancel(true)
    try {
      const res = await fetch(`/api/bookings/${cancelTarget.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Hủy lịch thất bại')
      setBookings(prev => prev.map(b => b.id === cancelTarget.id ? { ...b, status: 'CANCELLED' } : b))
      toast.success(data.message || 'Đã hủy lịch')
      if (data.violation?.points > 0) {
        toast.warning(`Độ tin cậy của bạn bị trừ ${data.violation.points} điểm (${data.violation.label})`, { duration: 6000 })
      }
      setCancelTarget(null)
      // Làm mới điểm tin cậy sau khi hủy
      fetch('/api/users/me/violations').then(r => r.json()).then(rel => {
        if (rel?.reliability) setReliabilityData(rel)
      }).catch(() => {})
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmittingCancel(false)
    }
  }

  // P0-2: gửi đánh giá thật qua API
  const submitReview = async () => {
    if (!reviewTarget) return
    if (reviewRating < 1) {
      toast.error('Vui lòng chọn số sao đánh giá')
      return
    }
    setSubmittingReview(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: reviewTarget.id,
          rating: reviewRating,
          comment: reviewComment.trim() || undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gửi đánh giá thất bại')
      toast.success('Cảm ơn bạn đã đánh giá buổi học!')
      setReviewTarget(null)
      setReviewRating(5)
      setReviewComment('')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmittingReview(false)
    }
  }

  // Mục đích 2 — mở hội thoại với đối tác (từ thẻ buổi học hoặc thẻ lớp học)
  const openChat = async (otherUserId: string) => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Không mở được hội thoại')
      navigate({ name: 'messages', conversationId: data.conversationId })
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  // Mục đích 1 — vị trí buổi học trong khóa định kỳ (buổi i/N)
  const seriesInfo = (b: Booking) => {
    if (!b.seriesId) return null
    const sessions = bookings
      .filter(x => x.seriesId === b.seriesId)
      .sort((x, y) => (x.date + x.startTime).localeCompare(y.date + y.startTime))
    const index = sessions.findIndex(x => x.id === b.id) + 1
    return { index, total: b.seriesTotal ?? sessions.length }
  }

  const BookingCard = ({ b, showActions = true }: { b: Booking, showActions?: boolean }) => {
    const status = STATUS_MAP[b.status] || STATUS_MAP.PENDING
    const StatusIcon = status.icon
    const other = b[otherParty as 'tutor' | 'student']
    const classStart = new Date(b.date + 'T' + b.startTime)
    const isPast = classStart < now // buổi học ĐÃ ĐẾN/QUA giờ bắt đầu
    const modeLabel = b.mode === 'ONLINE' ? 'Trực tuyến' : b.mode === 'TUTOR_TO_STUDENT' ? 'Gia sư đến nhà' : 'Tại cơ sở'

    return (
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 rounded-xl">
            <AvatarImage src={other.avatar || undefined} alt={other.name} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {other.name.charAt(0)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">{other.name}</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {b.subject.name} • {isTutor ? 'Học sinh' : 'Gia sư'}
                  {other.district ? ` • ${other.district}` : ''}
                </p>
              </div>
              <Badge className={`${status.color} border-0 text-[10px] gap-1 shrink-0`}>
                <StatusIcon className="h-3 w-3" /> {status.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(b.date)}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {b.startTime} - {b.endTime}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                {b.mode === 'TUTOR_TO_STUDENT' ? <Home className="h-3.5 w-3.5" /> : b.mode === 'ONLINE' ? <Video className="h-3.5 w-3.5" /> : <School className="h-3.5 w-3.5" />}
                {modeLabel}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                <span className="font-semibold text-foreground">{formatVnd(b.totalAmount)}</span>
              </div>
            </div>

            {b.address && (
              <div className="flex items-start gap-1.5 mt-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="line-clamp-1">{b.address}</span>
              </div>
            )}

            {b.note && (
              <div className="mt-2 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground">
                <span className="font-semibold">Ghi chú:</span> {b.note}
              </div>
            )}

            {/* Mục đích 1 — badge vị trí buổi trong khóa định kỳ */}
            {(() => {
              const si = seriesInfo(b)
              if (!si) return null
              return (
                <div className="mt-2">
                  <Badge variant="outline" className="text-[10px] gap-1 bg-violet-50 text-violet-700 border-violet-200">
                    <Repeat2 className="h-3 w-3" />
                    Buổi {si.index}/{si.total} của khóa định kỳ
                  </Badge>
                </div>
              )
            })()}

            {showActions && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {b.status === 'PENDING' && isTutor && (
                  <>
                    <Button size="sm" onClick={() => handleStatusChange(b.id, 'CONFIRMED')} disabled={isPast}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Xác nhận
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openCancelDialog(b)}>
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Từ chối
                    </Button>
                  </>
                )}
                {b.status === 'PENDING' && !isTutor && (
                  <Button size="sm" variant="outline" onClick={() => openCancelDialog(b)}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Hủy yêu cầu
                  </Button>
                )}
                {/* P0-2: đánh dấu hoàn thành chỉ hiện SAU khi buổi học đã bắt đầu */}
                {b.status === 'CONFIRMED' && isPast && isTutor && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange(b.id, 'COMPLETED')}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Đánh dấu đã dạy xong
                  </Button>
                )}
                {b.status === 'CONFIRMED' && !isPast && (
                  <Button size="sm" variant="outline" onClick={() => openCancelDialog(b)}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Hủy buổi học
                  </Button>
                )}
                {other.phone && (b.status === 'CONFIRMED' || b.status === 'COMPLETED') && (
                  <Button size="sm" variant="ghost" onClick={() => window.open(`tel:${other.phone}`)}>
                    <Phone className="h-3.5 w-3.5 mr-1" /> Gọi
                  </Button>
                )}
                {/* Mục đích 2 — nhắn tin với đối tác ngay từ buổi học */}
                {(b.status === 'PENDING' || b.status === 'CONFIRMED') && (
                  <Button size="sm" variant="ghost" onClick={() => openChat(other.id)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1" /> Nhắn tin
                  </Button>
                )}
              </div>
            )}

            {/* P0-2: trạng thái đánh giá — nút chỉ hiện cho buổi CHƯA đánh giá,
                 buổi đã đánh giá hiển thị sao đã chấm */}
            {b.status === 'COMPLETED' && !isTutor && !b.review && (
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => setReviewTarget(b)}>
                  <Star className="h-3.5 w-3.5 mr-1" /> Đánh giá buổi học
                </Button>
              </div>
            )}
            {b.status === 'COMPLETED' && !isTutor && b.review && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span>Đã đánh giá {b.review.rating}/5</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    )
  }

  // P0-1: thẻ độ tin cậy hiển thị trong dashboard (cả 2 vai trò)
  const ReliabilitySection = () => {
    if (!reliabilityData?.reliability) return null
    const rel = reliabilityData.reliability
    const tierClass = TIER_COLOR_CLASS[rel.tier.key] || 'text-muted-foreground'
    return (
      <Card className="p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <h3 className="font-semibold text-sm">Độ tin cậy của bạn</h3>
              <span className={`text-lg font-bold ${tierClass}`}>
                {rel.score}/100 · {rel.tier.label}
              </span>
            </div>
            <Progress value={rel.score} className="h-2 mb-3" />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-xs text-muted-foreground">Lần hủy</p>
                <p className="font-bold text-sm">{rel.totalCancellations}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-xs text-muted-foreground">Vi phạm</p>
                <p className="font-bold text-sm text-rose-600">{rel.violations}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-xs text-muted-foreground">Cảnh báo</p>
                <p className="font-bold text-sm text-amber-600">{rel.warnings}</p>
              </div>
            </div>
            {reliabilityData.violations.length > 0 && (
              <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                {reliabilityData.violations.slice(0, 5).map(v => (
                  <div key={v.id} className="flex items-start justify-between gap-2 p-2 rounded-lg border text-xs">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{v.subject} — {v.counterpart}</p>
                      <p className="text-muted-foreground truncate">{v.reason}</p>
                      <p className="text-muted-foreground/70">{formatDate(v.date)} {v.startTime} · {timeAgo(v.createdAt)}</p>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${SEVERITY_MAP[v.severity]?.color ?? ''}`}>
                      -{v.points}đ
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    )
  }

  // ===== Mục đích 1 — Lịch tuần HỢP NHẤT: buổi 1-1 + buổi lớp nhóm trên cùng lưới =====
  const WeekSchedule = () => {
    const start = weekStart(weekOffset)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return d
    })
    const todayKey = dateKey(new Date())
    const cells = days.map(d => {
      const key = dateKey(d)
      const bSessions = bookings.filter(b =>
        b.date === key &&
        (b.status === 'PENDING' || b.status === 'CONFIRMED' || b.status === 'COMPLETED'),
      )
      // Buổi lớp nhóm cùng ngày (đã nghỉ không hiển thị)
      const gSessions = groupSessions.filter(g => g.date === key)
      return { d, key, bSessions, gSessions }
    })
    return (
      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" /> Lịch tuần
            <span className="text-[10px] font-normal text-muted-foreground">
              buổi 1-1 + lớp nhóm
            </span>
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-semibold"
              onClick={() => navigate({ name: 'dashboard', tab: 'schedule' })}
            >
              Lịch đầy đủ
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(w => w - 1)} aria-label="Tuần trước">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={weekOffset === 0 ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setWeekOffset(0)}
            >
              Tuần này
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(w => w + 1)} aria-label="Tuần sau">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map(({ d, key, bSessions, gSessions }) => (
            <div
              key={key}
              className={`rounded-lg border p-1.5 min-h-[70px] ${key === todayKey ? 'border-primary bg-primary/5' : ''}`}
            >
              <p className="text-[9px] font-medium text-muted-foreground uppercase leading-none">
                {DAY_LABELS[(d.getDay() + 6) % 7]}
              </p>
              <p className={`text-sm font-bold ${key === todayKey ? 'text-primary' : ''}`}>{d.getDate()}</p>
              <div className="mt-0.5 space-y-0.5">
                {bSessions.slice(0, 2).map(s => (
                  <div
                    key={s.id}
                    className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate ${
                      s.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : s.status === 'CONFIRMED'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                    title={`${s.startTime} ${s.subject.name} · ${s[otherParty as 'tutor' | 'student'].name}`}
                  >
                    {s.startTime} {s.subject.name}
                  </div>
                ))}
                {/* Buổi lớp nhóm — nền tím để phân biệt buổi 1-1 */}
                {gSessions.slice(0, 2).map(g => (
                  <div
                    key={g.id}
                    className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate ${
                      g.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-violet-100 text-violet-700'
                    }`}
                    title={`${g.startTime} ${g.title} · ${g.subjectName}${g.counterpartName ? ` · ${g.counterpartName}` : ''}`}
                  >
                    {g.startTime} {g.title.length > 14 ? g.title.slice(0, 14) + '…' : g.title}
                  </div>
                ))}
                {bSessions.length + gSessions.length > 4 && (
                  <p className="text-[9px] text-muted-foreground">+{bSessions.length + gSessions.length - 4} buổi</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    )
  }

  // ===== Mục đích 1 — Lớp học của tôi: nhóm buổi theo (đối tác × môn), có tiến độ =====
  const ClassGroups = () => {
    const map = new Map<string, Booking[]>()
    for (const b of bookings) {
      const counterpart = b[otherParty as 'tutor' | 'student']
      const key = `${counterpart.id}|${b.subject.id}`
      const arr = map.get(key) ?? []
      arr.push(b)
      map.set(key, arr)
    }
    const groups = [...map.entries()].map(([key, sessions]) => {
      const sorted = [...sessions].sort((a, b) =>
        (a.date + a.startTime).localeCompare(b.date + b.startTime),
      )
      const counterpart = sorted[0][otherParty as 'tutor' | 'student']
      const activeSessions = sorted.filter(s => s.status !== 'CANCELLED')
      const completedList = sorted.filter(s => s.status === 'COMPLETED')
      const upcomingList = activeSessions.filter(
        s => (s.status === 'PENDING' || s.status === 'CONFIRMED') && new Date(s.date + 'T' + s.startTime) >= now,
      )
      return {
        key,
        isSeries: sorted.some(s => !!s.seriesId),
        counterpartId: counterpart.id,
        counterpartName: counterpart.name,
        counterpartAvatar: counterpart.avatar,
        counterpartProfession: (counterpart as any).profession ?? null,
        subjectName: sorted[0].subject.name,
        mode: sorted[0].mode,
        sessions: sorted,
        completed: completedList.length,
        upcoming: upcomingList.length,
        pending: sorted.filter(s => s.status === 'PENDING').length,
        cancelled: sorted.length - activeSessions.length,
        activeTotal: activeSessions.reduce((s, x) => s + x.totalAmount, 0),
        completedAmount: completedList.reduce((s, x) => s + x.totalAmount, 0),
        pendingAmount: sorted.filter(s => s.status === 'PENDING').reduce((s, x) => s + x.totalAmount, 0),
        nextSession: upcomingList[0],
        lastCompleted: completedList[completedList.length - 1],
      }
    })
    // Lớp đang hoạt động trước; cùng nhóm sắp theo buổi gần nhất
    groups.sort((a, b) => {
      const aActive = a.upcoming > 0 ? 1 : 0
      const bActive = b.upcoming > 0 ? 1 : 0
      if (aActive !== bActive) return bActive - aActive
      const aKey = a.nextSession?.date ?? a.lastCompleted?.date ?? ''
      const bKey = b.nextSession?.date ?? b.lastCompleted?.date ?? ''
      return bKey.localeCompare(aKey)
    })

    if (groups.length === 0) return null

    return (
      <div className="mb-6">
        <h2 className="font-bold text-base mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          {isTutor ? 'Lớp học đang dạy' : 'Lớp học đang theo học'}
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {groups.map(g => {
            const total = g.sessions.length - g.cancelled
            const progress = total > 0 ? Math.round((g.completed / total) * 100) : 0
            const modeLabel = g.mode === 'ONLINE' ? 'Trực tuyến' : g.mode === 'TUTOR_TO_STUDENT' ? 'Gia sư đến nhà' : 'Tại cơ sở'
            return (
              <Card key={g.key} className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-11 w-11 rounded-xl shrink-0">
                    <AvatarImage src={g.counterpartAvatar || undefined} alt={g.counterpartName} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {g.counterpartName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm truncate">{g.subjectName}</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {g.counterpartName}
                          {g.counterpartProfession ? ` · ${g.counterpartProfession}` : ''}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {modeLabel} · {total} buổi{g.isSeries ? ' · khóa định kỳ' : ''}
                          {g.cancelled > 0 ? ` · ${g.cancelled} đã hủy` : ''}
                        </p>
                      </div>
                      {g.upcoming > 0 ? (
                        <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px] shrink-0">Đang hoạt động</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">Đã kết thúc</Badge>
                      )}
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Tiến độ</span>
                        <span className="font-semibold">{g.completed}/{total} buổi hoàn thành</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase">Buổi tới</p>
                        <p className="font-medium">
                          {g.nextSession
                            ? `${formatDate(g.nextSession.date)} · ${g.nextSession.startTime}`
                            : g.lastCompleted
                              ? `${formatDate(g.lastCompleted.date)} (cuối)`
                              : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] uppercase">
                          {isTutor ? 'Đã dạy xong' : 'Đã chi'}
                        </p>
                        <p className="font-medium">
                          {formatVnd(g.completedAmount)}
                          {g.pendingAmount > 0 && (
                            <span className="text-amber-600"> (+{formatVnd(g.pendingAmount)} chờ)</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => openChat(g.counterpartId)}>
                        <MessageSquare className="h-3.5 w-3.5 mr-1" /> Nhắn tin
                      </Button>
                      {g.pending > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => setTab('requests')}>
                          {g.pending} yêu cầu chờ duyệt
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // P0-1 + P0-2: dialog hủy lịch (lý do bắt buộc) + dialog đánh giá buổi học
  const DashboardDialogs = () => (
    <>
      {/* Dialog hủy lịch kèm lý do */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hủy buổi học</DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>Buổi {cancelTarget.subject.name} · {formatDate(cancelTarget.date)} · {cancelTarget.startTime}—{cancelTarget.endTime}</>
              )}
              <br />Lý do hủy là bắt buộc và được ghi lại để bảo vệ tính minh bạch cho cả hai bên.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ví dụ: Con ốm phải đưa đi khám... (tối thiểu 5 ký tự)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Hủy sát giờ học có thể ảnh hưởng điểm độ tin cậy của bạn.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Giữ lịch</Button>
            <Button variant="destructive" onClick={submitCancel} disabled={submittingCancel || cancelReason.trim().length < 5}>
              {submittingCancel ? 'Đang xử lý...' : 'Xác nhận hủy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog đánh giá buổi học (P0-2) */}
      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Đánh giá buổi học</DialogTitle>
            <DialogDescription>
              {reviewTarget && (
                <>Buổi {reviewTarget.subject.name} với gia sư {reviewTarget.tutor.name} · {formatDate(reviewTarget.date)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-semibold mb-2">Bạn đánh giá buổi học này mấy sao?</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className="p-1 transition-transform hover:scale-110"
                    aria-label={`${star} sao`}
                  >
                    <Star
                      className={`h-8 w-8 ${star <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold mb-2">Nhận xét (tùy chọn)</p>
              <Textarea
                placeholder="Gia sư dạy dễ hiểu, đúng giờ, nhiệt tình..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Để sau</Button>
            <Button onClick={submitReview} disabled={submittingReview}>
              {submittingReview ? 'Đang gửi...' : 'Gửi đánh giá'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )

  // TUTOR DASHBOARD LAYOUT — workspace 4 tab: Tổng quan / Môn & giá / Lịch dạy / Lớp học
  if (isTutor) {
    const wsTabs: { id: 'overview' | 'subjects' | 'schedule' | 'classes'; label: string }[] = [
      { id: 'overview', label: 'Tổng quan' },
      { id: 'subjects', label: 'Môn & giá' },
      { id: 'schedule', label: 'Lịch dạy' },
      { id: 'classes', label: 'Lớp học' },
    ]
    return (
      <div>
        {/* Thanh tab workspace — mọi thao tác quản lý gom về 1 trang */}
        <div className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b border-border/60">
          <div className="container mx-auto max-w-6xl px-4 py-2.5">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {wsTabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => navigate({ name: 'dashboard', tab: t.id === 'overview' ? undefined : t.id })}
                  className={`px-4 h-9 rounded-full text-sm font-bold whitespace-nowrap transition-all relative ${
                    activeWsTab === t.id
                      ? 'bg-foreground text-background shadow-e1'
                      : 'text-muted-foreground hover:text-foreground bg-muted/60'
                  }`}
                >
                  {t.label}
                  {t.id === 'classes' && classStats && classStats.pending > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {classStats.pending}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Xin chào, {user.name}!</h1>
            <p className="text-sm text-muted-foreground">Quản lý lớp học, lịch dạy và thu nhập</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ name: 'my-profile' })}>
              <ExternalLink className="h-4 w-4 mr-1" /> Xem hồ sơ
            </Button>
            <Button variant="outline" onClick={() => navigate({ name: 'profile-edit' })}>
              <PencilLine className="h-4 w-4 mr-1" /> Sửa hồ sơ
            </Button>
          </div>
        </div>

        {activeWsTab === 'overview' && (<>
        {/* Profile completeness alert */}
        {completeness && completeness.percent < 100 && (
          <Card className="p-4 mb-6 border-amber-200 bg-amber-50/50">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold text-sm">Hoàn thiện hồ sơ ({completeness.percent}%)</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate({ name: 'onboarding' })}
                  >
                    Hoàn thiện ngay <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Hồ sơ đầy đủ 100% được ưu tiên hiển thị và nhận nhiều yêu cầu hơn
                </p>
                <Progress value={completeness.percent} className="h-2" />
                {completeness.missing.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {completeness.missing.map(m => (
                      <Badge key={m} variant="outline" className="text-[10px] gap-1 bg-background">
                        <XCircle className="h-3 w-3 text-amber-600" />
                        {COMPLETENESS_LABELS[m] || m}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Thu nhập (buổi đã hoàn thành)</p>
                <p className="text-lg font-bold">{formatVnd(stats?.totalEarnings || 0)}</p>
                <p className="text-[10px] text-muted-foreground">Thanh toán trực tiếp · 0% phí nền tảng</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Học sinh</p>
                <p className="text-lg font-bold">{stats?.uniqueStudents || 0}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Giờ dạy</p>
                <p className="text-lg font-bold">{stats?.totalHours || 0}h</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đánh giá</p>
                <p className="text-lg font-bold">{stats?.avgRating.toFixed(1) || '0.0'}★ ({stats?.reviewCount || 0})</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
            onClick={() => navigate({ name: 'dashboard', tab: 'subjects' })}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Môn & giá</p>
                  <p className="text-xs text-muted-foreground">{stats?.subjectCount || 0} môn · giá niêm yết</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
          </Card>

          <Card
            className="p-4 cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
            onClick={() => navigate({ name: 'dashboard', tab: 'schedule' })}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Lịch dạy</p>
                  <p className="text-xs text-muted-foreground">Lịch tuần/tháng · điểm danh · dời buổi</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
          </Card>

          <Card
            className="p-4 cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
            onClick={() => navigate({ name: 'dashboard', tab: 'classes' })}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Lớp học</p>
                  <p className="text-xs text-muted-foreground">
                    {classStats
                      ? `${classStats.open} lớp cố định đang mở${classStats.pending > 0 ? ` · ${classStats.pending} đơn chờ` : ''} · quản lý buổi 1-1`
                      : 'Lớp cố định nhóm + buổi 1-1 theo giờ trống'}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
          </Card>

          <Card
            className="p-4 cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
            onClick={() => navigate({ name: 'my-profile' })}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <ExternalLink className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Hồ sơ công khai</p>
                  <p className="text-xs text-muted-foreground">Xem như học sinh</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
          </Card>
        </div>

        {/* P0-1: độ tin cậy của gia sư */}
        <ReliabilitySection />

        {/* Mục đích 1 — lịch tuần + lớp học đang dạy */}
        <WeekSchedule />
        <ClassGroups />

        {/* Bookings tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="requests" className="relative">
              Yêu cầu mới
              {requests.length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {requests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="upcoming">Sắp dạy ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="history">Lịch sử ({history.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            {loading ? (
              <Card className="p-12 text-center text-sm text-muted-foreground">Đang tải...</Card>
            ) : requests.length === 0 ? (
              <Card className="p-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">Không có yêu cầu mới</h3>
                <p className="text-sm text-muted-foreground">
                  Khi học sinh đặt lịch, yêu cầu sẽ xuất hiện ở đây để bạn xác nhận
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {requests.map(b => <BookingCard key={b.id} b={b} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upcoming">
            {loading ? (
              <Card className="p-12 text-center text-sm text-muted-foreground">Đang tải...</Card>
            ) : upcoming.length === 0 ? (
              <Card className="p-12 text-center">
                <CalendarCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">Chưa có buổi học sắp tới</h3>
                <p className="text-sm text-muted-foreground">
                  Các buổi học đã xác nhận sẽ hiển thị tại đây
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {upcoming.map(b => <BookingCard key={b.id} b={b} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            {loading ? (
              <Card className="p-12 text-center text-sm text-muted-foreground">Đang tải...</Card>
            ) : history.length === 0 ? (
              <Card className="p-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">Chưa có lịch sử dạy</h3>
                <p className="text-sm text-muted-foreground">
                  Buổi học đã hoàn thành hoặc hủy sẽ hiển thị tại đây
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {history.map(b => <BookingCard key={b.id} b={b} showActions={false} />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
        </>)}

        {activeWsTab === 'subjects' && <TutorSubjectsPanel />}
        {activeWsTab === 'schedule' && <TutorScheduleCalendar />}
        {activeWsTab === 'classes' && <TutorClassManager />}

        <DashboardDialogs />
      </div>
      </div>
    )
  }

  // STUDENT DASHBOARD LAYOUT
  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Xin chào, {user.name}!</h1>
          <p className="text-sm text-muted-foreground">Theo dõi lịch học và quản lý buổi học</p>
        </div>
      </div>

      {/* Yêu cầu đang chờ gia sư xác nhận */}
      {requests.length > 0 && (
        <Card className="p-4 mb-6 border-amber-200 bg-amber-50/60">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
              <Clock3 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{requests.length} yêu cầu đang chờ gia sư xác nhận</p>
              <p className="text-xs text-muted-foreground">Bạn sẽ nhận được thông báo khi gia sư phản hồi.</p>
            </div>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setTab('upcoming')}>
              Xem chi tiết <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
        </Card>
      )}

      {/* Hành động nhanh: tìm gia sư */}
      <div className="rounded-2xl bg-gradient-to-r from-primary to-rose-500 p-5 md:p-6 text-primary-foreground mb-6 flex items-center justify-between gap-4 flex-wrap shadow-e2">
        <div>
          <p className="font-extrabold text-lg">Tìm gia sư phù hợp hôm nay</p>
          <p className="text-sm text-primary-foreground/85 mt-0.5">
            So sánh học phí và điểm uy tín — đặt buổi học thử chỉ trong vài phút.
          </p>
        </div>
        <Button
          className="bg-white text-primary hover:bg-white/90 rounded-full font-bold shadow-e1"
          onClick={() => navigate({ name: 'search' })}
        >
          <Search className="h-4 w-4 mr-1" /> Tìm gia sư
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sắp học</p>
              <p className="text-lg font-bold">{upcoming.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Đã học</p>
              <p className="text-lg font-bold">{bookings.filter(b => b.status === 'COMPLETED').length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tổng chi</p>
              <p className="text-lg font-bold">{formatVnd(totalSpent)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gia sư đã học</p>
              <p className="text-lg font-bold">{new Set(bookings.filter(b => b.status === 'COMPLETED').map(b => b.tutorId)).size}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* P0-1: độ tin cậy của học sinh/phụ huynh */}
      <ReliabilitySection />

      {/* Lớp học cố định (nhóm) đã đăng ký — hiện khi có ít nhất 1 đăng ký */}
      <StudentClassesPanel />

      {/* Mục đích 1 — lịch tuần + lớp học đang theo học */}
      <WeekSchedule />
      <ClassGroups />

      {/* Tabs */}
      <Tabs value={tab === 'requests' ? 'upcoming' : tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="upcoming">Sắp tới ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="history">Lịch sử ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          {loading ? (
            <Card className="p-12 text-center text-sm text-muted-foreground">Đang tải...</Card>
          ) : upcoming.length === 0 ? (
            <Card className="p-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-semibold mb-1">Chưa có buổi học nào sắp tới</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Khám phá hàng trăm gia sư chất lượng và đặt lịch học ngay
              </p>
              <Button onClick={() => navigate({ name: 'search' })}>
                <Users className="h-4 w-4 mr-1" /> Tìm gia sư <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {upcoming.map(b => <BookingCard key={b.id} b={b} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {loading ? (
            <Card className="p-12 text-center text-sm text-muted-foreground">Đang tải...</Card>
          ) : history.length === 0 ? (
            <Card className="p-12 text-center">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-semibold mb-1">Chưa có lịch sử học</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Buổi học đã hoàn thành sẽ hiển thị tại đây
              </p>
              <Button variant="outline" onClick={() => navigate({ name: 'search' })}>
                <Users className="h-4 w-4 mr-1" /> Bắt đầu học
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {history.map(b => <BookingCard key={b.id} b={b} showActions={false} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <DashboardDialogs />
    </div>
  )
}
