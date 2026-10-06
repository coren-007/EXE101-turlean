'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { GraduationCap, Users, CalendarClock } from 'lucide-react'
import { TutorClassesPanel } from './tutor-classes-panel'
import { TutorOneToOnePanel } from './tutor-1x1-panel'

type SubTab = 'fixed' | 'oneToOne'

/**
 * "Quản lý lớp học" của gia sư — kiểu hệ thống trường đại học: một nơi duy nhất
 * gom 2 loại lớp:
 *  - Lớp học cố định (nhóm): lịch tuần cố định tại nhà gia sư, sĩ số, duyệt đơn
 *  - Lớp theo lịch dạy (1-1): phụ huynh đặt từng buổi trong giờ trống, quản lý theo học sinh
 */
export function TutorClassManager() {
  const { user } = useApp()
  const [sub, setSub] = useState<SubTab>('fixed')

  // Badge số yêu cầu chờ cho từng sub-tab
  const [fixedPending, setFixedPending] = useState(0)
  const [oneToOnePending, setOneToOnePending] = useState(0)

  useEffect(() => {
    if (user?.role !== 'TUTOR') return
    fetch('/api/classes/mine')
      .then(r => r.json())
      .then(d => {
        const pending = (d.classes || []).reduce(
          (s: number, c: any) => s + c.enrollments.filter((e: any) => e.status === 'PENDING').length, 0,
        )
        setFixedPending(pending)
      })
      .catch(() => {})
    fetch('/api/bookings?role=tutor')
      .then(r => r.json())
      .then(d => {
        const today = new Date()
        const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const pending = (d.bookings || []).filter(
          (b: any) => b.status === 'PENDING' ||
            (b.status === 'CONFIRMED' && b.date >= key),
        ).length
        setOneToOnePending(pending)
      })
      .catch(() => {})
  }, [user])

  const tabs: { id: SubTab; label: string; icon: typeof GraduationCap; badge: number }[] = [
    { id: 'fixed', label: 'Lớp học cố định', icon: GraduationCap, badge: fixedPending },
    { id: 'oneToOne', label: 'Lớp theo lịch dạy (1-1)', icon: Users, badge: oneToOnePending },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" /> Quản lý lớp học
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Toàn bộ lớp của bạn ở một nơi — lớp nhóm cố định theo lịch tuần và các buổi 1-1
          phụ huynh đặt theo giờ trống.
        </p>
      </div>

      {/* Sub-tab chuyển giữa 2 loại lớp */}
      <div className="inline-flex rounded-full bg-muted p-1 gap-1 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all relative ${
              sub === t.id ? 'bg-primary text-primary-foreground shadow-e1' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.badge > 0 && (
                <span className={`h-4 min-w-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  sub === t.id ? 'bg-white/25 text-white' : 'bg-primary text-primary-foreground'
                }`}>
                  {t.badge}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {sub === 'fixed' ? <TutorClassesPanel /> : <TutorOneToOnePanel />}
    </div>
  )
}
