'use client'

import {
  CalEvent, HolidayItem, eventTitle, eventStart, eventDotClass, eventDate, dateKey,
} from './schedule-shared'

interface MonthViewProps {
  cells: Date[] // 42 ngày (6 tuần, Thứ 2 → Chủ nhật)
  monthKey: string // YYYY-MM của tháng đang xem
  events: CalEvent[]
  onEventClick: (e: CalEvent) => void
  onDayClick: (d: Date) => void
  /** Ngày nghỉ lễ — tô đỏ ngày + hiện tên lễ nhỏ */
  holidays?: HolidayItem[]
}

/**
 * Lịch tháng 6 tuần: mỗi ô là 1 ngày, mỗi buổi học là 1 chip màu click được.
 * Bấm vào ô trống để mở lịch tuần của ngày đó.
 */
export function MonthView({ cells, monthKey, events, onEventClick, onDayClick, holidays }: MonthViewProps) {
  const todayKey = dateKey(new Date())
  const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

  return (
    <div>
      <div className="grid grid-cols-7 border-t border-r border-border rounded-t-xl overflow-hidden">
        {dayNames.map(n => (
          <div key={n} className="py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-l border-border bg-muted/40">
            {n}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-r border-b border-border rounded-b-xl overflow-hidden">
        {cells.map(d => {
          const key = dateKey(d)
          const inMonth = key.slice(0, 7) === monthKey
          const isToday = key === todayKey
          const dayEvents = events
            .filter(e => eventDate(e) === key)
            .sort((a, b) => eventStart(a).localeCompare(eventStart(b)))
          const visible = dayEvents.slice(0, 3)
          const more = dayEvents.length - visible.length
          const holiday = holidays?.find(h => h.date === key)

          return (
            <button
              key={key}
              onClick={() => onDayClick(d)}
              className={`min-h-[104px] border-l border-t border-border text-left p-1.5 align-top transition-colors hover:bg-primary/[0.04] focus:outline-none focus-visible:bg-primary/[0.06] ${
                !inMonth ? 'bg-muted/30' : isToday ? 'bg-primary/[0.06]' : 'bg-background'
              }`}
            >
              <p className={`text-xs font-bold mb-1 ${!inMonth ? 'text-muted-foreground/50' : isToday ? 'text-primary' : ''}`}>
                {String(d.getDate()).padStart(2, '0')}
              </p>
              {holiday && (
                <p className="text-[9px] text-rose-600 font-semibold truncate" title={`Ngày nghỉ lễ: ${holiday.name}`}>
                  {holiday.name}
                </p>
              )}
              <div className="space-y-0.5">
                {visible.map(e => {
                  const id = e.kind === 'group' ? e.session.id : e.booking.id
                  const cancelled = (e.kind === 'group' ? e.session.status : e.booking.status) === 'CANCELLED'
                  return (
                    <span
                      key={id}
                      role="button"
                      tabIndex={0}
                      onClick={ev => { ev.stopPropagation(); onEventClick(e) }}
                      onKeyDown={ev => { if (ev.key === 'Enter') { ev.stopPropagation(); onEventClick(e) } }}
                      className="flex items-center gap-1 rounded px-1 py-[1px] text-[10px] leading-tight hover:bg-muted transition-colors cursor-pointer"
                      title={`${eventStart(e)} · ${eventTitle(e)}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${eventDotClass(e)}`} />
                      <span className={`truncate ${cancelled ? 'line-through text-muted-foreground' : ''}`}>
                        <span className="font-semibold tabular-nums">{eventStart(e)}</span>{' '}
                        {e.kind === 'group' ? e.cls.title : e.booking.student.name}
                        {e.kind === 'group' && e.session.makeupForId && <span className="font-semibold"> (bù)</span>}
                      </span>
                    </span>
                  )
                })}
                {more > 0 && (
                  <span className="block px-1 text-[10px] font-semibold text-primary">
                    +{more} buổi nữa
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
