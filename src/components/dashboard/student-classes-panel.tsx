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
} from 'lucide-react'
import { formatVnd, formatDate, CLASS_DAY_NAMES, sortClassSlots } from '@/lib/format'
import { toast } from 'sonner'

const ENROLL_STATUS: Record<string, { label: string; cls: string; icon: any }> = {
  PENDING: { label: 'Chờ gia sư duyệt', cls: 'bg-amber-100 text-amber-700', icon: Clock3 },
  APPROVED: { label: 'Đã vào lớp', cls: 'bg-emerald-100 text-emerald-700', icon: UserCheck },
  REJECTED: { label: 'Không được duyệt', cls: 'bg-rose-100 text-rose-700', icon: XCircle },
  CANCELLED: { label: 'Đã rút', cls: 'bg-muted text-muted-foreground', icon: XCircle },
}

interface Slot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface MyEnrollment {
  id: string
  status: string
  studentName: string | null
  note: string | null
  createdAt: string
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
}

/**
 * "Lớp học nhóm đã đăng ký" — hiển thị trong dashboard phụ huynh/học sinh:
 * các lớp học cố định họ đã gửi đăng ký (chờ duyệt / đã vào lớp / bị từ chối).
 */
export function StudentClassesPanel() {
  const { user, navigate } = useApp()
  const [enrollments, setEnrollments] = useState<MyEnrollment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<MyEnrollment | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
      toast.success(
        cancelTarget.status === 'APPROVED'
          ? `Đã rời lớp "${cancelTarget.class.title}" — gia sư sẽ được thông báo`
          : `Đã rút đăng ký khỏi lớp "${cancelTarget.class.title}"`,
      )
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

  const active = enrollments.filter(e => e.status === 'PENDING' || e.status === 'APPROVED')
  const past = enrollments.filter(e => e.status === 'REJECTED' || e.status === 'CANCELLED')

  const renderCard = (e: MyEnrollment) => {
    const st = ENROLL_STATUS[e.status] ?? ENROLL_STATUS.PENDING
    const StIcon = st.icon
    const cls = e.class
    const remaining = cls.capacity - cls.enrolledCount
    const pct = Math.min(100, Math.round((cls.enrolledCount / cls.capacity) * 100))
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
                {cls.startDate && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" /> Khai giảng {formatDate(cls.startDate)}
                  </span>
                )}
                {cls.monthlyFee != null && (
                  <span className="inline-flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5" /> {formatVnd(cls.monthlyFee)}/tháng
                  </span>
                )}
              </div>
            </div>

            {/* Sĩ số lớp — phụ huynh nắm rõ lớp còn chỗ hay đã đầy */}
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Users className="h-3 w-3" /> Sĩ số lớp
                </span>
                <span className={remaining === 0 ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}>
                  {cls.enrolledCount}/{cls.capacity} học sinh{remaining > 0 ? ` · còn ${remaining} chỗ` : ' · đã đủ'}
                </span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>

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
              {(e.status === 'PENDING' || e.status === 'APPROVED') && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelTarget(e)}>
                  <XCircle className="h-3.5 w-3.5 mr-1" /> {e.status === 'APPROVED' ? 'Rời lớp' : 'Rút đăng ký'}
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

      {/* Dialog xác nhận rút đăng ký / rời lớp */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              {cancelTarget?.status === 'APPROVED' ? 'Rời lớp học?' : 'Rút đăng ký?'}
            </DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>
                  Lớp <b>{cancelTarget.class.title}</b> —{' '}
                  {cancelTarget.status === 'APPROVED'
                    ? 'con bạn đang là học sinh của lớp. Gia sư sẽ nhận được thông báo và sĩ số lớp được giải phóng chỗ cho học sinh khác.'
                    : 'đăng ký đang chờ gia sư duyệt. Bạn có thể đăng ký lại sau nếu đổi ý.'}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Giữ nguyên</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={submitting}>
              {submitting ? 'Đang xử lý...' : cancelTarget?.status === 'APPROVED' ? 'Xác nhận rời lớp' : 'Xác nhận rút'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
