'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import {
  Clock, MapPin, Video, Users, ClipboardCheck, CalendarClock, CalendarOff,
  GraduationCap, CheckCircle2, XCircle, User, Wallet, Info as NoteIcon, ExternalLink, Home,
} from 'lucide-react'
import {
  CalEvent, GroupClass, ClassSessionItem, BookingItem,
  formatEventDate, eventTimeText, STATUS_LABEL, STATUS_BADGE_CLASS,
  isEventStarted, formatVndShort,
} from './schedule-shared'
import { AttendanceTarget, RescheduleTarget, CancelSessionTarget } from './event-action-dialogs'

interface EventDetailDialogProps {
  event: CalEvent | null
  onClose: () => void
  onAttendance: (t: AttendanceTarget) => void
  onReschedule: (t: RescheduleTarget) => void
  onCancelSession: (t: CancelSessionTarget) => void
  onConfirmBooking: (b: BookingItem) => void
  onCompleteBooking: (b: BookingItem) => void
  onCancelBooking: (b: BookingItem) => void
  onOpenClassesTab: () => void
}

const MODE_LABEL: Record<string, string> = {
  AT_TUTOR_HOME: 'Tại nhà gia sư',
  ONLINE: 'Trực tuyến',
  TUTOR_TO_STUDENT: 'Gia sư đến nhà học sinh',
  STUDENT_TO_TUTOR: 'Học sinh đến nhà gia sư',
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  )
}

/** Dialog chi tiết 1 buổi học — bấm vào block trên lịch để mở.
 *  Hiện đầy đủ thông tin + nút thao tác nhanh ngay tại chỗ. */
