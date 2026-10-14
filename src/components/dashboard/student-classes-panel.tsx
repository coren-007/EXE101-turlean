'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import {
  GraduationCap, MapPin, Users, Clock, CalendarDays, Wallet, Video,
  Home as HomeIcon, UserCheck, Clock3, XCircle, ExternalLink, MessageSquare, Ban,
  CalendarClock, ClipboardCheck, Hourglass, CheckCircle2, ChevronDown, ChevronUp,
  AlertCircle, Clock4,
} from 'lucide-react'
import { formatVnd, formatDate, CLASS_DAY_NAMES, sortClassSlots } from '@/lib/format'
import { toast } from 'sonner'

const ENROLL_STATUS: Record<string, { label: string; cls: string; icon: any }> = {
  PENDING: { label: 'Chờ gia sư duyệt', cls: 'bg-amber-100 text-amber-700', icon: Clock3 },
  APPROVED: { label: 'Đã vào lớp', cls: 'bg-emerald-100 text-emerald-700', icon: UserCheck },
  WAITLIST: { label: 'Đang chờ chỗ trống', cls: 'bg-violet-100 text-violet-700', icon: Hourglass },
  REJECTED: { label: 'Không được duyệt', cls: 'bg-rose-100 text-rose-700', icon: XCircle },
  CANCELLED: { label: 'Đã rút', cls: 'bg-muted text-muted-foreground', icon: XCircle },
}

interface Slot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface UpcomingSession {
  id: string
  date: string
  startTime: string
  endTime: string
}

interface AttendanceRecord {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string | null // PRESENT | LATE | ABSENT | null
  sessionNote?: string | null
}

// Lịch sử đóng học phí của tôi trong 1 lớp (từ /api/enrollments/mine)
interface FeePaymentRecord {
  id: string
  period: string // YYYY-MM
  amount: number
  method: string
  note: string | null
  paidAt: string
}

interface MyEnrollment {
  id: string
  status: string
  studentName: string | null
  note: string | null
  createdAt: string
  myWaitlistPosition?: number | null
  class: {
    id: string
    title: string
    subject: { id: string; name: string }
    gradeLevel: string | null
    meetingType: string
    address: string | null
    capacity: number
    monthlyFee: number | null
    status: string
    startDate: string | null
    schedule: Slot[]
    enrolledCount: number
    waitlistCount?: number
    nextSession?: UpcomingSession | null
    upcomingSessions?: UpcomingSession[]
    cancelledRecent?: { id: string; date: string; startTime: string; note?: string | null }[]
    tutor: {
      id: string
      name: string
      avatar?: string | null
      profession?: string | null
      district?: string | null
      city?: string | null
      address?: string | null
      isVerified?: boolean
    }
  }
  attendance?: {
    present: number
    late?: number
    absent: number
    total: number
    history: AttendanceRecord[]
  }
  fees?: {
    monthlyFee: number | null
    currentPeriod: string // YYYY-MM
    currentPaid: boolean
    unpaidPeriods: string[]
    payments: FeePaymentRecord[]
  }
}

/**
 * "Lớp học nhóm đã đăng ký" — hiển thị trong dashboard phụ huynh/học sinh:
 * các lớp học cố định họ đã gửi đăng ký (chờ duyệt / đã vào lớp / đang chờ chỗ),
 * kèm CHUYÊN CẦN (đã học bao nhiêu buổi, vắng bao nhiêu) và buổi học tới.
 */
