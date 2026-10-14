'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CalendarDays, ChevronLeft, ChevronRight, CalendarCheck, CalendarClock,
  Clock3, Sparkles, RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CalEvent, GroupClass, BookingItem, ClassSessionItem, HolidayItem,
  dateKey, weekStartOf, addDays, addMonths, eventDate, eventStatus,
  isEventPast,
} from './schedule-shared'
import { WeekView } from './week-view'
import { MonthView } from './month-view'
import { StudentEventDetailDialog } from './student-event-detail-dialog'

type ViewMode = 'week' | 'month'

// ===== Dữ liệu từ /api/enrollments/mine (chỉ lấy field cần cho lịch) =====
interface MyEnrollmentLite {
  id: string
  status: string
  class: {
    id: string
    title: string
    subject: { id: string; name: string }
    gradeLevel: string | null
    meetingType: string
    address: string | null
    monthlyFee: number | null
    status: string
    schedule: { dayOfWeek: number; startTime: string; endTime: string }[]
    sessions: { id: string; date: string; startTime: string; endTime: string; status: string; note?: string | null; makeupForId?: string | null }[]
    tutor: { id: string; name: string; avatar?: string | null; profession?: string | null }
  }
  attendance?: { history: { id: string; status: string | null }[] }
}

/**
 * "Lịch học" của phụ huynh/học sinh — calendar tương tác như phía gia sư:
 *  · Xem theo TUẦN (lưới giờ) hoặc THÁNG (lưới ngày), điều hướng tự do
 *  · Hợp nhất buổi lớp nhóm đã vào lớp + buổi 1-1 trên cùng 1 lịch
 *  · Bấm vào buổi học → dialog chi tiết (lớp, gia sư, điểm danh của mình)
 */
