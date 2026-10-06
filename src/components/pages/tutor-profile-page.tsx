'use client'

import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { RatingStars } from '@/components/rating-stars'
import { Progress } from '@/components/ui/progress'
import {
  MapPin, Home, School, Star, BadgeCheck, Clock, Briefcase, GraduationCap,
  Phone, Calendar, ArrowLeft, Share2, Heart, MessageSquare, Navigation,
  CheckCircle2, X, Info, Wallet, AlertCircle, ShieldCheck, Video, Repeat2, Lock,
  Users, PencilLine, CalendarClock, Hourglass
} from 'lucide-react'
import { formatVnd, formatDate, timeAgo, formatClassSchedule, sortClassSlots } from '@/lib/format'
import { toast } from 'sonner'

interface TutorDetail {
  id: string
  name: string
  avatar?: string | null
  bio?: string | null
  profession?: string | null
  experienceYears?: number | null
  education?: string | null
  hourlyRate?: number | null
  isVerified?: boolean
  phone?: string | null // P0-3: chỉ có giá trị khi đã có booking với gia sư này
  district?: string | null
  city?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  teachesAtStudentHome: boolean
  teachesAtOwnPlace: boolean
  teachesOnline: boolean
  travelRadiusKm?: number | null
  subjects: {
    id: string
    name: string
    slug: string
    category: string
    icon?: string | null
    pricePerHour: number
    description?: string | null
  }[]
  availabilities: {
    id: string
    dayOfWeek: number
    startTime: string
    endTime: string
  }[]
  // Lịch bận theo NGÀY CỤ THỂ (booking PENDING/CONFIRMED tương lai)
  // → dialog đặt lịch vô hiệu hóa đúng giờ đã có người đặt
  busySlots?: { date: string; startTime: string; endTime: string }[]
  avgRating: number
  reviewCount: number
  // P0-1: điểm tin cậy công khai
  reliability?: {
    score: number
    tier: { key: string; label: string; color: string }
    totalCancellations: number
    violations: number
    warnings: number
  } | null
  reviews: {
    id: string
    rating: number
    comment?: string | null
    createdAt: string
    studentName: string
    studentAvatar?: string | null
  }[]
}

const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

// Lớp học cố định (nhóm) gia sư mở tại nhà mình — hiển thị trên hồ sơ công khai
interface ClassInfo {
  id: string
  tutorId: string
  title: string
  subject: { id: string; name: string; slug?: string; icon?: string | null }
  gradeLevel?: string | null
  description?: string | null
  meetingType: string // AT_TUTOR_HOME | ONLINE
  address?: string | null
  capacity: number
  monthlyFee?: number | null
  status: string // OPEN | PAUSED
  startDate?: string | null
  schedule: { dayOfWeek: number; startTime: string; endTime: string }[]
  enrolledCount: number
  pendingCount: number
  waitlistCount?: number
  nextSession?: { date: string; startTime: string; endTime: string } | null
  upcomingCount?: number
  myEnrollment?: { id: string; status: string } | null
  myWaitlistPosition?: number | null
}

// Generate time slots from tutor's availability (15-min increments)
function generateSlotsFromAvailability(
  availabilities: { dayOfWeek: number; startTime: string; endTime: string }[],
  selectedDate: string
): string[] {
  if (!selectedDate) return []
  const date = new Date(selectedDate)
  const dayOfWeek = date.getDay()

  const daySlots = availabilities.filter(a => a.dayOfWeek === dayOfWeek)
  if (daySlots.length === 0) return []

  const slots: string[] = []
  for (const slot of daySlots) {
    const [startH, startM] = slot.startTime.split(':').map(Number)
    const [endH, endM] = slot.endTime.split(':').map(Number)
    let curH = startH, curM = startM
    while (curH < endH || (curH === endH && curM < endM)) {
      slots.push(`${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`)
      curM += 30
      if (curM >= 60) {
        curM -= 60
        curH += 1
      }
      // Stop if next slot would exceed end time by more than 30 min (we need at least 1h)
      if (curH * 60 + curM + 60 > endH * 60 + endM) break
    }
  }
  return slots.sort()
}

function isDateAvailable(
  availabilities: { dayOfWeek: number }[],
  dateStr: string
): boolean {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const dayOfWeek = date.getDay()
  return availabilities.some(a => a.dayOfWeek === dayOfWeek)
}

