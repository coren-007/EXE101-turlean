'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  GraduationCap, MapPin, Video, Wallet, Clock, CalendarClock, XCircle,
  CheckCircle2, ClipboardCheck, ExternalLink, MessageSquare, Home as HomeIcon, Clock4,
} from 'lucide-react'
import {
  CalEvent, eventDate, eventStart, eventEnd, eventStatus, eventTitle,
  formatEventDate, STATUS_LABEL, STATUS_BADGE_CLASS, isEventPast,
} from './schedule-shared'

interface StudentEventDetailDialogProps {
  event: CalEvent | null
  onClose: () => void
  /** Điểm danh của TÔI trong buổi lớp nhóm (PRESENT | LATE | ABSENT | null) */
  myAttendance?: string | null
  onOpenTutor: (tutorId: string) => void
  onChat: (tutorId: string) => void
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="text-sm font-medium leading-snug break-words">{value}</p>
      </div>
    </div>
  )
}

/**
 * Dialog chi tiết buổi học cho PHỤ HUYNH/HỌC SINH (bấm vào block trên lịch):
 * lớp nhóm → thông tin lớp + gia sư + điểm danh của mình;
 * buổi 1-1 → gia sư + môn + hình thức + trạng thái.
 */
export function StudentEventDetailDialog({
  event, onClose, myAttendance, onOpenTutor, onChat,
}: StudentEventDetailDialogProps) {
  if (!event) return null

  const isGroup = event.kind === 'group'
  const status = eventStatus(event)
  const tutor = isGroup ? event.cls.tutor : event.booking.tutor

  return (
    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto scroll-area">
      <DialogHeader>
        <DialogTitle className="flex items-start gap-2.5 pr-6">
          <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block leading-tight">{eventTitle(event)}</span>
            <span className="block text-xs font-normal text-muted-foreground mt-0.5">
              {isGroup
                ? `${event.cls.subject.name}${event.cls.gradeLevel ? ` · ${event.cls.gradeLevel}` : ''}`
                : `Lớp 1-1 · ${event.booking.subject.name}`}
            </span>
          </span>
        </DialogTitle>
        <DialogDescription className="sr-only">Chi tiết buổi học</DialogDescription>
      </DialogHeader>

      <div className="space-y-1">
        {/* Thời gian + trạng thái */}
        <div className="rounded-xl bg-muted/50 p-3">
          <p className="text-sm font-bold flex items-center gap-2 flex-wrap">
            <CalendarClock className="h-4 w-4 text-primary shrink-0" />
            {formatEventDate(eventDate(event))}
          </p>
          <p className="text-sm font-bold flex items-center gap-2 mt-0.5">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            {eventStart(event)} – {eventEnd(event)}
          </p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge className={`${STATUS_BADGE_CLASS[status] ?? 'bg-muted text-muted-foreground'} border-0 text-[10px] gap-1`}>
              {STATUS_LABEL[status] ?? status}
            </Badge>
            {isGroup && event.session.makeupForId && (
              <Badge className="bg-sky-100 text-sky-700 border-0 text-[10px] gap-1" title="Buổi dạy bù thay cho buổi đã nghỉ">
                Dạy bù
              </Badge>
            )}
            {/* Điểm danh của tôi trong buổi lớp nhóm đã hoàn thành */}
            {isGroup && status === 'COMPLETED' && (
              myAttendance === 'PRESENT' ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Bạn: CÓ MẶT
                </Badge>
              ) : myAttendance === 'LATE' ? (
                <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] gap-1">
                  <Clock4 className="h-3 w-3" /> Bạn: ĐI MUỘN
                </Badge>
              ) : myAttendance === 'ABSENT' ? (
                <Badge className="bg-rose-100 text-rose-700 border-0 text-[10px] gap-1">
                  <XCircle className="h-3 w-3" /> Bạn: VẮNG MẶT
                </Badge>
              ) : (
                <Badge className="bg-muted text-muted-foreground border-0 text-[10px] gap-1">
                  <ClipboardCheck className="h-3 w-3" /> Chưa điểm danh bạn
                </Badge>
              )
            )}
            {isGroup && status === 'CANCELLED' && event.session.note && (
              <span className="text-xs text-rose-600">Nghỉ buổi — {event.session.note}</span>
            )}
          </div>
        </div>

        {/* Gia sư */}
        {tutor && (
          <div className="flex items-center gap-3 py-2.5 px-1">
            <Avatar className="h-10 w-10 rounded-xl shrink-0">
              <AvatarImage src={tutor.avatar || undefined} alt={tutor.name} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {tutor.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground leading-none mb-0.5">Gia sư</p>
              <p className="text-sm font-semibold truncate">{tutor.name}</p>
            </div>
          </div>
        )}

        <Separator />

        {/* Chi tiết lớp nhóm */}
        {isGroup && (
          <div>
            <InfoRow
              icon={event.cls.meetingType === 'ONLINE' ? Video : HomeIcon}
              label="Địa điểm"
              value={
                event.cls.meetingType === 'ONLINE'
                  ? 'Học trực tuyến'
                  : (event.cls.address ?? 'Tại nhà gia sư')
              }
            />
            <InfoRow
              icon={Clock}
              label="Lịch cố định hằng tuần"
              value={
                <span className="text-xs">
                  {event.cls.schedule
                    .slice()
                    .sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7))
                    .map(s => `${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][s.dayOfWeek]} ${s.startTime}–${s.endTime}`)
                    .join(' · ')}
                </span>
              }
            />
            {event.cls.monthlyFee != null && (
              <InfoRow icon={Wallet} label="Học phí" value={`${event.cls.monthlyFee.toLocaleString('vi-VN')}₫ / tháng`} />
            )}
          </div>
        )}

        {/* Chi tiết buổi 1-1 */}
        {!isGroup && (
          <div>
            <InfoRow
              icon={event.booking.mode === 'ONLINE' ? Video : MapPin}
              label="Hình thức"
              value={
                event.booking.mode === 'ONLINE'
                  ? 'Học trực tuyến'
                  : event.booking.mode === 'TUTOR_TO_STUDENT'
                    ? 'Gia sư đến nhà bạn'
                    : 'Tại nhà gia sư'
              }
            />
            {event.booking.note && (
              <InfoRow icon={MessageSquare} label="Ghi chú" value={event.booking.note} />
            )}
            {status === 'PENDING' && !isEventPast(event) && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1">
                Buổi này đang chờ gia sư xác nhận — bạn sẽ nhận thông báo khi xác nhận.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Hành động */}
      {tutor && (
        <div className="flex gap-2 flex-wrap mt-2">
          <Button size="sm" variant="outline" onClick={() => { onOpenTutor(tutor.id); onClose() }}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Hồ sơ gia sư
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { onChat(tutor.id); onClose() }}>
            <MessageSquare className="h-3.5 w-3.5 mr-1" /> Nhắn tin
          </Button>
        </div>
      )}
    </DialogContent>
  )
}
