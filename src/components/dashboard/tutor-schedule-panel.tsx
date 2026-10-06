'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import {
  Plus, Calendar, Clock, Trash2, CheckCircle2, CalendarCheck, MousePointerClick,
} from 'lucide-react'
import { toast } from 'sonner'

const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const DAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
// Thứ tự hiển thị: Thứ 2 → Chủ nhật
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const TIME_PRESETS = ['06:00', '08:00', '10:00', '14:00', '16:00', '18:00', '20:00']

interface Slot {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
}

/**
 * Panel "Lịch dạy hàng tuần" trong Tutor Studio — lưới giờ trống nhận lớp 1-1.
 * Bấm ô lưới để bật/tắt slot 2 tiếng, hoặc thêm slot tùy chỉnh bằng dialog.
 * Lớp nhóm theo lịch tuần cố định xin dùng tab "Lớp học" (mục Lớp học cố định).
 */
export function TutorSchedulePanel() {
  const { user, navigate } = useApp()
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [day, setDay] = useState(1)
  const [startTime, setStartTime] = useState('18:00')
  const [endTime, setEndTime] = useState('20:00')

  const load = async () => {
    const data = await fetch('/api/tutors/me/availability').then(r => r.json())
    setSlots(data.availability || [])
    setLoading(false)
  }

  useEffect(() => {
    if (user?.role === 'TUTOR') load()
  }, [user])

  // Bấm ô lưới: có slot khớp giờ bắt đầu → xóa, chưa có → thêm slot 2 tiếng
  const toggleCell = async (dayOfWeek: number, startTime: string) => {
    const existing = slots.find(
      s => s.dayOfWeek === dayOfWeek && s.startTime === startTime,
    )
    try {
      if (existing) {
        const res = await fetch(`/api/tutors/me/availability/${existing.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setSlots(prev => prev.filter(s => s.id !== existing.id))
      } else {
        const startH = parseInt(startTime.split(':')[0])
        const endH = Math.min(startH + 2, 23)
        const body = {
          dayOfWeek,
          startTime,
          endTime: `${String(endH).padStart(2, '0')}:00`,
        }
        const res = await fetch('/api/tutors/me/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        // API trả về object slot trực tiếp (không bọc trong { availability })
        setSlots(prev => [...prev, data])
      }
    } catch (e: any) {
      toast.error(e.message || 'Cập nhật lịch thất bại')
      load()
    }
  }

  const handleAddCustom = async () => {
    if (startTime >= endTime) {
      toast.error('Giờ bắt đầu phải trước giờ kết thúc')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/tutors/me/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayOfWeek: day, startTime, endTime }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Đã thêm giờ trống ${DAY_NAMES[day]} ${startTime}–${endTime}`)
      setAddOpen(false)
      // API trả về object slot trực tiếp (không bọc trong { availability })
      setSlots(prev => [...prev, data])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (slot: Slot) => {
    try {
      await fetch(`/api/tutors/me/availability/${slot.id}`, { method: 'DELETE' })
      setSlots(prev => prev.filter(s => s.id !== slot.id))
      toast.success(`Đã xóa giờ trống ${DAY_NAMES[slot.dayOfWeek]} ${slot.startTime}–${slot.endTime}`)
    } catch {
      toast.error('Xóa thất bại')
    }
  }

  // Nhóm theo ngày (hiển thị dạng chip)
  const byDay: Record<number, Slot[]> = {}
  slots.forEach(s => {
    if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = []
    byDay[s.dayOfWeek].push(s)
  })

  if (loading) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Đang tải lịch dạy...</Card>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" /> Lịch dạy hàng tuần
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Đánh dấu giờ trống để nhận lớp 1-1 mới — phụ huynh chỉ đặt được trong các khung này.
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-full font-semibold"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" /> Khung giờ tùy chỉnh
        </Button>
      </div>

      {/* Lưới lịch tuần — bấm để bật/tắt giờ trống */}
      <Card className="p-4 md:p-5 rounded-2xl">
        <div className="overflow-x-auto scroll-area">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-8 gap-1.5 mb-1.5">
              <div className="text-[10px] text-muted-foreground text-center flex items-center justify-center">Giờ</div>
              {DAY_ORDER.map(d => (
                <div key={d} className={`text-center text-[11px] font-bold py-1 rounded-lg ${d === (new Date().getDay()) ? 'text-primary' : ''}`}>
                  {DAY_SHORT[d]}
                </div>
              ))}
            </div>
            {TIME_PRESETS.map(t => (
              <div key={t} className="grid grid-cols-8 gap-1.5 mb-1.5">
                <div className="text-[11px] text-muted-foreground flex items-center justify-center font-medium">
                  {t}
                </div>
                {DAY_ORDER.map(dayIdx => {
                  const active = slots.some(
                    s => s.dayOfWeek === dayIdx && s.startTime === t,
                  )
                  return (
                    <button
                      key={dayIdx}
                      onClick={() => toggleCell(dayIdx, t)}
                      className={`h-10 rounded-xl text-[10px] font-bold transition-all ${
                        active
                          ? 'bg-primary text-primary-foreground shadow-e1 hover:bg-primary/90'
                          : 'bg-muted/70 hover:bg-primary/10 text-muted-foreground'
                      }`}
                      title={
                        active
                          ? `Giờ trống ${DAY_NAMES[dayIdx]} ${t} — bấm để xóa`
                          : `Bấm để thêm ${DAY_NAMES[dayIdx]} ${t}`
                      }
                    >
                      {active ? <CheckCircle2 className="h-4 w-4 mx-auto" /> : '+'}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground flex-wrap">
          <MousePointerClick className="h-3.5 w-3.5" />
          <span>
            Đang mở <span className="font-bold text-foreground">{slots.length}</span> giờ trống/tuần.
            Muốn giờ bất thường (vd 19:00–21:00)? Dùng <span className="font-semibold">Khung giờ tùy chỉnh</span>.
          </span>
        </div>
      </Card>

      {/* Tổng hợp theo ngày */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {DAY_ORDER.map(dayIdx => {
          const daySlots = (byDay[dayIdx] || []).sort((a, b) => a.startTime.localeCompare(b.startTime))
          return (
            <Card key={dayIdx} className={`p-4 rounded-2xl ${daySlots.length > 0 ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" /> {DAY_NAMES[dayIdx]}
                </h3>
                <Badge variant={daySlots.length > 0 ? 'default' : 'outline'} className="text-[10px] rounded-full">
                  {daySlots.length > 0 ? `${daySlots.length} khung giờ` : 'Trống'}
                </Badge>
              </div>
              {daySlots.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {daySlots.map(s => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-semibold group bg-muted/70"
                    >
                      <Clock className="h-3 w-3 text-primary" />
                      {s.startTime}–{s.endTime}
                      <button
                        onClick={() => handleDelete(s)}
                        className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title={`Xóa ${s.startTime}–${s.endTime}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Bấm ô ở lưới trên để mở khung giờ</p>
              )}
            </Card>
          )
        })}
      </div>

      {/* Gợi ý mở lớp nhóm ngay trên nền tảng */}
      <Card className="p-4 rounded-2xl border-primary/25 bg-primary/[0.04] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Dạy lớp nhóm tại nhà bạn?</p>
            <p className="text-xs text-muted-foreground">
              Mở <b>Lớp học cố định</b> (vd Toán 10: T3 &amp; T5, 18:00–20:30) — phụ huynh thấy lịch,
              sĩ số còn trống và đăng ký cho bạn duyệt.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="rounded-full shrink-0"
          onClick={() => navigate({ name: 'dashboard', tab: 'classes' })}
        >
          Mở lớp học
        </Button>
      </Card>

      {/* Dialog khung giờ tùy chỉnh */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm khung giờ tùy chỉnh</DialogTitle>
            <DialogDescription>Khung giờ bất kỳ, ví dụ 19:00 – 21:00 tối thứ 4.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Thứ</Label>
              <select
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
              >
                {DAY_ORDER.map(d => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Bắt đầu</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Kết thúc</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            Học sinh có thể đặt lịch 1-1 trong khung giờ này. Muốn mở lớp nhóm cố định?
            Dùng tab <span className="font-semibold">Lớp học</span>.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Đóng</Button>
            <Button onClick={handleAddCustom} disabled={saving}>
              {saving ? 'Đang thêm...' : 'Thêm khung giờ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