export function EventDetailDialog(props: EventDetailDialogProps) {
  const { event, onClose } = props
  if (!event) return null

  if (event.kind === 'group') {
    const { cls, session } = event
    const approved = cls.enrollments.filter(e => e.status === 'APPROVED')
    const waiting = cls.enrollments.filter(e => e.status === 'WAITLIST')
    const pending = cls.enrollments.filter(e => e.status === 'PENDING')
    const present = session.attendance.filter(a => a.status === 'PRESENT').length
    const absent = session.attendance.filter(a => a.status === 'ABSENT').length
    const started = isEventStarted(event)
    const status = session.status

    return (
      <Dialog open onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-2.5 pr-6">
              <span className="h-9 w-9 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block leading-snug">{cls.title}</span>
                <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                  Lớp nhóm · {cls.subject.name}{cls.gradeLevel ? ` · ${cls.gradeLevel}` : ''}
                </span>
              </span>
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 pt-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[status] ?? 'bg-muted'}`}>
                {STATUS_LABEL[status] ?? status}
              </span>
              <span className="text-xs">{formatEventDate(session.date)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="py-1">
            <InfoRow icon={Clock} label="Thời gian" value={`${eventTimeText(event)} (${formatEventDate(session.date)})`} />
            <InfoRow
              icon={cls.meetingType === 'ONLINE' ? Video : cls.meetingType === 'AT_TUTOR_HOME' ? Home : MapPin}
              label="Hình thức"
              value={MODE_LABEL[cls.meetingType] + (cls.address && cls.meetingType !== 'ONLINE' ? ` — ${cls.address}` : '')}
            />
            <InfoRow
              icon={GraduationCap}
              label="Học sinh"
              value={
                <span>
                  <b>{approved.length}/{cls.capacity}</b> đã vào lớp
                  {waiting.length > 0 && <span className="text-violet-600"> · {waiting.length} chờ chỗ</span>}
                  {pending.length > 0 && <span className="text-amber-600"> · {pending.length} chờ duyệt</span>}
                </span>
              }
            />
            {approved.length > 0 && (
              <div className="flex flex-wrap gap-1.5 py-1.5 pl-[26px]">
                {approved.slice(0, 6).map(e => (
                  <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-muted/70 pl-1 pr-2.5 py-0.5 text-xs font-medium" title={e.parent.name}>
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={e.parent.avatar || undefined} />
                      <AvatarFallback className="text-[8px]">{(e.studentName || e.parent.name).slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    {e.studentName || e.parent.name}
                  </span>
                ))}
                {approved.length > 6 && <span className="text-xs text-muted-foreground self-center">+{approved.length - 6} nữa</span>}
              </div>
            )}
            {session.attendance.length > 0 && (
              <InfoRow
                icon={ClipboardCheck}
                label="Điểm danh"
                value={<span className={absent > 0 ? '' : 'text-emerald-600'}>{present} có mặt · {absent} vắng</span>}
              />
            )}
            {session.note && (
              <InfoRow icon={NoteIcon} label={status === 'CANCELLED' ? 'Lý do nghỉ' : 'Ghi chú buổi học'} value={session.note} />
            )}
          </div>

          <Separator />

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {status === 'SCHEDULED' && started && approved.length > 0 && (
              <Button className="w-full font-bold" onClick={() => props.onAttendance({ cls, session })}>
                <ClipboardCheck className="h-4 w-4 mr-1.5" />
                {session.attendance.length > 0 ? 'Sửa điểm danh' : 'Điểm danh ngay'}
              </Button>
            )}
            {status === 'COMPLETED' && approved.length > 0 && (
              <Button className="w-full font-bold" variant="outline" onClick={() => props.onAttendance({ cls, session })}>
                <ClipboardCheck className="h-4 w-4 mr-1.5" /> Sửa điểm danh
              </Button>
            )}
            {status === 'SCHEDULED' && (
              <div className="grid grid-cols-2 gap-2 w-full">
                <Button variant="outline" className="font-semibold" onClick={() => props.onReschedule({ cls, session })}>
                  <CalendarClock className="h-4 w-4 mr-1.5" /> Dời buổi
                </Button>
                <Button variant="outline" className="font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200" onClick={() => props.onCancelSession({ cls, session })}>
                  <CalendarOff className="h-4 w-4 mr-1.5" /> Nghỉ buổi
                </Button>
              </div>
            )}
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={props.onOpenClassesTab}>
              <ExternalLink className="h-4 w-4 mr-1.5" /> Mở tab Lớp học để quản lý lớp này
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ===== Buổi 1-1 =====
  const b = event.booking
  const started = isEventStarted(event)
  const status = b.status

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2.5 pr-6">
            <span className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <User className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block leading-snug">{b.subject.name} <span className="text-muted-foreground font-normal">· 1-1</span></span>
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">Với {b.student.name}</span>
            </span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[status] ?? 'bg-muted'}`}>
              {STATUS_LABEL[status] ?? status}
            </span>
            <span className="text-xs">{formatEventDate(b.date)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-1">
          <InfoRow icon={Clock} label="Thời gian" value={`${eventTimeText(event)} (${formatEventDate(b.date)})`} />
          <InfoRow
            icon={b.mode === 'ONLINE' ? Video : b.mode === 'TUTOR_TO_STUDENT' ? MapPin : Home}
            label="Hình thức"
            value={MODE_LABEL[b.mode] ?? b.mode}
          />
          <InfoRow icon={MapPin} label="Địa chỉ" value={b.mode === 'TUTOR_TO_STUDENT' ? b.student.address || b.student.district : null} />
          <InfoRow icon={User} label="Học sinh" value={
            <span>{b.student.name}{b.student.phone ? <span className="text-muted-foreground font-normal"> · {b.student.phone}</span> : null}</span>
          } />
          <InfoRow icon={Wallet} label="Học phí buổi này" value={formatVndShort(b.totalAmount)} />
          {b.seriesId && (
            <InfoRow icon={Clock} label="Buổi trong chuỗi" value={`Buổi học định kỳ (tổng ${b.seriesTotal ?? '?'} buổi)`} />
          )}
          {b.note && <InfoRow icon={NoteIcon} label="Ghi chú" value={b.note} />}
        </div>

        <Separator />

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {status === 'PENDING' && (
            <Button className="w-full font-bold" onClick={() => props.onConfirmBooking(b)}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Xác nhận lịch dạy
            </Button>
          )}
          {status === 'CONFIRMED' && started && (
            <Button variant="outline" className="w-full font-semibold" onClick={() => props.onCompleteBooking(b)}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Đánh dấu hoàn thành
            </Button>
          )}
          {(status === 'PENDING' || status === 'CONFIRMED') && (
            <Button variant="outline" className="w-full font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200" onClick={() => props.onCancelBooking(b)}>
              <XCircle className="h-4 w-4 mr-1.5" /> Hủy buổi học
            </Button>
          )}
          {status === 'COMPLETED' && (
            <p className="w-full text-center text-xs text-muted-foreground">
              Buổi học đã hoàn thành — học phí đã ghi nhận vào doanh thu.
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