export function StudentScheduleCalendar() {
  const { user, navigate } = useApp()

  const [enrollments, setEnrollments] = useState<MyEnrollmentLite[]>([])
  const [bookings, setBookings] = useState<BookingItem[]>([])
  const [holidays, setHolidays] = useState<HolidayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [mode, setMode] = useState<ViewMode>('week')
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [filters, setFilters] = useState({ group: true, one: true })

  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const [enrollData, bookingData, holidayData] = await Promise.all([
        fetch('/api/enrollments/mine').then(r => r.json()),
        fetch('/api/bookings?role=student').then(r => r.json()),
        fetch('/api/holidays').then(r => r.json()).catch(() => ({ holidays: [] })),
      ])
      if (enrollData?.error || bookingData?.error) throw new Error('load-failed')
      setEnrollments(enrollData.enrollments || [])
      setBookings(bookingData.bookings || [])
      setHolidays(holidayData.holidays || [])
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user?.role === 'STUDENT') load()
    else if (user) setLoading(false)
  }, [user, load])

  // ===== Map dữ liệu học sinh → CalEvent (tái dùng WeekView/MonthView) =====
  const { groupClasses, myAttendance } = useMemo(() => {
    const classes: GroupClass[] = []
    const att = new Map<string, string | null>() // sessionId → PRESENT/ABSENT/null
    for (const e of enrollments) {
      if (e.status !== 'APPROVED') continue // chỉ buổi của lớp đã vào lớp
      const cls = e.class
      const sessions: ClassSessionItem[] = (cls.sessions ?? []).map(s => ({
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        note: s.note ?? null,
        makeupForId: s.makeupForId ?? null,
        attendance: [],
      }))
      classes.push({
        id: cls.id,
        title: cls.title,
        subject: cls.subject,
        gradeLevel: cls.gradeLevel,
        description: null,
        meetingType: cls.meetingType,
        address: cls.address,
        capacity: 0,
        monthlyFee: cls.monthlyFee,
        status: cls.status,
        startDate: null,
        schedule: cls.schedule,
        tutor: cls.tutor,
        enrollments: [],
        sessions,
        stats: { upcomingCount: 0, nextSession: null, completedCount: 0, cancelledCount: 0 },
      })
      for (const h of e.attendance?.history ?? []) {
        att.set(h.id, h.status)
      }
    }
    return { groupClasses: classes, myAttendance: att }
  }, [enrollments])

  const allEvents: CalEvent[] = useMemo(() => [
    ...groupClasses.flatMap(c => c.sessions.map(s => ({ kind: 'group' as const, cls: c, session: s }))),
    ...bookings
      .filter(b => b.status !== 'CANCELLED')
      .map(b => ({ kind: 'one' as const, booking: b })),
  ], [groupClasses, bookings])

  const filteredEvents = useMemo(() =>
    allEvents.filter(e => (e.kind === 'group' ? filters.group : filters.one)),
  [allEvents, filters])

  // ===== Phạm vi đang xem =====
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

  // ===== Mở hội thoại với gia sư =====
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

  if (loading) {
    return (
      <div className="mb-6 space-y-4">
        <Skeleton className="h-12 w-72 rounded-xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    )
  }

  if (loadError) {
    return (
      <Card className="mb-6 p-10 text-center">
        <p className="text-sm text-muted-foreground mb-3">Không tải được lịch học. Vui lòng thử lại.</p>
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

  const filterChip = (key: 'group' | 'one', dotClass: string, label: string) => (
    <button
      onClick={() => setFilters(f => ({ ...f, [key]: !f[key] }))}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold border transition-all ${
        filters[key]
          ? 'bg-background border-border text-foreground shadow-sm'
          : 'bg-transparent border-transparent text-muted-foreground/60'
      }`}
      title={filters[key] ? `Ẩn ${label}` : `Hiện ${label}`}
    >
      <span className={`h-2 w-2 rounded-full ${dotClass} ${filters[key] ? '' : 'opacity-30'}`} />
      {label}
    </button>
  )

  return (
    <div className="mb-6 space-y-4">
      {/* ===== Header: tiêu đề + chế độ xem + điều hướng ===== */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" /> Lịch học của bạn
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Lớp nhóm + buổi 1-1 trên cùng một lịch — bấm vào buổi học để xem chi tiết.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* ===== Bộ lọc ===== */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Hiện thị:</span>
        {filterChip('group', 'bg-violet-600', 'Lớp nhóm')}
        {filterChip('one', 'bg-blue-600', 'Lớp 1-1')}
      </div>

      {/* ===== Thống kê nhanh ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[
          { icon: CalendarDays, label: mode === 'week' ? 'Buổi trong tuần' : 'Buổi trong tháng', value: stats.total, cls: 'text-foreground' },
          { icon: CalendarCheck, label: 'Đã hoàn thành', value: stats.completed, cls: 'text-emerald-600' },
          { icon: CalendarClock, label: 'Sắp diễn ra', value: stats.upcoming, cls: 'text-blue-600' },
          { icon: Clock3, label: 'Giờ học', value: stats.hours > 0 ? stats.hours.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '0', cls: 'text-violet-600' },
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
            availability={[]}
            showAvailability={false}
            oneLabel="subject"
            onEventClick={setDetailEvent}
            holidays={holidays}
          />
        ) : (
          <MonthView
            cells={monthCells}
            monthKey={monthKey}
            events={filteredEvents}
            onEventClick={setDetailEvent}
            holidays={holidays}
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
              {allEvents.length === 0
                ? 'Đăng ký lớp học cố định hoặc đặt buổi 1-1 để lịch hiện ở đây.'
                : 'Chuyển tuần khác để xem các buổi học khác.'}
            </p>
            {allEvents.length === 0 && (
              <Button size="sm" className="mt-2.5 rounded-full" onClick={() => navigate({ name: 'search' })}>
                Tìm gia sư & lớp học
              </Button>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 mt-3 pt-2.5 border-t text-[10px] text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-600" /> Lớp nhóm</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> 1-1 đã xác nhận</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> 1-1 chờ xác nhận</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Đã hoàn thành</span>
        </div>
      </Card>

      {/* ===== Dialog chi tiết buổi học ===== */}
      <StudentEventDetailDialog
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        myAttendance={
          detailEvent?.kind === 'group' ? myAttendance.get(detailEvent.session.id) ?? null : null
        }
        onOpenTutor={(tutorId) => navigate({ name: 'tutor', id: tutorId })}
        onChat={openChat}
      />
    </div>
  )
}
