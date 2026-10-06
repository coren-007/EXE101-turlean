'use client'

import { useEffect, useState } from 'react'
import {
  CalEvent, AvailabilitySlot, eventTitle, eventSubtitle, eventStart, eventEnd,
  eventDate, eventBlockClass, eventStatus, toMinutes, dateKey, VN_DAY_SHORT,
} from './schedule-shared'

const HOUR_H = 52 // px cho 1 giờ

interface Placed {
  ev: CalEvent
  top: number
  height: number
  col: number
  cols: number
}

// Xếp cột cho các block chồng lấn trong 1 ngày (kiểu Google Calendar)
function layoutDay(evs: CalEvent[], startMin: number): Placed[] {
  const raw = evs
    .map(ev => {
      const top = ((toMinutes(eventStart(ev)) - startMin) / 60) * HOUR_H
      const h = Math.max(((toMinutes(eventEnd(ev)) - toMinutes(eventStart(ev))) / 60) * HOUR_H - 2, 24)
      return { ev, top, height: h }
    })
    .sort((a, b) => a.top - b.top || b.height - a.height)

  // Gom cụm chồng lấn nối tiếp transitively
  const clusters: { items: typeof raw }[] = []
  let cur: typeof raw = []
  let curEnd = -1
  for (const it of raw) {
    if (cur.length && it.top >= curEnd) {
      clusters.push({ items: cur })
      cur = []
      curEnd = -1
    }
    cur.push(it)
    curEnd = Math.max(curEnd, it.top + it.height)
  }
  if (cur.length) clusters.push({ items: cur })

  const placed: Placed[] = []
  for (const { items } of clusters) {
    const colEnds: number[] = []
    for (const it of items) {
      let col = colEnds.findIndex(end => end <= it.top + 0.01)
      if (col === -1) {
        col = colEnds.length
        colEnds.push(0)
      }
      colEnds[col] = it.top + it.height
      placed.push({ ...it, col, cols: 1 })
    }
    const maxCol = Math.max(...placed.slice(-items.length).map(p => p.col)) + 1
    for (let i = placed.length - items.length; i < placed.length; i++) {
      placed[i].cols = maxCol
    }
  }
  return placed
}

interface WeekViewProps {
  days: Date[]
  events: CalEvent[]
  availability: AvailabilitySlot[]
  showAvailability: boolean
  onEventClick: (e: CalEvent) => void
  /** Nhãn block buổi 1-1: 'student' (gia sư xem) | 'subject' (học sinh tự xem) */
  oneLabel?: 'student' | 'subject'
}

/**
 * Lịch tuần dạng lưới giờ — mỗi buổi học là 1 block click được để xem chi tiết.
 * Giờ trống 1-1 hiển thị nền gạch đứt phía sau (bật/tắt được).
 */
