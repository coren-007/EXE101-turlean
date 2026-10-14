'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Users, CalendarClock, CheckCircle2, XCircle, ChevronDown, ChevronUp, Wallet,
  MessageCircle, Video, Home as HomeIcon, MapPin, Clock, UserCheck, GraduationCap,
} from 'lucide-react'
import { formatVnd, formatDate } from '@/lib/format'
import { toast } from 'sonner'

interface OneToOneBooking {
  id: string
  studentId: string
  mode: string
  date: string
  startTime: string
  endTime: string
  status: string
  note?: string | null
  address?: string | null
  totalAmount: number
  seriesId?: string | null
  seriesTotal?: number | null
  student: { id: string; name: string; avatar?: string | null; phone?: string | null }
  subject: { id: string; name: string }
}

interface StudentGroup {
  student: OneToOneBooking['student']
  subjects: string[]
  pending: OneToOneBooking[]
  upcoming: OneToOneBooking[] // CONFIRMED, date >= hôm nay
  completed: OneToOneBooking[]
  cancelled: OneToOneBooking[]
  next: OneToOneBooking | null
  earned: number
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Chờ xác nhận', cls: 'bg-amber-100 text-amber-700' },
  CONFIRMED: { label: 'Đã xác nhận', cls: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Hoàn thành', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Đã hủy', cls: 'bg-muted text-muted-foreground' },
}

const MODE_META: Record<string, { label: string; icon: typeof Video }> = {
  TUTOR_TO_STUDENT: { label: 'Tại nhà học sinh', icon: MapPin },
  STUDENT_TO_TUTOR: { label: 'Tại nhà bạn', icon: HomeIcon },
  ONLINE: { label: 'Trực tuyến', icon: Video },
}

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Buổi đã đến (hoặc đã qua) giờ bắt đầu — đủ điều kiện đánh dấu hoàn thành */
const isSessionStarted = (b: OneToOneBooking) =>
  new Date(`${b.date}T${b.startTime}`).getTime() <= Date.now()

/**
 * Panel "Lớp theo lịch dạy (1-1)" trong Tutor Studio — quản lý các buổi dạy 1-1
 * THEO HỌC SINH (kiểu hệ thống quản lý lớp của trường đại học): mỗi học sinh là
 * một "lớp" với danh sách buổi học, thao tác xác nhận / hoàn thành / hủy ngay tại chỗ.
 */
