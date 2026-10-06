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
  Lock, Info
} from 'lucide-react'
import { toast } from 'sonner'

const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const DAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
// Thứ tự hiển thị: Thứ 2 → Chủ nhật
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const TIME_PRESETS = ['06:00', '08:00', '10:00', '14:00', '16:00', '18:00', '20:00']

type SlotKind = 'FREE' | 'FIXED'

interface Slot {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  kind?: string
}

const isFixed = (s: Slot) => s.kind === 'FIXED'

/**
 * Panel "Lịch dạy hàng tuần" trong Trang quản lý gia sư.
 * Hai chế độ:
 *  - FREE: giờ trống — học sinh đặt được lịch trong các khung này
 *  - FIXED: lịch dạy cố định gia sư đã có (dạy tại trường/trung tâm/lớp cũ)
 *    → hiển thị công khai trên hồ sơ "Đã có lớp cố định", không nhận thêm lớp.
 * Bấm ô lưới để bật/tắt slot 2 tiếng, hoặc thêm slot tùy chỉnh bằng dialog.
 */
export function TutorSchedulePanel() {
  const { user } = useApp()
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // Chế độ đang chỉnh: 'FREE' (giờ trống) hay 'FIXED' (lịch dạy cố định)
  const [mode, setMode] = useState<SlotKind>('FREE')

  const [day, setDay] = useState(1)
  const [startTime, setStartTime] = useState('18:00')
  const [endTime, setEndTime] = useState('20:00')
  const [customKind, setCustomKind] = useState<SlotKind>('FREE')

  const load = async () => {
    const data = await fetch('/api/tutors/me/availability').then(r => r.json())
    setSlots(data.availability || [])
    setLoading(false)
  }

  useEffect(() => {
    if (user?.role === 'TUTOR') load()
  }, [user])

  // Bấm ô lưới ở chế độ hiện tại:
  //  - slot cùng loại tồn tại (FREE: khớp giờ bắt đầu / FIXED: chồng lấn) → xóa
  //  - chưa có → thêm slot 2 tiếng của loại đang chọn
  const toggleCell = async (dayOfWeek: number, startTime: string) => {
    // FREE: logic cũ — khớp chính xác giờ bắt đầu
    const existingFree = slots.find(
      s => !isFixed(s) && s.dayOfWeek === dayOfWeek && s.startTime === startTime,
    )
    // FIXED: khung cố định thường lệchpreset (vd 07:30–11:30) → xét chồng lấn
    const existingFixed = slots.find(
      s => isFixed(s) && s.dayOfWeek === dayOfWeek &&
        s.startTime <= startTime && s.endTime > startTime,
    )
    const target = mode === 'FREE' ? existingFree : existingFixed
    try {
      if (target) {
        const res = await fetch(`/api/tutors/me/availability/${target.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setSlots(prev => prev.filter(s => s.id !== target.id))
      } else {
        const startH = parseInt(startTime.split(':')[0])
        const endH = Math.min(startH + 2, 23)
        const body = {
          dayOfWeek,
          startTime,
          endTime: `${String(endH).padStart(2, '0')}:00`,
          kind: mode,
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
        body: JSON.stringify({ dayOfWeek: day, startTime, endTime, kind: customKind }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(
        customKind === 'FIXED'
          ? `Đã thêm lịch cố định ${DAY_NAMES[day]} ${startTime}–${endTime}`
          : `Đã thêm giờ trống ${DAY_NAMES[day]} ${startTime}–${endTime}`,
      )
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
      toast.success(
        `Đã xóa ${isFixed(slot) ? 'lịch cố định' : 'giờ trống'} ${DAY_NAMES[slot.dayOfWeek]} ${slot.startTime}–${slot.endTime}`,
      )
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

  const freeCount = slots.filter(s => !isFixed(s)).length
  const fixedCount = slots.length - freeCount

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
            Đánh dấu giờ trống để nhận lớp mới, hoặc lịch dạy cố định bạn đang có.
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-full font-semibold"
          onClick={() => {
            setCustomKind(mode)
            setAddOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Khung giờ tùy chỉnh
        </Button>
      </div>

      {/* Chuyển chế độ: Giờ trống / Lịch dạy cố định */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-full bg-muted p-1 gap-1">
          <button
            onClick={() => setMode('FREE')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              mode === 'FREE' ? 'bg-primary text-primary-foreground shadow-e1' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Giờ trống · {freeCount}
          </button>
          <button
            onClick={() => setMode('FIXED')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              mode === 'FIXED' ? 'bg-amber-500 text-white shadow-e1' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Lịch dạy cố định · {fixedCount}
          </button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0" />
          {mode === 'FREE'
            ? 'Học sinh chỉ có thể đặt lịch trong các khung giờ này.'
            : 'Lịch cố định hiển thị trên hồ sơ là "Đã có lớp" — không nhận thêm lớp vào các khung này.'}
        </p>
      </div>

      {/* Lưới lịch tuần — bấm để bật/tắt theo chế độ đang chọn */}
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
                  // Ô giờ trống (FREE) — khớp giờ bắt đầu như logic cũ
                  const freeActive = slots.some(
                    s => !isFixed(s) && s.dayOfWeek === dayIdx && s.startTime === t,
                  )
                  // Ô lịch cố định (FIXED) — chồng lấn khung preset
                  const fixedOverlap = slots.some(
                    s => isFixed(s) && s.dayOfWeek === dayIdx &&
                      s.startTime <= t && s.endTime > t,
                  )
                  // Ở chế độ nào thì ô loại kia chỉ hiển thị (không chỉnh được)
                  const isOtherKind =
                    (mode === 'FREE' && fixedOverlap) || (mode === 'FIXED' && freeActive)

                  let cls = 'bg-muted/70 hover:bg-primary/10 text-muted-foreground'
                  let content: React.ReactNode = '+'
                  let title = `Bấm để thêm ${DAY_NAMES[dayIdx]} ${t}`
                  if (fixedOverlap) {
                    cls = 'bg-amber-100 text-amber-700 border border-amber-300'
                    content = <Lock className="h-4 w-4 mx-auto" />
                    title = `Lịch dạy cố định ${DAY_NAMES[dayIdx]} ${t}`
                  }
                  if (freeActive) {
                    cls = 'bg-primary text-primary-foreground shadow-e1 hover:bg-primary/90'
                    content = <CheckCircle2 className="h-4 w-4 mx-auto" />
                    title = `Giờ trống ${DAY_NAMES[dayIdx]} ${t} — bấm để xóa`
                  }

                  return (
                    <button
                      key={dayIdx}
                      onClick={() => (isOtherKind ? toast.info(
                        mode === 'FREE'
                          ? 'Đây là lịch dạy cố định — chuyển sang tab "Lịch dạy cố định" để chỉnh'
                          : 'Đây là giờ trống — chuyển sang tab "Giờ trống" để chỉnh',
                      ) : toggleCell(dayIdx, t))}
                      className={`h-10 rounded-xl text-[10px] font-bold transition-all ${cls} ${
                        isOtherKind ? 'opacity-90 cursor-default' : ''
                      }`}
                      title={title}
                    >
                      {content}
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
            {mode === 'FREE' ? (
              <>
                Đang mở <span className="font-bold text-foreground">{freeCount}</span> giờ trống/tuần
                {fixedCount > 0 && (
                  <> và <span className="font-bold text-amber-600">{fixedCount}</span> khung lịch cố định</>
                )}
                . Muốn giờ bất thường (vd 19:00–21:00)? Dùng <span className="font-semibold">Khung giờ tùy chỉnh</span>.
              </>
            ) : (
              <>
                Đang có <span className="font-bold text-amber-600">{fixedCount}</span> khung lịch dạy cố định/tuần.
                Phụ huynh sẽ thấy các khung này hiện &quot;Đã có lớp cố định&quot; trên hồ sơ của bạn.
              </>
            )}
          </span>
        </div>
      </Card>

      {/* Tổng hợp theo ngày — hiển thị đủ cả giờ trống lẫn lịch cố định */}
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
                      className={`inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-semibold group ${
                        isFixed(s)
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-muted/70'
                      }`}
                    >
                      {isFixed(s) ? <Lock className="h-3 w-3" /> : <Clock className="h-3 w-3 text-primary" />}
                      {s.startTime}–{s.endTime}
                      {isFixed(s) && <span className="font-medium text-amber-600/90">cố định</span>}
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
          <div className="space-y-1.5 pb-2">
            <Label>Loại khung giờ</Label>
            <select
              value={customKind}
              onChange={(e) => setCustomKind(e.target.value as SlotKind)}
              className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
            >
              <option value="FREE">Giờ trống — nhận học sinh mới</option>
              <option value="FIXED">Lịch dạy cố định — đã có lớp, không nhận thêm</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {customKind === 'FIXED'
                ? 'Dành cho lớp bạn đang dạy tại trường, trung tâm hoặc học sinh cũ. Phụ huynh sẽ thấy khung này được đánh dấu "Đã có lớp cố định".'
                : 'Học sinh có thể đặt lịch trong khung giờ này.'}
            </p>
          </div>
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