export function StudentClassesPanel() {
  const { user, navigate } = useApp()
  const [enrollments, setEnrollments] = useState<MyEnrollment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<MyEnrollment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [expandedAttendance, setExpandedAttendance] = useState<string | null>(null)

  const load = async () => {
    try {
      const data = await fetch('/api/enrollments/mine').then(r => r.json())
      setEnrollments(data.enrollments || [])
    } catch { /* ignore */ }
    setLoaded(true)
  }

  useEffect(() => {
    if (user?.role === 'STUDENT') load()
  }, [user])

  // Mở hội thoại với gia sư dạy lớp
  const openChat = async (tutorId: string) => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId: tutorId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Không mở được hội thoại')
      navigate({ name: 'messages', conversationId: data.conversationId })
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/classes/${cancelTarget.class.id}/enrollments/${cancelTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Rút đăng ký thất bại')
      let msg: string
      if (cancelTarget.status === 'APPROVED') {
        msg = `Đã rời lớp "${cancelTarget.class.title}" — gia sư sẽ được thông báo`
      } else if (cancelTarget.status === 'WAITLIST') {
        msg = `Đã rút khỏi danh sách chờ của lớp "${cancelTarget.class.title}"`
      } else {
        msg = `Đã rút đăng ký khỏi lớp "${cancelTarget.class.title}"`
      }
      if (data.promotedFromWaitlist?.length > 0) {
        msg += `. Chỗ trống được chuyển cho học sinh chờ tiếp theo.`
      }
      toast.success(msg, { duration: 5000 })
      setCancelTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user || user.role !== 'STUDENT' || !loaded || enrollments.length === 0) {
    return null // chưa đăng ký lớp nào → ẩn gọn dashboard
  }

  const active = enrollments.filter(e => ['PENDING', 'APPROVED', 'WAITLIST'].includes(e.status))
  const past = enrollments.filter(e => e.status === 'REJECTED' || e.status === 'CANCELLED')

  const renderCard = (e: MyEnrollment) => {
    const st = ENROLL_STATUS[e.status] ?? ENROLL_STATUS.PENDING
    const StIcon = st.icon
    const cls = e.class
    const remaining = cls.capacity - cls.enrolledCount
    const pct = Math.min(100, Math.round((cls.enrolledCount / cls.capacity) * 100))
    const attOpen = expandedAttendance === e.id
    return (
      <Card key={e.id} className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-11 w-11 rounded-xl shrink-0">
            <AvatarImage src={cls.tutor.avatar || undefined} alt={cls.tutor.name} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {cls.tutor.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate flex items-center gap-1.5">
                  <GraduationCap className="h-4 w-4 text-primary shrink-0" />
                  {cls.title}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {cls.tutor.name}
                  {cls.tutor.profession ? ` · ${cls.tutor.profession}` : ''}
                </p>
              </div>
              <Badge className={`${st.cls} border-0 text-[10px] gap-1 shrink-0`}>
                <StIcon className="h-3 w-3" /> {st.label}
              </Badge>
            </div>

            <div className="mt-2.5 space-y-1.5 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-1.5">
                {sortClassSlots(cls.schedule).map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold">
                    <Clock className="h-3 w-3" />
                    {CLASS_DAY_NAMES[s.dayOfWeek]} {s.startTime}–{s.endTime}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  {cls.meetingType === 'ONLINE'
                    ? <><Video className="h-3.5 w-3.5" /> Trực tuyến</>
                    : <><HomeIcon className="h-3.5 w-3.5" /> Tại nhà gia sư</>}
                  {cls.address ? ` · ${cls.address}` : ''}
                </span>
                {cls.monthlyFee != null && (
                  <span className="inline-flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5" /> {formatVnd(cls.monthlyFee)}/tháng
                  </span>
                )}
              </div>

              {/* Buổi học tới — học sinh đã vào lớp */}
              {e.status === 'APPROVED' && cls.nextSession && (
                <p className="flex items-center gap-1.5 bg-primary/5 border border-primary/15 rounded-lg px-2.5 py-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>
                    Buổi tới: <b className="text-foreground">{formatDate(cls.nextSession.date)}</b>{' '}
                    {cls.nextSession.startTime}–{cls.nextSession.endTime}
                  </span>
                </p>
              )}

              {/* Thông báo buổi đã bị dời / nghỉ gần đây */}
              {e.status === 'APPROVED' && (cls.cancelledRecent?.length ?? 0) > 0 && (
                <p className="flex items-start gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                  <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                  <span>
                    Buổi {formatDate(cls.cancelledRecent![0].date)} đã nghỉ
                    {cls.cancelledRecent![0].note ? ` — ${cls.cancelledRecent![0].note}` : ''}
                    {cls.cancelledRecent!.length > 1 ? ` (+${cls.cancelledRecent!.length - 1} buổi khác)` : ''}
                  </span>
                </p>
              )}

              {/* Danh sách chờ: vị trí */}
              {e.status === 'WAITLIST' && (
                <p className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5">
                  <Hourglass className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                  <span>
                    Vị trí <b className="text-violet-700">#{e.myWaitlistPosition ?? cls.waitlistCount ?? '?'}</b> trong
                    danh sách chờ — tự động vào lớp khi có chỗ trống (kèm thông báo).
                  </span>
                </p>
              )}
            </div>

            {/* Sĩ số lớp — phụ huynh nắm rõ lớp còn chỗ hay đã đầy */}
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Users className="h-3 w-3" /> Sĩ số lớp
                </span>
                <span className={remaining === 0 ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}>
                  {cls.enrolledCount}/{cls.capacity} học sinh{remaining > 0 ? ` · còn ${remaining} chỗ` : ' · đã đủ'}
                  {(cls.waitlistCount ?? 0) > 0 ? ` · ${cls.waitlistCount} chờ chỗ` : ''}
                </span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>

            {/* Chuyên cần — chỉ khi đã vào lớp và có dữ liệu điểm danh */}
            {e.status === 'APPROVED' && e.attendance && e.attendance.total > 0 && (
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <ClipboardCheck className="h-3 w-3" /> Chuyên cần của{' '}
                    {e.studentName && e.studentName !== user.name ? e.studentName : 'bạn'}
                  </span>
                  <span className="text-muted-foreground">
                    <b className="text-emerald-600">{e.attendance.present} có mặt</b>
                    {(e.attendance.late ?? 0) > 0 && <b className="text-amber-600"> · {e.attendance.late} muộn</b>}
                    {e.attendance.absent > 0 && <b className="text-rose-600"> · {e.attendance.absent} vắng</b>}
                    <span> / {e.attendance.total} buổi</span>
                  </span>
                </div>
                <Progress
                  value={Math.round(((e.attendance.present + (e.attendance.late ?? 0)) / e.attendance.total) * 100)}
                  className="h-1.5"
                />
                {e.attendance.history.length > 0 && (
                  <button
                    className="text-[11px] text-primary hover:underline mt-1.5 inline-flex items-center gap-1"
                    onClick={() => setExpandedAttendance(attOpen ? null : e.id)}
                  >
                    {attOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {attOpen ? 'Thu gọn' : `Xem ${e.attendance.history.length} buổi đã học`}
                  </button>
                )}
                {attOpen && (
                  <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto scroll-area pr-1">
                    {e.attendance.history.map(a => (
                      <div key={a.id} className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded-lg bg-muted/40">
                        <span className="text-muted-foreground truncate">
                          {formatDate(a.date)} · {a.startTime}
                          {a.sessionNote ? ` · ${a.sessionNote}` : ''}
                        </span>
                        {a.status === 'PRESENT' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Có mặt
                          </span>
                        ) : a.status === 'LATE' ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-semibold shrink-0">
                            <Clock4 className="h-3 w-3" /> Đi muộn
                          </span>
                        ) : a.status === 'ABSENT' ? (
                          <span className="inline-flex items-center gap-1 text-rose-600 font-semibold shrink-0">
                            <XCircle className="h-3 w-3" /> Vắng
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic shrink-0">Chưa điểm danh</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Học phí — chỉ khi đã vào lớp và lớp có học phí tháng */}
            {e.status === 'APPROVED' && e.fees && (e.fees.monthlyFee != null || e.fees.payments.length > 0) && (
              <div className="mt-2.5 rounded-lg border px-2.5 py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                    <Wallet className="h-3 w-3" /> Học phí
                    {e.fees.monthlyFee != null && (
                      <span className="text-foreground font-semibold">{formatVnd(e.fees.monthlyFee)}/tháng</span>
                    )}
                  </span>
                  {e.fees.currentPaid ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Tháng {Number(e.fees.currentPeriod.slice(5))}/{e.fees.currentPeriod.slice(2, 4)} đã đóng
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                      <AlertCircle className="h-3 w-3" />
                      Tháng {Number(e.fees.currentPeriod.slice(5))}/{e.fees.currentPeriod.slice(2, 4)} chưa đóng
                      {e.fees.unpaidPeriods.length > 1 && ` (+${e.fees.unpaidPeriods.length - 1} tháng)`}
                    </span>
                  )}
                </div>
                {e.fees.payments.length > 0 && (
                  <div className="space-y-0.5">
                    {e.fees.payments.slice(0, 3).map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-2 text-[11px] px-1.5 py-0.5 rounded bg-muted/40">
                        <span className="text-muted-foreground truncate">
                          T{Number(p.period.slice(5))}/{p.period.slice(2, 4)}
                          {p.note ? ` · ${p.note}` : ''}
                        </span>
                        <span className="font-semibold text-foreground shrink-0">{formatVnd(p.amount)}</span>
                      </div>
                    ))}
                    {e.fees.payments.length > 3 && (
                      <p className="text-[10px] text-muted-foreground px-1.5">
                        +{e.fees.payments.length - 3} lần đóng khác
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {e.studentName && e.studentName !== user.name && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Học sinh: <span className="font-medium text-foreground">{e.studentName}</span>
              </p>
            )}

            <div className="flex gap-2 mt-3 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => navigate({ name: 'tutor', id: cls.tutor.id })}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Hồ sơ gia sư
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openChat(cls.tutor.id)}>
                <MessageSquare className="h-3.5 w-3.5 mr-1" /> Nhắn tin
              </Button>
              {['PENDING', 'APPROVED', 'WAITLIST'].includes(e.status) && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelTarget(e)}>
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  {e.status === 'APPROVED' ? 'Rời lớp' : e.status === 'WAITLIST' ? 'Rút khỏi chờ' : 'Rút đăng ký'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="mb-6">
      <h2 className="font-bold text-base mb-3 flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-primary" />
        Lớp học cố định đã đăng ký
        {active.length > 0 && (
          <span className="text-[10px] font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
            {active.length} lớp
          </span>
        )}
      </h2>
      <div className="grid md:grid-cols-2 gap-3">
        {active.map(renderCard)}
      </div>
      {past.length > 0 && (
        <details className="mt-3 group">
          <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground">
            Đăng ký đã kết thúc ({past.length})
          </summary>
          <div className="grid md:grid-cols-2 gap-3 mt-3 opacity-75">
            {past.map(renderCard)}
          </div>
        </details>
      )}

      {/* Dialog xác nhận rút đăng ký / rời lớp / rút khỏi danh sách chờ */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              {cancelTarget?.status === 'APPROVED'
                ? 'Rời lớp học?'
                : cancelTarget?.status === 'WAITLIST'
                  ? 'Rút khỏi danh sách chờ?'
                  : 'Rút đăng ký?'}
            </DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>
                  Lớp <b>{cancelTarget.class.title}</b> —{' '}
                  {cancelTarget.status === 'APPROVED'
                    ? 'con bạn đang là học sinh của lớp. Gia sư sẽ nhận được thông báo và sĩ số lớp được giải phóng chỗ cho học sinh trong danh sách chờ.'
                    : cancelTarget.status === 'WAITLIST'
                      ? 'bạn đang giữ một vị trí trong danh sách chờ của lớp. Rút khỏi chờ thì mất thứ tự ưu tiên hiện tại.'
                      : 'đăng ký đang chờ gia sư duyệt. Bạn có thể đăng ký lại sau nếu đổi ý.'}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Giữ nguyên</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={submitting}>
              {submitting ? 'Đang xử lý...' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
