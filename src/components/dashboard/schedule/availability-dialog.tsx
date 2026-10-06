'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { CheckCircle2, Clock, Plus, Trash2, MousePointerClick } from 'lucide-react'
import { toast } from 'sonner'
import { AvailabilitySlot, VN_DAY_NAMES, VN_DAY_SHORT, MON_FIRST } from './schedule-shared'

const TIME_PRESETS = ['06:00', '08:00', '10:00', '14:00', '16:00', '18:00', '20:00']

/** Dialog chỉnh giờ trống nhận lớp 1-1 — lưới bấm để bật/tắt slot 2 tiếng + khung tùy chỉnh.
 *  Tách khỏi tab Lịch dạy để tab đó tập trung xem/quản lý buổi học thật. */
export function AvailabilityDialog({ open, onOpenChange, onChanged }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onChanged: () => void
}) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [day, setDay] = useState(1)
  const [startTime, setStartTime] = useState('18:00')
  const [endTime, setEndTime] = useState('20:00')

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/tutors/me/availability').then(r => r.json())
      setSlots(data.availability || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  const toggleCell = async (dayOfWeek: number, start: string) => {
    const existing = slots.find(s => s.dayOfWeek === dayOfWeek && s.startTime === start)
    try {
      if (existing) {
        const res = await fetch(`/api/tutors/me/availability/${existing.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setSlots(prev => prev.filter(s => s.id !== existing.id))
        onChanged()
      } else {
        const startH = parseInt(start.split(':')[0])
        const endH = Math.min(startH + 2, 23)
        const res = await fetch('/api/tutors/me/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dayOfWeek, startTime: start, endTime: `${String(endH).padStart(2, '0')}:00` }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setSlots(prev => [...prev, data])
        onChanged()
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
      toast.success(`Đã thêm giờ trống ${VN_DAY_NAMES[day]} ${startTime}–${endTime}`)
      setSlots(prev => [...prev, data])
      setAddOpen(false)
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (slot: AvailabilitySlot) => {
    try {
      await fetch(`/api/tutors/me/availability/${slot.id}`, { method: 'DELETE' })
      setSlots(prev => prev.filter(s => s.id !== slot.id))
      toast.success(`Đã xóa ${VN_DAY_NAMES[slot.dayOfWeek]} ${slot.startTime}–${slot.endTime}`)
      onChanged()
    } catch {
      toast.error('Xóa thất bại')
    }
  }

  const byDay: Record<number, AvailabilitySlot[]> = {}
  slots.forEach(s => {
    if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = []
    byDay[s.dayOfWeek].push(s)
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Giờ trống nhận lớp 1-1</DialogTitle>
            <DialogDescription>
              Bấm ô lưới để bật/tắt khung 2 tiếng. Phụ huynh chỉ đặt được buổi 1-1 trong các khung này.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Đang tải...</p>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto scroll-area">
                <div className="min-w-[560px]">
                  <div className="grid grid-cols-8 gap-1.5 mb-1.5">
                    <div className="text-[10px] text-muted-foreground text-center flex items-center justify-center">Giờ</div>
                    {MON_FIRST.map(d => (
                      <div key={d} className="text-center text-[11px] font-bold py-1 rounded-lg text-muted-foreground">
                        {VN_DAY_SHORT[d]}
                      </div>
                    ))}
                  </div>
                  {TIME_PRESETS.map(t => (
                    <div key={t} className="grid grid-cols-8 gap-1.5 mb-1.5">
                      <div className="text-[11px] text-muted-foreground flex items-center justify-center font-medium">{t}</div>
                      {MON_FIRST.map(dayIdx => {
                        const active = slots.some(s => s.dayOfWeek === dayIdx && s.startTime === t)
                        return (
                          <button
                            key={dayIdx}
                            onClick={() => toggleCell(dayIdx, t)}
                            className={`h-9 rounded-xl text-[10px] font-bold transition-all ${
                              active
                                ? 'bg-primary text-primary-foreground shadow-e1 hover:bg-primary/90'
                                : 'bg-muted/70 hover:bg-primary/10 text-muted-foreground'
                            }`}
                            title={active
                              ? `${VN_DAY_NAMES[dayIdx]} ${t} — bấm để xóa`
                              : `Bấm để thêm ${VN_DAY_NAMES[dayIdx]} ${t}`}
                          >
                            {active ? <CheckCircle2 className="h-4 w-4 mx-auto" /> : '+'}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <MousePointerClick className="h-3.5 w-3.5" />
                  Đang mở <b className="text-foreground">{slots.length}</b> khung giờ/tuần
                </p>
                <Button variant="outline" size="sm" className="rounded-full font-semibold" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Khung giờ tùy chỉnh
                </Button>
              </div>

              {slots.length > 0 && (
                <div className="space-y-1.5">
                  {MON_FIRST.filter(d => (byDay[d] || []).length > 0).map(d => (
                    <div key={d} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold w-16 shrink-0">{VN_DAY_NAMES[d]}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(byDay[d] || []).sort((a, b) => a.startTime.localeCompare(b.startTime)).map(s => (
                          <span key={s.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-semibold bg-muted/70">
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Xong</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog con: khung giờ tùy chỉnh */}
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
                onChange={e => setDay(Number(e.target.value))}
                className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
              >
                {MON_FIRST.map(d => <option key={d} value={d}>{VN_DAY_NAMES[d]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Bắt đầu</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Kết thúc</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Đóng</Button>
            <Button onClick={handleAddCustom} disabled={saving}>
              {saving ? 'Đang thêm...' : 'Thêm khung giờ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