// Cộng n tuần vào YYYY-MM-DD (dùng cho hiển thị buổi cuối của khóa)
function addWeeksLocal(dateStr: string, weeks: number): string {
  const d = new Date(`${dateStr}T00:00`)
  d.setDate(d.getDate() + weeks * 7)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function TutorProfilePage({ id }: { id: string }) {
  const { navigate, user, view } = useApp()
  const [tutor, setTutor] = useState<TutorDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [bookingOpen, setBookingOpen] = useState(false)
  // Lớp học cố định (nhóm) của gia sư — hiện trên hồ sơ cho phụ huynh xem & đăng ký
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [enrollTarget, setEnrollTarget] = useState<ClassInfo | null>(null)
  const [enrollStudentName, setEnrollStudentName] = useState('')
  const [enrollNote, setEnrollNote] = useState('')
  const [submittingEnroll, setSubmittingEnroll] = useState(false)
  // Tự mở dialog đăng ký khi vào từ tab "Lớp học" của trang tìm kiếm (view.classId)
  const autoOpenedClassId = useRef<string | null>(null)

  // Booking form state
  const [selectedSubject, setSelectedSubject] = useState<string>('')
  const [bookingMode, setBookingMode] = useState<string>('')
  const [bookingDate, setBookingDate] = useState<string>('')
  const [bookingTime, setBookingTime] = useState<string>('')
  const [duration, setDuration] = useState(1.5)
  const [note, setNote] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Mục đích 1 — lớp học định kỳ: 1 = buổi lẻ, >= 2 = khóa lặp mỗi tuần cùng khung giờ
  const [repeatWeeks, setRepeatWeeks] = useState(1)
  const [isFavorite, setIsFavorite] = useState(false) // P1: favorite qua localStorage

  // P1: favorite từ localStorage
  useEffect(() => {
    try {
      const favs = JSON.parse(localStorage.getItem('favorite_tutors') ?? '[]')
      setIsFavorite(favs.includes(id))
    } catch { /* ignore */ }
  }, [id])

  // P1: nút yêu thích — lưu vào localStorage
  const toggleFavorite = () => {
    try {
      const favs = JSON.parse(localStorage.getItem('favorite_tutors') ?? '[]')
      const next = favs.includes(id) ? favs.filter((f: string) => f !== id) : [...favs, id]
      localStorage.setItem('favorite_tutors', JSON.stringify(next))
      setIsFavorite(next.includes(id))
      toast.success(next.includes(id) ? 'Đã lưu vào danh sách yêu thích' : 'Đã bỏ khỏi danh sách yêu thích')
    } catch {
      toast.error('Không thể lưu danh sách yêu thích')
    }
  }

  // P1: chia sẻ hồ sơ — native share trên mobile, copy link trên desktop
  const handleShare = async () => {
    const url = `${window.location.origin}/?view=tutor&id=${id}`
    const shareData = {
      title: tutor ? `Gia sư ${tutor.name}` : 'GiaSuConnect',
      text: tutor ? `${tutor.name} — ${tutor.profession ?? ''} tại ${tutor.district ?? ''}` : '',
      url,
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData)
        return
      } catch { /* user hủy share — bỏ qua */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Đã copy link hồ sơ')
    } catch {
      toast.error('Không thể copy link')
    }
  }

  useEffect(() => {
     
    setLoading(true)
    autoOpenedClassId.current = null
    Promise.all([
      fetch(`/api/tutors/${id}`).then(r => r.json()),
      fetch(`/api/classes?tutorId=${id}`).then(r => r.json()).catch(() => ({ classes: [] })),
    ])
      .then(([data, clsData]) => {
        setTutor(data)
        if (data.subjects?.[0]) setSelectedSubject(data.subjects[0].id)
        const clsList: ClassInfo[] = clsData.classes || []
        setClasses(clsList)
        setLoading(false)
        // Đến từ tìm kiếm lớp học → tự mở dialog đăng ký đúng lớp đó
        const targetId = view.name === 'tutor' ? view.classId : undefined
        if (targetId && user?.role === 'STUDENT' && autoOpenedClassId.current !== targetId) {
          const target = clsList.find(c => c.id === targetId)
          if (target) {
            autoOpenedClassId.current = targetId
            // Trì hoãn 1 tick để toast/navigation ổn định
            setTimeout(() => openEnrollDialog(target), 150)
          }
        }
      })
      .catch(() => setLoading(false))
  }, [id, view.name === 'tutor' ? view.classId : undefined])

  // Làm mới danh sách lớp (sau khi đăng ký / rút đăng ký đổi trạng thái)
  const reloadClasses = () => {
    fetch(`/api/classes?tutorId=${id}`)
      .then(r => r.json())
      .then(d => setClasses(d.classes || []))
      .catch(() => {})
  }

  // ===== Đăng ký vào lớp học cố định =====
  const openEnrollDialog = (cls: ClassInfo) => {
    if (!user) {
      toast.info('Vui lòng đăng nhập để đăng ký lớp học')
      navigate({ name: 'login' })
      return
    }
    if (user.role === 'TUTOR') {
      toast.error('Gia sư không thể đăng ký lớp của gia sư khác')
      return
    }
    setEnrollStudentName('')
    setEnrollNote('')
    setEnrollTarget(cls)
  }

  const handleEnroll = async () => {
    if (!enrollTarget) return
    setSubmittingEnroll(true)
    try {
      const res = await fetch(`/api/classes/${enrollTarget.id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: enrollStudentName.trim() || undefined,
          note: enrollNote.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Đăng ký thất bại')
      toast.success(data.message || 'Đã gửi đăng ký lớp học', { duration: 5000 })
      setEnrollTarget(null)
      reloadClasses()
    } catch (e: any) {
      toast.error(e.message || 'Đăng ký thất bại')
    } finally {
      setSubmittingEnroll(false)
    }
  }

  // Rút đăng ký / rời lớp ngay từ hồ sơ
  const handleCancelEnrollment = async (cls: ClassInfo) => {
    if (!cls.myEnrollment) return
    try {
      const res = await fetch(`/api/classes/${cls.id}/enrollments/${cls.myEnrollment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Thao tác thất bại')
      toast.success(
        cls.myEnrollment.status === 'APPROVED'
          ? `Đã rời lớp "${cls.title}" — gia sư sẽ được thông báo`
          : `Đã rút đăng ký khỏi lớp "${cls.title}"`,
      )
      reloadClasses()
    } catch (e: any) {
      toast.error(e.message || 'Thao tác thất bại')
    }
  }

  const handleOpenBooking = () => {
    if (!user) {
      toast.info('Vui lòng đăng nhập để đặt lịch')
      navigate({ name: 'login' })
      return
    }
    if (user.role === 'TUTOR') {
      toast.error('Gia sư không thể tự đặt lịch với gia sư khác')
      return
    }
    setRepeatWeeks(1)
    setBookingOpen(true)
  }

  // Mục đích 2 — mở hội thoại với gia sư (chat trong app)
  const handleStartConversation = async () => {
    if (!user) {
      toast.info('Vui lòng đăng nhập để nhắn tin')
      navigate({ name: 'login' })
      return
    }
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Không thể mở hội thoại')
      navigate({ name: 'messages', conversationId: data.conversationId })
    } catch (e: any) {
      toast.error(e.message || 'Không thể mở hội thoại')
    }
  }

  const handleSubmitBooking = async () => {
    if (!tutor) return
    if (!selectedSubject || !bookingMode || !bookingDate || !bookingTime) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }
    if (bookingMode === 'TUTOR_TO_STUDENT' && !address) {
      toast.error('Vui lòng nhập địa chỉ nhà bạn')
      return
    }

    const subject = tutor.subjects.find(s => s.id === selectedSubject)!
    // P0-5: tính giờ kết thúc CHÍNH XÁC theo phút bắt đầu (09:30 + 1.5h = 11:00)
    const [startH, startM] = bookingTime.split(':').map(Number)
    const totalEndMin = startH * 60 + startM + Math.round(duration * 60)
    const endHour = Math.floor(totalEndMin / 60)
    const endMin = totalEndMin % 60
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`

    setSubmitting(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorId: tutor.id,
          subjectId: selectedSubject,
          mode: bookingMode,
          date: bookingDate,
          startTime: bookingTime,
          endTime,
          durationHours: duration,
          note,
          repeatWeeks,
          address: bookingMode === 'TUTOR_TO_STUDENT' ? address : bookingMode === 'STUDENT_TO_TUTOR' ? tutor.address ?? undefined : undefined,
          lat: bookingMode === 'STUDENT_TO_TUTOR' ? tutor.lat ?? undefined : undefined,
          lng: bookingMode === 'STUDENT_TO_TUTOR' ? tutor.lng ?? undefined : undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Mục đích 1 + 3: phản hồi minh bạch — báo rõ số buổi đã tạo + các tuần bị bỏ qua
      if (data.created > 1) {
        toast.success(
          `Đã tạo khóa học ${data.created} buổi với ${tutor.name} (mỗi tuần 1 buổi)` +
          (data.skipped?.length ? ` — bỏ qua ${data.skipped.length} tuần trùng lịch` : ''),
          { duration: 6000 },
        )
      } else {
        toast.success(`Đã gửi yêu cầu đặt lịch với ${tutor.name}`)
      }
      if (data.skipped?.length) {
        toast.info(
          'Các tuần bị bỏ qua: ' + data.skipped.map((s: any) => `${s.date} (${s.reason})`).join('; '),
          { duration: 8000 },
        )
      }
      setBookingOpen(false)
      navigate({ name: 'dashboard' })
    } catch (e: any) {
      toast.error(e.message || 'Đặt lịch thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-32" />
          <div className="h-48 bg-muted rounded-2xl" />
          <div className="h-6 bg-muted rounded w-2/3" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (!tutor) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-16 text-center">
        <h2 className="text-2xl font-bold mb-2">Không tìm thấy gia sư</h2>
        <Button onClick={() => navigate({ name: 'search' })}>Quay lại tìm kiếm</Button>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]

  // Compute available slots from tutor's availability for selected date
  // (chỉ từ slot FREE — lịch cố định không sinh lựa chọn)
  const availableSlots = tutor ? generateSlotsFromAvailability(tutor.availabilities, bookingDate) : []

  // ===== Lịch bận theo ngày cụ thể (booking đã có trên nền tảng) =====
  // Vô hiệu hóa đúng giờ đã có người đặt — phụ huynh nhìn thấy ngay,
  // không phải chờ server từ chối lúc gửi.
  const busySlotsOfDate = (tutor.busySlots || []).filter(b => b.date === bookingDate)
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const isSlotBusy = (t: string) => {
    const start = toMin(t)
    const end = start + duration * 60 // cả buổi học phải không trùng lớp đã có
    return busySlotsOfDate.some(b => start < toMin(b.endTime) && end > toMin(b.startTime))
  }
  // ===== Lớp học cố định (nhóm) rơi vào ngày đang chọn — chặn đặt 1-1 trùng giờ lớp =====
  const classSlotsOfDate = bookingDate
    ? classes
        .filter(c => c.status === 'OPEN' || c.status === 'PAUSED')
        .flatMap(c => c.schedule
          .filter(s => s.dayOfWeek === new Date(bookingDate).getDay())
          .map(s => ({ title: c.title, startTime: s.startTime, endTime: s.endTime })))
    : []
  const isSlotClassBusy = (t: string) => {
    const start = toMin(t)
    const end = start + duration * 60
    return classSlotsOfDate.some(b => start < toMin(b.endTime) && end > toMin(b.startTime))
  }
  const busyCount = availableSlots.filter(t => isSlotBusy(t) || isSlotClassBusy(t)).length

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      {/* Back */}
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate({ name: 'search' })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Quay lại
      </Button>

      {/* Profile header - LinkedIn style */}
      <Card className="overflow-hidden mb-6">
        {/* Cover */}
        <div className="h-32 bg-gradient-to-r from-primary via-rose-500 to-orange-400 relative">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 50%, white 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }} />
        </div>

        {/* Avatar + info */}
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 mb-4">
            <Avatar className="h-24 w-24 rounded-2xl border-4 border-background shadow-lg shrink-0">
              <AvatarImage src={tutor.avatar || undefined} alt={tutor.name} />
              <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-bold">
                {tutor.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 pt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{tutor.name}</h1>
                {tutor.isVerified && (
                  <Badge className="bg-primary/10 text-primary hover:bg-primary/10 gap-1">
                    <BadgeCheck className="h-3.5 w-3.5" /> Đã xác minh
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">{tutor.profession}</p>
              <div className="flex items-center gap-3 mt-2 text-sm flex-wrap">
                <RatingStars rating={tutor.avgRating} size={14} reviewCount={tutor.reviewCount} />
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {tutor.district}, {tutor.city}
                </span>
                {tutor.experienceYears && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Briefcase className="h-3.5 w-3.5" /> {tutor.experienceYears} năm KN
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 sm:self-center">
              <Button variant="outline" size="icon" title="Chia sẻ hồ sơ" onClick={handleShare}>
                <Share2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title={isFavorite ? 'Bỏ khỏi danh sách yêu thích' : 'Lưu vào danh sách yêu thích'}
                onClick={toggleFavorite}
              >
                <Heart className={`h-4 w-4 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
              </Button>
              <Button size="lg" onClick={handleOpenBooking} className="h-11 px-6">
                <Calendar className="h-4 w-4 mr-1" /> Đặt lịch học
              </Button>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Đánh giá</p>
              <p className="text-lg font-bold flex items-center justify-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {tutor.avgRating.toFixed(1)}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Học phí</p>
              <p className="text-lg font-bold text-primary">{formatVnd(tutor.hourlyRate || 0)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Kinh nghiệm</p>
              <p className="text-lg font-bold">{tutor.experienceYears || 0} năm</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Bài đánh giá</p>
              <p className="text-lg font-bold">{tutor.reviewCount}</p>
            </div>
            {/* P0-1: độ tin cậy công khai */}
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Độ tin cậy
              </p>
              <p className="text-lg font-bold">
                {tutor.reliability?.score ?? 100}
                <span className="text-xs font-normal text-muted-foreground">/100</span>
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left column - main info */}
        <div className="md:col-span-2 space-y-6">
          {/* About */}
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-3">Giới thiệu</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {tutor.bio}
            </p>
          </Card>

          {/* Teaching modes - the differentiator */}
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-3">Phương thức dạy</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {tutor.teachesAtStudentHome && (
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Home className="h-5 w-5 text-primary" />
                    <span className="font-semibold">Gia sư đến nhà bạn</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Bán kính di chuyển: {tutor.travelRadiusKm || 0}km từ {tutor.district}
                  </p>
                </div>
              )}
              {tutor.teachesAtOwnPlace && (
                <div className="rounded-xl border-2 border-violet-500/30 bg-violet-500/5 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <School className="h-5 w-5 text-violet-600" />
                    <span className="font-semibold">Học tại cơ sở</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Địa chỉ: {tutor.address}, {tutor.district}
                  </p>
                </div>
              )}
              {tutor.teachesOnline && (
                <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="h-5 w-5 text-emerald-600" />
                    <span className="font-semibold">Học trực tuyến</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Google Meet / Zoom</p>
                </div>
              )}
            </div>
          </Card>

          {/* Subjects */}
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-3">Môn dạy</h2>
            <div className="space-y-3">
              {tutor.subjects.map(s => (
                <div key={s.id} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-muted/50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{s.name}</h3>
                      <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                    </div>
                    {s.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-primary">{formatVnd(s.pricePerHour)}</p>
                    <p className="text-[10px] text-muted-foreground">/giờ</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Lớp học cố định (nhóm) — gia sư mở lớp tại nhà mình theo lịch tuần.
              Phụ huynh/học sinh thấy: lịch cố định, địa điểm, học phí, SĨ SỐ còn trống
              và đăng ký trực tiếp; gia sư duyệt từng học sinh. */}
          {classes.length > 0 && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" /> Lớp học cố định
                </h2>
                <Badge variant="outline" className="text-[10px] rounded-full">
                  {classes.length} lớp
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Các lớp học nhóm gia sư mở tại nhà mình — lịch học cố định hằng tuần, sĩ số giới hạn.
              </p>
              <div className="space-y-4">
                {classes.map(cls => {
                  const enrolled = cls.enrolledCount
                  const remaining = cls.capacity - enrolled
                  const full = enrolled >= cls.capacity
                  const pct = Math.min(100, Math.round((enrolled / cls.capacity) * 100))
                  const isPaused = cls.status === 'PAUSED'
                  const isMine = user && tutor.id === user.id
                  const my = cls.myEnrollment ?? null
                  return (
                    <div key={cls.id} className="rounded-2xl border p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-base">{cls.title}</h3>
                            {cls.status === 'OPEN' && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Đang tuyển học sinh
                              </Badge>
                            )}
                            {isPaused && (
                              <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] gap-1">
                                <Clock className="h-3 w-3" /> Tạm dừng tuyển
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {cls.subject.name}
                            {cls.gradeLevel ? ` · ${cls.gradeLevel}` : ''} ·{' '}
                            {cls.meetingType === 'ONLINE' ? 'Học trực tuyến' : 'Học tại nhà gia sư'}
                          </p>
                          {cls.nextSession && (
                            <p className="text-xs text-primary font-medium mt-1.5 flex items-center gap-1.5">
                              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                              Buổi tới: {formatDate(cls.nextSession.date)} · {cls.nextSession.startTime}–{cls.nextSession.endTime}
                              <span className="text-muted-foreground font-normal">
                                (lịch đã có sẵn {(cls.upcomingCount ?? 0)} buổi tới)
                              </span>
                            </p>
                          )}
                        </div>
                        {cls.monthlyFee != null && (
                          <div className="text-right shrink-0">
                            <p className="font-bold text-primary">{formatVnd(cls.monthlyFee)}</p>
                            <p className="text-[10px] text-muted-foreground">/tháng</p>
                          </div>
                        )}
                      </div>

                      {/* Lịch học cố định hằng tuần */}
                      <div className="flex flex-wrap gap-1.5 mt-3 items-center">
                        {sortClassSlots(cls.schedule).map((s, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold"
                          >
                            <Clock className="h-3 w-3" />
                            {DAY_NAMES[s.dayOfWeek]} {s.startTime}–{s.endTime}
                          </span>
                        ))}
                        {cls.startDate && (
                          <span className="text-[11px] text-muted-foreground">
                            · Khai giảng {formatDate(cls.startDate)}
                          </span>
                        )}
                      </div>

                      {/* Địa điểm + mô tả */}
                      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                        {cls.meetingType !== 'ONLINE' && cls.address && (
                          <p className="flex items-start gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="line-clamp-1">{cls.address}</span>
                          </p>
                        )}
                        {cls.description && (
                          <p className="line-clamp-2 leading-relaxed">{cls.description}</p>
                        )}
                      </div>

                      {/* Sĩ số lớp — thông tin mấu chốt để phụ huynh cân nhắc */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-primary" /> Sĩ số lớp
                          </span>
                          <span className={full ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}>
                            {enrolled}/{cls.capacity} học sinh
                            {!full ? ` · còn ${remaining} chỗ` : (cls.waitlistCount ?? 0) > 0 ? ` · ${cls.waitlistCount} đang chờ chỗ` : ' · đã đủ'}
                          </span>
                        </div>
                        <Progress value={pct} className="h-2" />
                        {cls.pendingCount > 0 && !full && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            +{cls.pendingCount} đăng ký đang chờ gia sư duyệt
                          </p>
                        )}
                        {full && (cls.waitlistCount ?? 0) > 0 && (
                          <p className="text-[10px] text-violet-600 mt-1 flex items-center gap-1">
                            <Hourglass className="h-3 w-3" />
                            Đăng ký mới vào danh sách chờ — tự động vào lớp khi có chỗ trống
                          </p>
                        )}
                      </div>

                      {/* Hành động theo vai trò người xem */}
                      <div className="mt-4 flex items-center gap-2 flex-wrap">
                        {isMine ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate({ name: 'dashboard', tab: 'classes' })}
                          >
                            <PencilLine className="h-3.5 w-3.5 mr-1" /> Quản lý lớp của bạn
                          </Button>
                        ) : my ? (
                          <>
                            {my.status === 'PENDING' && (
                              <Badge className="bg-amber-100 text-amber-700 border-0 gap-1">
                                <Clock className="h-3 w-3" /> Đã gửi đăng ký — chờ gia sư duyệt
                              </Badge>
                            )}
                            {my.status === 'APPROVED' && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Bạn đã ở trong lớp này
                              </Badge>
                            )}
                            {my.status === 'WAITLIST' && (
                              <Badge className="bg-violet-100 text-violet-700 border-0 gap-1">
                                <Hourglass className="h-3 w-3" />
                                Đang chờ chỗ — vị trí #{cls.myWaitlistPosition ?? '?'}
                              </Badge>
                            )}
                            {my.status === 'REJECTED' && (
                              <Badge className="bg-rose-100 text-rose-700 border-0 gap-1">
                                <X className="h-3 w-3" /> Đăng ký chưa được nhận
                              </Badge>
                            )}
                            {(my.status === 'PENDING' || my.status === 'APPROVED' || my.status === 'WAITLIST') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleCancelEnrollment(cls)}
                              >
                                {my.status === 'APPROVED' ? 'Rời lớp' : my.status === 'WAITLIST' ? 'Rút khỏi chờ' : 'Rút đăng ký'}
                              </Button>
                            )}
                            {(my.status === 'REJECTED' || my.status === 'CANCELLED') &&
                              cls.status === 'OPEN' && (
                              <Button size="sm" variant="outline" onClick={() => openEnrollDialog(cls)}>
                                Đăng ký lại
                              </Button>
                            )}
                          </>
                        ) : !user ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              toast.info('Vui lòng đăng nhập để đăng ký lớp học')
                              navigate({ name: 'login' })
                            }}
                          >
                            Đăng ký lớp học
                          </Button>
                        ) : user.role === 'TUTOR' ? null : (
                          <Button
                            size="sm"
                            disabled={isPaused}
                            onClick={() => openEnrollDialog(cls)}
                          >
                            {isPaused ? 'Tạm dừng tuyển sinh' : full ? 'Vào danh sách chờ' : 'Đăng ký lớp học'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Education & Experience */}
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-3">Học vấn & Kinh nghiệm</h2>
            <div className="space-y-4">
              {tutor.education && (
                <div className="flex gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Học vấn</p>
                    <p className="text-sm font-medium">{tutor.education}</p>
                  </div>
                </div>
              )}
              {tutor.profession && (
                <div className="flex gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Chuyên môn</p>
                    <p className="text-sm font-medium">{tutor.profession}</p>
                  </div>
                </div>
              )}
              {tutor.experienceYears && (
                <div className="flex gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Kinh nghiệm</p>
                    <p className="text-sm font-medium">{tutor.experienceYears} năm giảng dạy</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Lịch dạy hàng tuần — hiển thị ĐẦY ĐỦ mọi khung giờ mỗi ngày */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h2 className="font-semibold text-lg">Lịch dạy hàng tuần</h2>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary inline-block" /> Nhận lớp mới
                </span>
              </div>
            </div>
            {/* Thứ 2 → Chủ nhật, mỗi ngày liệt kê TẤT CẢ khung giờ (fix: trước đây
                chỉ hiện khung đầu tiên trong ngày) */}
            <div className="space-y-1">
              {[1, 2, 3, 4, 5, 6, 0].map(idx => {
                const daySlots = tutor.availabilities
                  .filter(a => a.dayOfWeek === idx)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                return (
                  <div
                    key={idx}
                    className={`grid grid-cols-[76px_1fr] items-center gap-3 py-2 border-b last:border-b-0 ${
                      daySlots.length > 0 ? '' : 'opacity-50'
                    }`}
                  >
                    <span className={`text-sm font-semibold ${idx === new Date().getDay() ? 'text-primary' : ''}`}>
                      {idx === 0 ? 'Chủ nhật' : `Thứ ${idx + 1}`}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {daySlots.length > 0 ? daySlots.map(s => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20"
                          title="Khung giờ trống — có thể đặt lịch"
                        >
                          {s.startTime}–{s.endTime}
                        </span>
                      )) : (
                        <span className="text-xs text-muted-foreground">Không có lịch</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              * Có thể đặt lịch 1-1 trong các khung giờ trên.
              {classes.length > 0 && (
                <> Muốn học nhóm theo lịch cố định? Xem <span className="font-medium text-primary">Lớp học cố định</span> phía trên.</>
              )}
              Lịch có thể thay đổi, vui lòng đặt lịch để gia sư xác nhận.
            </p>
          </Card>

          {/* Reviews */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Đánh giá từ phụ huynh & học sinh</h2>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{tutor.avgRating.toFixed(1)}</span>
                <div>
                  <RatingStars rating={tutor.avgRating} size={14} showNumber={false} />
                  <p className="text-xs text-muted-foreground">{tutor.reviewCount} đánh giá</p>
                </div>
              </div>
            </div>

            {tutor.reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Chưa có đánh giá. Hãy là người đầu tiên đánh giá sau buổi học!
              </p>
            ) : (
              <div className="space-y-4">
                {tutor.reviews.map(r => (
                  <div key={r.id} className="pb-4 border-b last:border-0 last:pb-0">
                    <div className="flex items-center gap-3 mb-2">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={r.studentAvatar || undefined} alt={r.studentName} />
                        <AvatarFallback className="bg-muted text-xs font-semibold">
                          {r.studentName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{r.studentName}</p>
                        <p className="text-[11px] text-muted-foreground">{timeAgo(r.createdAt)}</p>
                      </div>
                      <RatingStars rating={r.rating} size={12} showNumber={false} />
                    </div>
                    {r.comment && (
                      <p className="text-sm text-muted-foreground leading-relaxed pl-12">{r.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column - sticky booking card */}
        <div className="md:col-span-1">
          <div className="sticky top-20">
            <Card className="p-5">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-2xl font-bold text-primary">{formatVnd(tutor.hourlyRate || 0)}</span>
                <span className="text-sm text-muted-foreground">/giờ trở lên</span>
              </div>

              <Separator className="my-4" />

              {/* P0-4: chỉ hiển thị thông tin THẬT — đã loại bỏ các cam kết bịa
                  ("Đã xác minh bằng cấp" cứng, "Học thử miễn phí", "Phản hồi trong 2 giờ") */}
              <div className="space-y-2 mb-4">
                {tutor.isVerified ? (
                  <div className="flex items-center gap-2 text-sm">
                    <BadgeCheck className="h-4 w-4 text-emerald-500" />
                    <span>Đã xác minh</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Info className="h-4 w-4" />
                    <span>Chưa xác minh</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>
                    Độ tin cậy {tutor.reliability?.score ?? 100}/100
                    {tutor.reliability && (
                      <span className="text-muted-foreground"> ({tutor.reliability.tier.label})</span>
                    )}
                  </span>
                </div>
              </div>

              <Button className="w-full h-11 mb-2" onClick={handleOpenBooking}>
                <Calendar className="h-4 w-4 mr-1" /> Đặt lịch học
              </Button>
              <Button variant="outline" className="w-full" onClick={handleStartConversation}>
                <MessageSquare className="h-4 w-4 mr-1" /> Nhắn tin
              </Button>

              <Separator className="my-4" />

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Info className="h-3 w-3" /> Chưa thanh toán khi đặt lịch
                </div>
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3 w-3" /> Thanh toán trực tiếp sau buổi học
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Booking dialog */}
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scroll-area">
          <DialogHeader>
            <DialogTitle>Đặt lịch học với {tutor.name}</DialogTitle>
            <DialogDescription>Chọn thông tin buổi học. Gia sư sẽ xác nhận yêu cầu của bạn qua hệ thống.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Subject */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Môn học</Label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              >
                {tutor.subjects.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {formatVnd(s.pricePerHour)}/giờ
                  </option>
                ))}
              </select>
            </div>

            {/* Mode - the differentiator (P1: thêm chế độ ONLINE) */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Phương thức học</Label>
              <RadioGroup value={bookingMode} onValueChange={setBookingMode} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {tutor.teachesAtStudentHome && (
                  <Label htmlFor="mode-tts" className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${bookingMode === 'TUTOR_TO_STUDENT' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="TUTOR_TO_STUDENT" id="mode-tts" className="mt-1" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Home className="h-4 w-4 text-primary" />
                          <span className="font-semibold text-sm">Gia sư đến nhà</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Trong bán kính {tutor.travelRadiusKm}km từ {tutor.district}
                        </p>
                      </div>
                    </div>
                  </Label>
                )}
                {tutor.teachesAtOwnPlace && (
                  <Label htmlFor="mode-stt" className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${bookingMode === 'STUDENT_TO_TUTOR' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="STUDENT_TO_TUTOR" id="mode-stt" className="mt-1" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <School className="h-4 w-4 text-violet-600" />
                          <span className="font-semibold text-sm">Đến cơ sở gia sư</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {tutor.address}, {tutor.district}
                        </p>
                      </div>
                    </div>
                  </Label>
                )}
                {tutor.teachesOnline && (
                  <Label htmlFor="mode-online" className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${bookingMode === 'ONLINE' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="ONLINE" id="mode-online" className="mt-1" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Video className="h-4 w-4 text-emerald-600" />
                          <span className="font-semibold text-sm">Học trực tuyến</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Google Meet / Zoom — link gửi sau khi xác nhận
                        </p>
                      </div>
                    </div>
                  </Label>
                )}
              </RadioGroup>
            </div>

            {/* Address (if TUTOR_TO_STUDENT) */}
            {bookingMode === 'TUTOR_TO_STUDENT' && (
              <div>
                <Label className="text-sm font-semibold mb-2 block">Địa chỉ nhà bạn</Label>
                <Input
                  placeholder="Số nhà, đường, quận..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Gia sư sẽ đến địa chỉ này để dạy
                </p>
              </div>
            )}

            {/* Date + duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold mb-2 block">Ngày học</Label>
                <Input
                  type="date"
                  min={today}
                  value={bookingDate}
                  onChange={(e) => {
                    setBookingDate(e.target.value)
                    setBookingTime('') // Reset time when date changes
                  }}
                />
                {bookingDate && tutor.availabilities.length > 0 && !isDateAvailable(tutor.availabilities, bookingDate) && (
                  <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Gia sư không có lịch trống ngày này. Chọn ngày khác.
                  </p>
                )}
                {bookingDate && isDateAvailable(tutor.availabilities, bookingDate) && (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Có lịch trống {DAY_NAMES[new Date(bookingDate).getDay()]}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm font-semibold mb-2 block">Thời lượng</Label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background h-10"
                >
                  <option value={1}>1 giờ</option>
                  <option value={1.5}>1.5 giờ</option>
                  <option value={2}>2 giờ</option>
                  <option value={2.5}>2.5 giờ</option>
                </select>
              </div>
            </div>

            {/* Time slots - based on availability */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">
                Giờ bắt đầu
                {bookingDate && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    (theo lịch trống của gia sư)
                  </span>
                )}
              </Label>
              {!bookingDate ? (
                <div className="rounded-lg border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                  Vui lòng chọn ngày học trước
                </div>
              ) : tutor.availabilities.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                  Gia sư chưa thiết lập lịch trống. Vui lòng nhắn tin để thỏa thuận giờ học.
                </div>
              ) : (
                <>
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {availableSlots.map(t => {
                        const busy = isSlotBusy(t) || isSlotClassBusy(t)
                        return (
                          <button
                            key={t}
                            onClick={() => !busy && setBookingTime(t)}
                            disabled={busy}
                            className={`py-2 rounded-lg text-sm font-medium border transition-colors relative ${
                              busy
                                ? 'bg-muted/50 border-border text-muted-foreground/60 line-through cursor-not-allowed'
                                : bookingTime === t
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'border-border hover:border-primary/30'
                            }`}
                            title={busy ? 'Khung giờ này đã có lớp — chọn giờ khác' : `Buổi học ${t} + ${duration}h`}
                          >
                            {t}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                      Gia sư không có lịch trống ngày này. Chọn ngày khác.
                    </div>
                  )}
                  {busyCount > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      {busyCount} khung giờ đã có lớp — đã vô hiệu hóa, vui lòng chọn giờ còn lại.
                    </p>
                  )}
                  {classSlotsOfDate.length > 0 && availableSlots.length > 0 && (
                    <p className="text-[11px] text-amber-600/90 mt-1.5 flex items-center gap-1">
                      <GraduationCap className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-2">
                        Lớp học cố định trong ngày: {classSlotsOfDate.map(b => `${b.title} (${b.startTime}–${b.endTime})`).join('; ')}. Muốn học lớp này? Xem mục "Lớp học cố định" phía trên.
                      </span>
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Lớp học định kỳ (Mục đích 1 — quản lý lớp học 2 bên) */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Kiểu lịch học</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRepeatWeeks(1)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    repeatWeeks === 1 ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Calendar className={`h-4 w-4 ${repeatWeeks === 1 ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-semibold text-sm">Đặt 1 buổi</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Làm quen trước khi học dài hạn</p>
                </button>
                <button
                  type="button"
                  onClick={() => setRepeatWeeks(prev => (prev === 1 ? 4 : prev))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    repeatWeeks > 1 ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Repeat2 className={`h-4 w-4 ${repeatWeeks > 1 ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-semibold text-sm">Khóa định kỳ</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Cùng khung giờ, mỗi tuần 1 buổi</p>
                </button>
              </div>

              {repeatWeeks > 1 && (
                <div className="mt-2.5 space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    {[2, 4, 8, 12].map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setRepeatWeeks(w)}
                        className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                          repeatWeeks === w
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border hover:border-primary/30'
                        }`}
                      >
                        {w} buổi
                      </button>
                    ))}
                  </div>
                  {bookingDate && (
                    <p className="text-[11px] text-muted-foreground">
                      Buổi đầu <span className="font-medium text-foreground">{formatDate(bookingDate)}</span>
                      {' · '}buổi cuối{' '}
                      <span className="font-medium text-foreground">
                        {formatDate(addWeeksLocal(bookingDate, repeatWeeks - 1))}
                      </span>
                      {' · '}gia sư xác nhận từng buổi
                    </p>
                  )}
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    Tuần nào bị trùng lịch sẽ được bỏ qua và báo rõ sau khi đặt
                  </p>
                </div>
              )}
            </div>

            {/* Note */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Ghi chú (tùy chọn)</Label>
              <Textarea
                placeholder="Thông tin thêm: trình độ hiện tại, mục tiêu, yêu cầu đặc biệt..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </div>

            {/* Bảng giá minh bạch (Mục đích 3) — đơn giá × giờ × số buổi, không phí ẩn */}
            <div className="rounded-xl bg-muted/50 p-4 space-y-1.5">
              {(() => {
                const sel = tutor.subjects.find(s => s.id === selectedSubject)
                const pricePerHour = sel?.pricePerHour ?? tutor.hourlyRate ?? 0
                const perSession = Math.round(pricePerHour * duration)
                return (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {sel ? sel.name : 'Học phí'} — {formatVnd(pricePerHour)}/giờ × {duration}h
                      </span>
                      <span className="font-semibold">{formatVnd(perSession)}/buổi</span>
                    </div>
                    {repeatWeeks > 1 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Số buổi (khóa {repeatWeeks} tuần)</span>
                        <span className="font-semibold">{repeatWeeks} buổi</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Phí nền tảng</span>
                      <span className="font-semibold text-emerald-600">0đ — miễn phí</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between">
                      <span className="font-semibold">
                        Tổng cộng{repeatWeeks > 1 ? ` (${repeatWeeks} buổi)` : ''}
                      </span>
                      <span className="font-bold text-primary text-lg">
                        {formatVnd(perSession * repeatWeeks)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Học phí thanh toán trực tiếp cho gia sư sau mỗi buổi — cả hai bên thấy cùng một con số, không phí ẩn.
                    </p>
                  </>
                )
              })()}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingOpen(false)}>Hủy</Button>
            <Button onClick={handleSubmitBooking} disabled={submitting}>
              {submitting ? 'Đang gửi...' : 'Xác nhận đặt lịch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog đăng ký vào lớp học cố định (nhóm) */}
      <Dialog open={!!enrollTarget} onOpenChange={(open) => !open && setEnrollTarget(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto scroll-area">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" /> Đăng ký lớp học
            </DialogTitle>
            <DialogDescription>
              {enrollTarget && (
                <>
                  <b className="text-foreground">{enrollTarget.title}</b>
                  {' '}— {enrollTarget.subject.name}
                  {enrollTarget.gradeLevel ? ` · ${enrollTarget.gradeLevel}` : ''}
                  <br />
                  Lịch cố định: {formatClassSchedule(enrollTarget.schedule)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {enrollTarget?.meetingType !== 'ONLINE' && enrollTarget?.address && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5 rounded-xl bg-muted/50 p-3">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Địa điểm học: <b className="text-foreground">{enrollTarget.address}</b></span>
              </p>
            )}

            <div>
              <Label className="text-sm font-semibold mb-1.5 block">Tên học sinh</Label>
              <Input
                placeholder={user?.name ?? 'Tên học sinh'}
                value={enrollStudentName}
                onChange={(e) => setEnrollStudentName(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Đặt trống = dùng tên tài khoản của bạn. Phụ huynh có thể điền tên con mình.
              </p>
            </div>

            <div>
              <Label className="text-sm font-semibold mb-1.5 block">Lời nhắn tới gia sư (tùy chọn)</Label>
              <Textarea
                placeholder="Trình độ hiện tại, mục tiêu, mong muốn của con..."
                value={enrollNote}
                onChange={(e) => setEnrollNote(e.target.value)}
                rows={3}
              />
            </div>

            <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p>
                Sĩ số hiện tại:{' '}
                <b className="text-foreground">
                  {enrollTarget?.enrolledCount}/{enrollTarget?.capacity} học sinh
                </b>
                {enrollTarget && enrollTarget.capacity - enrollTarget.enrolledCount > 0 && (
                  <> · còn <b className="text-foreground">{enrollTarget.capacity - enrollTarget.enrolledCount}</b> chỗ</>
                )}
              </p>
              {enrollTarget?.monthlyFee != null && (
                <p>
                  Học phí: <b className="text-foreground">{formatVnd(enrollTarget.monthlyFee)}/tháng</b> — thanh toán trực tiếp cho gia sư.
                </p>
              )}
              <p>Gia sư sẽ duyệt đăng ký và gửi kết quả qua Tin nhắn.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollTarget(null)}>Đóng</Button>
            <Button onClick={handleEnroll} disabled={submittingEnroll}>
              {submittingEnroll ? 'Đang gửi...' : 'Gửi đăng ký'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
