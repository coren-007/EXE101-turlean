'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CalendarDays, ChevronLeft, ChevronRight, Users, User, CalendarClock,
  Clock3, CalendarCheck, GraduationCap, Sparkles, RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CalEvent, GroupClass, BookingItem, AvailabilitySlot,
  dateKey, weekStartOf, addDays, addMonths, eventDate, eventStatus,
  isEventStarted, isEventPast,
} from './schedule-shared'
import { WeekView } from './week-view'
import { MonthView } from './month-view'
import { EventDetailDialog } from './event-detail-dialog'
import {
  AttendanceDialog, RescheduleDialog, CancelSessionDialog, CancelBookingDialog,
  AttendanceTarget, RescheduleTarget, CancelSessionTarget,
} from './event-action-dialogs'
import { AvailabilityDialog } from './availability-dialog'

type ViewMode = 'week' | 'month'

/**
 * Tab "Lịch dạy" — lịch tổng hợp dạng calendar:
 *  · Xem theo TUẦN (lưới giờ) hoặc THÁNG (lưới ngày), điều hướng tự do
 *  · Hợp nhất buổi lớp nhóm + buổi 1-1 + nền giờ trống trên cùng 1 lịch
 *  · Bấm vào buổi học → dialog chi tiết + thao tác ngay:
 *    điểm danh / dời buổi / nghỉ buổi / xác nhận & hủy 1-1
 */