export function WeekView({ days, events, availability, showAvailability, onEventClick, oneLabel = 'student' }: WeekViewProps) {
  const [nowMin, setNowMin] = useState<number>(() =>
    new Date().getHours() * 60 + new Date().getMinutes(),
  )

  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date()
      setNowMin(d.getHours() * 60 + d.getMinutes())
    }, 60_000)
    return () => clearInterval(t)
  }, [])

  const keys = days.map(dateKey)
  const todayKey = dateKey(new Date())

  // Khung giờ hiển thị: mặc định 06:00–22:00, mở rộng nếu có sự kiện ngoài
  let startMin = 6 * 60
  let endMin = 22 * 60
  const inWeek = events.filter(e => keys.includes(eventDate(e)))
  for (const e of inWeek) {
    startMin = Math.min(startMin, toMinutes(eventStart(e)))
    endMin = Math.max(endMin, toMinutes(eventEnd(e)))
  }
  if (showAvailability) {
    for (const a of availability) {
      startMin = Math.min(startMin, toMinutes(a.startTime))
      endMin = Math.max(endMin, toMinutes(a.endTime))
    }
  }
  startMin = Math.max(0, Math.floor(startMin / 60) * 60)
  endMin = Math.min(24 * 60, Math.ceil(endMin / 60) * 60)

  const startHour = startMin / 60
  const endHour = endMin / 60
  const hours: number[] = []
  for (let h = startHour; h <= endHour; h++) hours.push(h)
  const totalH = (endHour - startHour) * HOUR_H

  return (
    <div className="overflow-x-auto scroll-area">
      <div className="min-w-[860px]">
        {/* Header ngày */}
        <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))]">
          <div />
          {days.map(d => {
            const key = dateKey(d)
            const isToday = key === todayKey
            const count = inWeek.filter(e => eventDate(e) === key && eventStatus(e) !== 'CANCELLED').length
            return (
              <div
                key={key}
                className={`text-center pb-2 pt-1 rounded-t-xl ${isToday ? 'bg-primary/[0.06]' : ''}`}
              >
                <p className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {VN_DAY_SHORT[d.getDay()]}
                </p>
                <p className={`text-sm font-extrabold leading-tight ${isToday ? 'text-primary' : ''}`}>
                  {String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}
                </p>
                {count > 0 && (
                  <p className="text-[9px] text-muted-foreground">{count} buổi</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Thân lưới giờ */}
        <div className="flex border-t border-b border-border rounded-b-xl">
          {/* Cột trục giờ */}
          <div className="relative w-[44px] shrink-0 border-r border-border" style={{ height: totalH }}>
            {hours.map(h => (
              <div
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] font-medium text-muted-foreground tabular-nums"
                style={{ top: (h - startHour) * HOUR_H }}
              >
                {h % 2 === 0 ? `${String(h).padStart(2, '0')}:00` : ''}
              </div>
            ))}
          </div>

          {/* 7 cột ngày */}
          {days.map(d => {
            const key = dateKey(d)
            const isToday = key === todayKey
            const dayEvents = inWeek.filter(e => eventDate(e) === key)
            const placed = layoutDay(dayEvents, startMin)
            const dayAvail = showAvailability
              ? availability.filter(a => a.dayOfWeek === d.getDay())
              : []
            const nowY = ((nowMin - startMin) / 60) * HOUR_H

            return (
              <div
                key={key}
                className={`relative flex-1 min-w-0 border-r last:border-r-0 border-border/60 ${isToday ? 'bg-primary/[0.04]' : ''}`}
                style={{ height: totalH }}
              >
                {/* Vạch giờ */}
                {hours.map(h => (
                  <div key={h} className="absolute inset-x-0 border-t border-border/40" style={{ top: (h - startHour) * HOUR_H }} />
                ))}

                {/* Nền giờ trống 1-1 (template tuần) */}
                {dayAvail.map(a => {
                  const top = ((toMinutes(a.startTime) - startMin) / 60) * HOUR_H
                  const h = Math.max(((toMinutes(a.endTime) - toMinutes(a.startTime)) / 60) * HOUR_H - 2, 16)
                  return (
                    <div
                      key={a.id}
                      className="absolute inset-x-0.5 rounded-lg border border-dashed border-emerald-400/60 bg-emerald-50/70"
                      style={{ top, height: h, zIndex: 0 }}
                      title={`Giờ trống 1-1: ${a.startTime}–${a.endTime}`}
                    />
                  )
                })}

                {/* Block sự kiện */}
                {placed.map(({ ev, top, height, col, cols }) => {
                  const w = 100 / cols
                  const cancelled = eventStatus(ev) === 'CANCELLED'
                  const showSub = height >= 64
                  return (
                    <button
                      key={ev.kind === 'group' ? ev.session.id : ev.booking.id}
                      onClick={() => onEventClick(ev)}
                      className={`absolute overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left shadow-sm transition-all hover:shadow-md hover:z-20 focus:outline-none focus:ring-2 focus:ring-ring ${eventBlockClass(ev)} ${cancelled ? 'opacity-70' : ''}`}
                      style={{
                        top,
                        height,
                        left: `calc(${col * w}% + 2px)`,
                        width: `calc(${w}% - 4px)`,
                        zIndex: 10,
                      }}
                      title={`${eventTitle(ev)} · ${eventStart(ev)}–${eventEnd(ev)}`}
                    >
                      <p className="text-[10px] font-bold leading-tight tabular-nums truncate">
                        {eventStart(ev)}–{eventEnd(ev)}
                        {cancelled && <span className="ml-1 font-semibold">(nghỉ)</span>}
                      </p>
                      <p className={`text-[10px] font-semibold leading-tight ${height >= 64 ? 'line-clamp-2' : 'truncate'} ${cancelled ? 'line-through' : ''}`}>
                        {ev.kind === 'group'
                          ? ev.cls.title
                          : oneLabel === 'subject'
                            ? ev.booking.subject.name
                            : ev.booking.student.name}
                      </p>
                      {showSub && (
                        <p className="text-[9px] leading-tight truncate opacity-85">
                          {eventSubtitle(ev)}
                        </p>
                      )}
                    </button>
                  )
                })}

                {/* Vạch thời gian hiện tại */}
                {isToday && nowMin >= startMin && nowMin <= endMin && (
                  <div
                    className="absolute inset-x-0 flex items-center pointer-events-none"
                    style={{ top: nowY, zIndex: 15 }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0 -ml-[3px]" />
                    <span className="h-[2px] flex-1 bg-rose-500" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
