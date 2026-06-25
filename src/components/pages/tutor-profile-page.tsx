'use client'

import { useState, useEffect } from 'react'
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
import {
  MapPin, Home, School, Star, BadgeCheck, Clock, Briefcase, GraduationCap,
  Phone, Calendar, ArrowLeft, Share2, Heart, MessageSquare, Navigation,
  CheckCircle2, X, Info, Wallet, AlertCircle
} from 'lucide-react'
import { formatVnd, timeAgo } from '@/lib/format'
import { toast } from 'sonner'

interface TutorDetail {
  id: string
  name: string
  email: string
  avatar?: string | null
  bio?: string | null
  profession?: string | null
  experienceYears?: number | null
  education?: string | null
  hourlyRate?: number | null
  isVerified?: boolean
  phone?: string | null
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
  avgRating: number
  reviewCount: number
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
  availabilities: { dayOfWeek: number; startTime: string; endTime: string }[],
  dateStr: string
): boolean {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const dayOfWeek = date.getDay()
  return availabilities.some(a => a.dayOfWeek === dayOfWeek)
}

export function TutorProfilePage({ id }: { id: string }) {
  const { navigate, user } = useApp()
  const [tutor, setTutor] = useState<TutorDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [bookingOpen, setBookingOpen] = useState(false)

  // Booking form state
  const [selectedSubject, setSelectedSubject] = useState<string>('')
  const [bookingMode, setBookingMode] = useState<string>('')
  const [bookingDate, setBookingDate] = useState<string>('')
  const [bookingTime, setBookingTime] = useState<string>('')
  const [duration, setDuration] = useState(1.5)
  const [note, setNote] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/tutors/${id}`)
      .then(r => r.json())
      .then(data => {
        setTutor(data)
        if (data.subjects?.[0]) setSelectedSubject(data.subjects[0].id)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

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
    setBookingOpen(true)
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
    const startHour = parseInt(bookingTime.split(':')[0])
    const endHour = Math.floor(startHour + duration)
    const endMin = (duration % 1) * 60
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(0, '0').padStart(2, '0').slice(0, 2)}`

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
          address: bookingMode === 'TUTOR_TO_STUDENT' ? address : tutor.address,
          lat: bookingMode === 'TUTOR_TO_STUDENT' ? null : tutor.lat,
          lng: bookingMode === 'TUTOR_TO_STUDENT' ? null : tutor.lng,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast.success(`Đã gửi yêu cầu đặt lịch với ${tutor.name}`)
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
  const availableSlots = tutor ? generateSlotsFromAvailability(tutor.availabilities, bookingDate) : []

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
              <Button variant="outline" size="icon" title="Chia sẻ">
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" title="Lưu">
                <Heart className="h-4 w-4" />
              </Button>
              <Button size="lg" onClick={handleOpenBooking} className="h-11 px-6">
                <Calendar className="h-4 w-4 mr-1" /> Đặt lịch học
              </Button>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
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

          {/* Availability */}
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-3">Lịch trống</h2>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_NAMES.map((day, idx) => {
                const slots = tutor.availabilities.filter(a => a.dayOfWeek === idx)
                return (
                  <div key={day} className={`rounded-lg p-2 text-center ${slots.length > 0 ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30 border border-transparent'}`}>
                    <p className={`text-[10px] font-semibold ${slots.length > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                      {day === 'Chủ nhật' ? 'CN' : day.replace('Thứ ', 'T')}
                    </p>
                    {slots.length > 0 ? (
                      <p className="text-[9px] text-muted-foreground mt-0.5">{slots[0].startTime}</p>
                    ) : (
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5">—</p>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              * Lịch có thể thay đổi, vui lòng đặt lịch để gia sư xác nhận.
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
                <span className="text-sm text-muted-foreground">/giờ</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Cao hơn 20% gia sư tương tự vì chất lượng và kinh nghiệm
              </p>

              <Separator className="my-4" />

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Đã xác minh bằng cấp</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Phản hồi trong 2 giờ</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Học thử miễn phí 30 phút</span>
                </div>
              </div>

              <Button className="w-full h-11 mb-2" onClick={handleOpenBooking}>
                <Calendar className="h-4 w-4 mr-1" /> Đặt lịch học
              </Button>
              <Button variant="outline" className="w-full" onClick={() => toast.info('Tính năng chat sẽ có sớm')}>
                <MessageSquare className="h-4 w-4 mr-1" /> Nhắn tin
              </Button>

              <Separator className="my-4" />

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Info className="h-3 w-3" /> Chưa thanh toán khi đặt lịch
                </div>
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3 w-3" /> Thanh toán sau buổi học
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
            <DialogDescription>Chọn thông tin buổi học. Gia sư sẽ xác nhận trong vòng 2 giờ.</DialogDescription>
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

            {/* Mode - the differentiator */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Phương thức học</Label>
              <RadioGroup value={bookingMode} onValueChange={setBookingMode} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                          Bạn ở trong bán kính {tutor.travelRadiusKm}km từ {tutor.district}
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
                      {availableSlots.map(t => (
                        <button
                          key={t}
                          onClick={() => setBookingTime(t)}
                          className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                            bookingTime === t
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-border hover:border-primary/30'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                      Gia sư không có lịch trống ngày này. Chọn ngày khác.
                    </div>
                  )}
                </>
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

            {/* Price summary */}
            <div className="rounded-xl bg-muted/50 p-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Học phí ({duration}h)</span>
                <span className="font-semibold">{formatVnd((tutor.hourlyRate || 0) * duration)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Phí dịch vụ</span>
                <span className="font-semibold text-emerald-600">Miễn phí</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between">
                <span className="font-semibold">Tổng cộng</span>
                <span className="font-bold text-primary text-lg">{formatVnd((tutor.hourlyRate || 0) * duration)}</span>
              </div>
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
    </div>
  )
}