export function TutorScheduleCalendar() {
  const { user, navigate } = useApp()

  const [classes, setClasses] = useState<GroupClass[]>([])
  const [bookings, setBookings] = useState<BookingItem[]>([])
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [mode, setMode] = useState<ViewMode>('week')
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [filters, setFilters] = useState({ group: true, one: true, avail: true })

  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null)
  const [attendanceTarget, setAttendanceTarget] = useState<AttendanceTarget | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null)
  const [cancelSessionTarget, setCancelSessionTarget] = useState<CancelSessionTarget | null>(null)
  const [cancelBookingTarget, setCancelBookingTarget] = useState<BookingItem | null>(null)
  const [availOpen, setAvailOpen] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const [clsData, bookingData, availData] = await Promise.all([
        fetch('/api/classes/mine').then(r => r.json()),
        fetch('/api/bookings?role=tutor').then(r => r.json()),
        fetch('/api/tutors/me/availability').then(r => r.json()),
      ])
      if (clsData?.error || bookingData?.error || availData?.error) throw new Error('load-failed')
      setClasses(clsData.classes || [])
      setBookings(bookingData.bookings || [])
      setAvailability(availData.availability || [])
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user?.role === 'TUTOR') load()
    else if (user) setLoading(false)
  }, [user, load])

  // ===== Dữ liệu suy ra =====
  const allEvents: CalEvent[] = useMemo(() => [
    ...classes.flatMap(c => c.sessions.map(s => ({ kind: 'group' as const, cls: c, session: s }))),
    ...bookings
      .filter(b => b.status !== 'CANCELLED')
      .map(b => ({ kind: 'one' as const, booking: b })),
  ], [classes, bookings])

  const filteredEvents = useMemo(() =>
    allEvents.filter(e => (e.kind === 'group' ? filters.group : filters.one)),
  [allEvents, filters])

  // Phạm vi đang xem
  const weekDays = useMemo(() => {
    const s = weekStartOf(cursor)
    return Array.from({ length: 7 }, (_, i) => addDays(s, i))
  }, [cursor])

  const monthFirst = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor])
  const monthCells = useMemo(() => {
    const s = weekStartOf(monthFirst)
    return Array.from({ length: 42 }, (_, i) => addDays(s, i))
  }, [monthFirst])
  const monthKey = dateKey(monthFirst).slice(0, 7)

  const rangeKeys = useMemo(() => {
    if (mode === 'week') return new Set(weekDays.map(dateKey))
    return new Set(monthCells.filter(d => dateKey(d).slice(0, 7) === monthKey).map(dateKey))
  }, [mode, weekDays, monthCells, monthKey])

  // Thống kê nhanh trong phạm vi đang xem
  const stats = useMemo(() => {
    const inRange = filteredEvents.filter(e => rangeKeys.has(eventDate(e)))
    const active = inRange.filter(e => eventStatus(e) !== 'CANCELLED')
    const completed = active.filter(e => eventStatus(e) === 'COMPLETED')
    const upcoming = active.filter(e => eventStatus(e) !== 'COMPLETED' && !isEventPast(e))
    const hours = active.reduce((s, e) => {
      const [sh, sm] = (e.kind === 'group' ? e.session.startTime : e.booking.startTime).split(':').map(Number)
      const [eh, em] = (e.kind === 'group' ? e.session.endTime : e.booking.endTime).split(':').map(Number)
      return s + (eh * 60 + em - sh * 60 - sm) / 60
    }, 0)
    return { total: active.length, completed: completed.length, upcoming: upcoming.length, hours }
  }, [filteredEvents, rangeKeys])

  // ===== Điều hướng =====
  const label = mode === 'week'
    ? (() => {
        const a = weekDays[0], b = weekDays[6]
        const sameMonth = a.getMonth() === b.getMonth()
        const fmt = (d: Date, withMonth: boolean, withYear = false) =>
          `${String(d.getDate()).padStart(2, '0')}${withMonth ? `/${String(d.getMonth() + 1).padStart(2, '0')}` : ''}${withYear ? `/${d.getFullYear()}` : ''}`
        return sameMonth
          ? `${fmt(a, false)} – ${fmt(b, true, true)}`
          : `${fmt(a, true)} – ${fmt(b, true, true)}`
      })()
    : monthFirst.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })

  const prev = () => setCursor(c => (mode === 'week' ? addDays(c, -7) : addMonths(c, -1)))
  const next = () => setCursor(c => (mode === 'week' ? addDays(c, 7) : addMonths(c, 1)))
  const goToday = () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    setCursor(d)
  }

  // ===== Thao tác từ dialog chi tiết =====
  const confirmBooking = async (b: BookingItem, status: 'CONFIRMED' | 'COMPLETED') => {
    try {
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: b.id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Cập nhật thất bại')
      toast.success(status === 'CONFIRMED' ? 'Đã xác nhận buổi học' : 'Đã đánh dấu hoàn thành')
      setDetailEvent(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const doneAction = () => {
    setDetailEvent(null)
    setAttendanceTarget(null)
    setRescheduleTarget(null)
    setCancelSessionTarget(null)
    setCancelBookingTarget(null)
    load()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72 rounded-xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    )
  }

  if (loadError) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-muted-foreground mb-3">Không tải được lịch dạy. Vui lòng thử lại.</p>
        <Button variant="outline" onClick={() => { setLoading(true); load() }}>
          <RotateCcw className="h-4 w-4 mr-1.5" /> Thử lại
        </Button>
      </Card>
    )
  }

  const todayKey = dateKey(new Date())
  const isCurrentRange = mode === 'week'
    ? weekDays.some(d => dateKey(d) === todayKey)
    : monthKey === todayKey.slice(0, 7)

  const filterChip = (key: 'group' | 'one' | 'avail', dotClass: string, label: string, dashed = false) => (
    <button
      onClick={() => setFilters(f => ({ ...f, [key]: !f[key] }))}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold border transition-all ${
        filters[key]
          ? 'bg-background border-border text-foreground shadow-sm'
          : 'bg-transparent border-transparent text-muted-foreground/60'
      }`}
      title={filters[key] ? `Ẩn ${label}` : `Hiện ${label}`}
    >
      <span className={`h-2 w-2 rounded-full ${dotClass} ${filters[key] ? '' : 'opacity-30'} ${dashed ? 'border border-dashed border-emerald-500 bg-emerald-50' : ''}`} />
      {label}
    </button>
  )

  return (
    <div className="space-y-4">
      {/* ===== Header: tiêu đề + chế độ xem + điều hướng ===== */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" /> Lịch dạy
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Lớp nhóm + buổi 1-1 trên cùng một lịch — bấm vào buổi học để xem chi tiết &amp; thao tác.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Segmented Tuần / Tháng */}
          <div className="inline-flex rounded-full border bg-muted p-0.5">
            {(['week', 'month'] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`h-8 px-4 rounded-full text-xs font-bold transition-all ${
                  mode === m ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'week' ? 'Tuần' : 'Tháng'}
              </button>
            ))}
          </div>
          {/* Điều hướng */}
          <div className="inline-flex items-center gap-1 rounded-full border bg-background p-0.5 shadow-sm">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={prev} aria-label={mode === 'week' ? 'Tuần trước' : 'Tháng trước'}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[130px] text-center text-sm font-bold capitalize px-1">{label}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={next} aria-label={mode === 'week' ? 'Tuần sau' : 'Tháng sau'}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant={isCurrentRange ? 'secondary' : 'default'}
              size="sm"
              className="h-8 rounded-full text-xs font-bold px-3"
              onClick={goToday}
            >
              Hôm nay
            </Button>
          </div>
        </div>
      </div>

      {/* ===== Bộ lọc + nút chỉnh giờ trống ===== */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Hiện thị:</span>
          {filterChip('group', 'bg-violet-600', 'Lớp nhóm')}
          {filterChip('one', 'bg-blue-600', 'Lớp 1-1')}
          {mode === 'week' && filterChip('avail', 'bg-emerald-50', 'Giờ trống 1-1', true)}
        </div>
        <Button
          variant="outline"
          className="rounded-full font-semibold"
          onClick={() => setAvailOpen(true)}
          title="Chỉnh lưới giờ trống nhận lớp 1-1"
        >
          <Clock3 className="h-4 w-4 mr-1.5" /> Giờ trống 1-1
          <span className="ml-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5">
            {availability.length}
          </span>
        </Button>
      </div>

      {/* ===== Thống kê nhanh phạm vi đang xem ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[
          { icon: CalendarDays, label: mode === 'week' ? 'Buổi trong tuần' : 'Buổi trong tháng', value: stats.total, cls: 'text-foreground' },
          { icon: CalendarCheck, label: 'Đã hoàn thành', value: stats.completed, cls: 'text-emerald-600' },
          { icon: CalendarClock, label: 'Sắp diễn ra', value: stats.upcoming, cls: 'text-blue-600' },
          { icon: Clock3, label: 'Giờ dạy', value: stats.hours > 0 ? stats.hours.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '0', cls: 'text-violet-600' },
        ].map(s => (
          <Card key={s.label} className="p-3 flex items-center gap-2.5 rounded-xl">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className={`text-lg font-extrabold leading-none ${s.cls}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* ===== Lịch ===== */}
      <Card className="p-3 md:p-4 rounded-2xl">
        {mode === 'week' ? (
          <WeekView
            days={weekDays}
            events={filteredEvents}
            availability={availability}
            showAvailability={filters.avail}
            onEventClick={setDetailEvent}
          />
        ) : (
          <MonthView
            cells={monthCells}
            monthKey={monthKey}
            events={filteredEvents}
            onEventClick={setDetailEvent}
            onDayClick={d => {
              setMode('week')
              const x = new Date(d)
              x.setHours(0, 0, 0, 0)
              setCursor(x)
            }}
          />
        )}

        {stats.total === 0 && (
          <div className="mt-3 rounded-xl border border-dashed p-4 text-center">
            <Sparkles className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" />
            <p className="text-sm font-semibold">
              {mode === 'week' ? 'Tuần này chưa có buổi học nào' : 'Tháng này chưa có buổi học nào'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Chuyển tuần khác, hoặc{' '}
              <button className="text-primary font-semibold underline underline-offset-2" onClick={() => navigate({ name: 'dashboard', tab: 'classes' })}>
                mở lớp học cố định
              </button>{' '}
              /{' '}
              <button className="text-primary font-semibold underline underline-offset-2" onClick={() => setAvailOpen(true)}>
                mở giờ trống 1-1
              </button>{' '}
              để nhận học sinh.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 mt-3 pt-2.5 border-t text-[10px] text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-600" /> Lớp nhóm</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> 1-1 đã xác nhận</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> 1-1 chờ xác nhận</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Hoàn thành</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Đã nghỉ / hủy</span>
        </div>
      </Card>

      {/* ===== Các dialog ===== */}
      <EventDetailDialog
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onAttendance={t => { setDetailEvent(null); setAttendanceTarget(t) }}
        onReschedule={t => { setDetailEvent(null); setRescheduleTarget(t) }}
        onCancelSession={t => { setDetailEvent(null); setCancelSessionTarget(t) }}
        onConfirmBooking={b => confirmBooking(b, 'CONFIRMED')}
        onCompleteBooking={b => confirmBooking(b, 'COMPLETED')}
        onCancelBooking={b => { setDetailEvent(null); setCancelBookingTarget(b) }}
        onOpenClassesTab={() => navigate({ name: 'dashboard', tab: 'classes' })}
      />

      <AttendanceDialog target={attendanceTarget} onClose={() => setAttendanceTarget(null)} onDone={doneAction} />
      <RescheduleDialog target={rescheduleTarget} onClose={() => setRescheduleTarget(null)} onDone={doneAction} />
      <CancelSessionDialog target={cancelSessionTarget} onClose={() => setCancelSessionTarget(null)} onDone={doneAction} />
      <CancelBookingDialog target={cancelBookingTarget} onClose={() => setCancelBookingTarget(null)} onDone={doneAction} />

      <AvailabilityDialog
        open={availOpen}
        onOpenChange={setAvailOpen}
        onChanged={() => {
          fetch('/api/tutors/me/availability')
            .then(r => r.json())
            .then(d => setAvailability(d.availability || []))
            .catch(() => {})
        }}
      />
    </div>
  )
}