export function TutorOneToOnePanel() {
  const { user, navigate } = useApp()
  const [bookings, setBookings] = useState<OneToOneBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  // Xem toàn bộ lịch sử buổi đã kết thúc (mặc định hiện 3 buổi gần nhất)
  const [showAllPast, setShowAllPast] = useState<Record<string, boolean>>({})

  // Dialog từ chối / hủy buổi học (kèm lý do)
  const [cancelTarget, setCancelTarget] = useState<OneToOneBooking | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [submittingCancel, setSubmittingCancel] = useState(false)

  const load = async () => {
    const data = await fetch('/api/bookings?role=tutor').then(r => r.json())
    setBookings(data.bookings || [])
    setLoading(false)
  }

  useEffect(() => {
    if (user?.role === 'TUTOR') load()
  }, [user])

  const patchStatus = async (b: OneToOneBooking, status: 'CONFIRMED' | 'COMPLETED') => {
    setActing(b.id)
    try {
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: b.id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(
        status === 'CONFIRMED'
          ? `Đã xác nhận buổi ${b.subject.name} · ${formatDate(b.date)} ${b.startTime}`
          : `Đã đánh dấu hoàn thành buổi ${formatDate(b.date)} — +${formatVnd(b.totalAmount)}`,
      )
      setBookings(prev => prev.map(x => (x.id === b.id ? { ...x, status } : x)))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setActing(null)
    }
  }

  const submitCancel = async () => {
    if (!cancelTarget) return
    if (cancelReason.trim().length < 5) {
      toast.error('Lý do hủy phải có ít nhất 5 ký tự')
      return
    }
    setSubmittingCancel(true)
    try {
      const res = await fetch(`/api/bookings/${cancelTarget.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Đã hủy buổi học')
      setBookings(prev => prev.map(x => (x.id === cancelTarget.id ? { ...x, status: 'CANCELLED' } : x)))
      setCancelTarget(null)
      setCancelReason('')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmittingCancel(false)
    }
  }

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

  if (loading) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Đang tải lớp học 1-1...</Card>
  }

  const today = dateKey(new Date())
  // Nhóm bookings theo học sinh (bỏ booking CANCELLED khi xét "đang dạy")
  const groups: StudentGroup[] = []
  const byStudent = new Map<string, OneToOneBooking[]>()
  bookings.forEach(b => {
    if (!byStudent.has(b.studentId)) byStudent.set(b.studentId, [])
    byStudent.get(b.studentId)!.push(b)
  })
  byStudent.forEach((list, studentId) => {
    const sorted = [...list].sort((a, b) =>
      (a.date + a.startTime).localeCompare(b.date + b.startTime))
    const active = sorted.filter(b => b.status !== 'CANCELLED')
    if (active.length === 0) return // học sinh chỉ có buổi đã hủy → không hiện
    const upcoming = sorted.filter(b => b.status === 'CONFIRMED' && b.date >= today)
    const pending = sorted.filter(b => b.status === 'PENDING')
    const completed = sorted.filter(b => b.status === 'COMPLETED')
    groups.push({
      student: sorted[0].student,
      subjects: [...new Set(active.map(b => b.subject.name))],
      pending,
      upcoming,
      completed,
      cancelled: sorted.filter(b => b.status === 'CANCELLED'),
      next: upcoming[0] ?? null,
      earned: completed.reduce((s, b) => s + b.totalAmount, 0),
    })
  })
  // Học sinh có đơn chờ hoặc buổi sắp tới đứng trước, rồi mới đến học sinh cũ
  groups.sort((a, b) => {
    const rank = (g: StudentGroup) => (g.pending.length > 0 ? 0 : g.next ? 1 : 2)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return (a.next?.date ?? '9999').localeCompare(b.next?.date ?? '9999')
  })

  const pendingTotal = bookings.filter(b => b.status === 'PENDING').length
  const upcomingTotal = bookings.filter(b => b.status === 'CONFIRMED' && b.date >= today).length

  return (
    <div className="space-y-4">
      {/* Toolbar mỏng: tổng quan 1 dòng — vào thẳng danh sách học sinh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          <b className="text-foreground">{groups.length}</b> học sinh 1-1
          {pendingTotal > 0 && (<> · <span className="font-semibold text-amber-600">{pendingTotal} yêu cầu chờ xác nhận</span></>)}
          {upcomingTotal > 0 && (<> · <b className="text-foreground">{upcomingTotal}</b> buổi sắp dạy</>)}
        </p>
        <Button size="sm" variant="outline" className="rounded-full h-8" onClick={() => navigate({ name: 'dashboard', tab: 'schedule' })}>
          <Clock className="h-3.5 w-3.5 mr-1" /> Mở giờ trống
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card className="p-10 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Chưa có học sinh 1-1 nào</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Khi phụ huynh đặt lịch dạy 1-1 trong <b>giờ trống</b> của bạn, học sinh sẽ
            xuất hiện tại đây để bạn quản lý từng buổi học.
          </p>
          <Button variant="outline" onClick={() => navigate({ name: 'dashboard', tab: 'schedule' })}>
            <Clock className="h-4 w-4 mr-1" /> Thiết lập giờ trống
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(g => {
            const isOpen = expanded === g.student.id
            // Buổi đã kết thúc: mặc định 3 buổi gần nhất, mở "xem tất cả" để thấy toàn bộ
            const pastSorted = [...g.completed, ...g.cancelled]
              .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))
            const showAll = showAllPast[g.student.id] ?? false
            const recent = showAll ? pastSorted : pastSorted.slice(0, 3)
            const rows = [...g.pending, ...g.upcoming, ...recent]
            const ModeIcon = g.next ? (MODE_META[g.next.mode]?.icon ?? Clock) : Clock
            return (
              <Card key={g.student.id} className="p-5 rounded-2xl">
                {/* Dòng 1: học sinh + trạng thái + действия */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <Avatar className="h-11 w-11 rounded-xl shrink-0">
                      <AvatarImage src={g.student.avatar || undefined} alt={g.student.name} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {g.student.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base truncate">{g.student.name}</h3>
                        {g.pending.length > 0 && (
                          <Badge className="bg-primary text-primary-foreground border-0 text-[10px] gap-1">
                            <UserCheck className="h-3 w-3" /> {g.pending.length} yêu cầu chờ
                          </Badge>
                        )}
                        {g.student.phone && (
                          <span className="text-[10px] text-muted-foreground">{g.student.phone}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {g.subjects.map(s => (
                          <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold">
                            {s}
                          </span>
                        ))}
                        <span className="text-[11px] text-muted-foreground">
                          · {g.completed.length} buổi đã học
                          {g.upcoming.length > 0 ? ` · ${g.upcoming.length} buổi sắp tới` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openChat(g.student.id)}>
                      <MessageCircle className="h-3.5 w-3.5 mr-1" /> Nhắn tin
                    </Button>
                    <Button
                      size="sm"
                      variant={isOpen ? 'secondary' : 'outline'}
                      onClick={() => setExpanded(isOpen ? null : g.student.id)}
                    >
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                      {isOpen ? 'Thu gọn' : 'Xem buổi học'}
                    </Button>
                  </div>
                </div>

                {/* Dòng 2: buổi tới + thu nhập — gọn 1 dòng duy nhất */}
                <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <CalendarClock className="h-3.5 w-3.5 text-primary shrink-0" /> Buổi tới:
                  </span>
                  {g.next ? (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <b className="text-primary">{formatDate(g.next.date)}</b>
                      <span>{g.next.startTime}–{g.next.endTime}</span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <ModeIcon className="h-3 w-3" /> {MODE_META[g.next.mode]?.label}
                      </span>
                    </span>
                  ) : g.pending.length > 0 ? (
                    <span className="text-amber-600 font-medium">
                      {g.pending.length} yêu cầu đang chờ bạn xác nhận
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Chưa có buổi nào được xác nhận</span>
                  )}
                  {g.earned > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
                      <Wallet className="h-3 w-3" /> Đã thu <b className="text-foreground">{formatVnd(g.earned)}</b>
                    </span>
                  )}
                </div>

                {/* Chi tiết buổi học (mở rộng) */}
                {isOpen && (
                  <div className="mt-4 border-t pt-4">
                    <p className="text-xs font-semibold mb-2.5 flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5 text-primary" /> Các buổi học ({rows.length})
                    </p>
                    {rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Chưa có buổi học nào</p>
                    ) : (
                      <div className="space-y-2">
                        {rows.map(b => {
                          const st = STATUS_META[b.status] ?? STATUS_META.PENDING
                          const canConfirm = b.status === 'PENDING'
                          const canComplete = b.status === 'CONFIRMED' && isSessionStarted(b)
                          const bMode = MODE_META[b.mode]?.icon ?? Clock
                          return (
                            <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-xl border bg-background/50 flex-wrap">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold">{formatDate(b.date)}</span>
                                  <span className="text-sm">{b.startTime}–{b.endTime}</span>
                                  <Badge className={`${st.cls} border-0 text-[10px]`}>{st.label}</Badge>
                                  {b.seriesId && (
                                    <Badge variant="outline" className="text-[10px]">Khóa {b.seriesTotal} buổi</Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span>{b.subject.name}</span>
                                  <span className="inline-flex items-center gap-1">
                                    · {(() => { const I = bMode; return <I className="h-3 w-3" /> })()} {MODE_META[b.mode]?.label}
                                  </span>
                                  <span>· {formatVnd(b.totalAmount)}</span>
                                  {b.address && <span className="truncate">· {b.address}</span>}
                                </p>
                                {b.note && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 italic truncate">"{b.note}"</p>
                                )}
                              </div>
                              <div className="flex gap-1.5">
                                {canConfirm && (
                                  <>
                                    <Button
                                      size="sm" className="h-7 text-xs"
                                      disabled={acting === b.id}
                                      onClick={() => patchStatus(b, 'CONFIRMED')}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Xác nhận
                                    </Button>
                                    <Button
                                      size="sm" variant="outline" className="h-7 text-xs"
                                      onClick={() => { setCancelTarget(b); setCancelReason('') }}
                                    >
                                      <XCircle className="h-3.5 w-3.5 mr-1" /> Từ chối
                                    </Button>
                                  </>
                                )}
                                {canComplete && (
                                  <Button
                                    size="sm" className="h-7 text-xs"
                                    disabled={acting === b.id}
                                    onClick={() => patchStatus(b, 'COMPLETED')}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Hoàn thành
                                  </Button>
                                )}
                                {b.status === 'CONFIRMED' && !canComplete && (
                                  <span className="text-[10px] text-muted-foreground self-center">
                                    Đánh dấu hoàn thành sau khi dạy xong
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* Xem toàn bộ lịch sử buổi đã kết thúc của học sinh này */}
                    {pastSorted.length > 3 && (
                      <button
                        className="text-[11px] text-primary hover:underline mt-2.5"
                        onClick={() => setShowAllPast(prev => ({ ...prev, [g.student.id]: !showAll }))}
                      >
                        {showAll
                          ? 'Thu gọn lịch sử'
                          : `Xem tất cả ${pastSorted.length} buổi đã kết thúc (hiện 3 gần nhất)`}
                      </button>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog từ chối / hủy buổi học kèm lý do */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Từ chối / hủy buổi học</DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>Buổi {cancelTarget.subject.name} · {formatDate(cancelTarget.date)} {cancelTarget.startTime} với {cancelTarget.student.name}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-semibold">Lý do (gửi cho phụ huynh)</p>
            <Textarea
              placeholder="Ví dụ: Trùng lịch cá nhân, gia đình có việc đột xuất..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Hủy buổi đã xác nhận quá muộn có thể bị trừ điểm uy tín — cân nhắc thương lượng
              qua tin nhắn trước khi hủy.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Để sau</Button>
            <Button variant="destructive" onClick={submitCancel} disabled={submittingCancel || cancelReason.trim().length < 5}>
              {submittingCancel ? 'Đang xử lý...' : 'Xác nhận hủy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
