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
import { ArrowLeft, Plus, Calendar, Clock, Trash2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

interface Slot {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
}

export function ManageAvailabilityPage() {
  const { user, navigate } = useApp()
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const [day, setDay] = useState(1)
  const [startTime, setStartTime] = useState('18:00')
  const [endTime, setEndTime] = useState('20:00')

  const load = async () => {
    const data = await fetch('/api/tutors/me/availability').then(r => r.json())
    setSlots(data.availability || [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.role === 'TUTOR') load()
  }, [user])

  if (!user || user.role !== 'TUTOR') {
    return (
      <div className="container mx-auto max-w-md py-16 text-center">
        <h2 className="text-2xl font-bold mb-2">Cần đăng nhập tài khoản gia sư</h2>
        <Button onClick={() => navigate({ name: 'login' })}>Đăng nhập</Button>
      </div>
    )
  }

  const handleAdd = async () => {
    if (startTime >= endTime) {
      toast.error('Giờ bắt đầu phải trước giờ kết thúc')
      return
    }
    try {
      const res = await fetch('/api/tutors/me/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayOfWeek: day, startTime, endTime })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Đã thêm lịch ${DAY_NAMES[day]} ${startTime}-${endTime}`)
      setAddOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleDelete = async (slot: Slot) => {
    if (!confirm(`Xóa lịch ${DAY_NAMES[slot.dayOfWeek]} ${slot.startTime}-${slot.endTime}?`)) return
    try {
      await fetch(`/api/tutors/me/availability/${slot.id}`, { method: 'DELETE' })
      toast.success('Đã xóa lịch')
      load()
    } catch {
      toast.error('Xóa thất bại')
    }
  }

  // Group by day
  const byDay: Record<number, Slot[]> = {}
  slots.forEach(s => {
    if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = []
    byDay[s.dayOfWeek].push(s)
  })

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate({ name: 'dashboard' })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Bảng điều khiển
      </Button>

      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" /> Lịch trống trong tuần
          </h1>
          <p className="text-sm text-muted-foreground">Học sinh chỉ có thể đặt lịch trong khoảng thời gian bạn thiết lập</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Thêm slot
        </Button>
      </div>

      {loading ? (
        <Card className="p-12 text-center">
          <div className="text-sm text-muted-foreground">Đang tải...</div>
        </Card>
      ) : slots.length === 0 ? (
        <Card className="p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Chưa có lịch trống nào</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Học sinh không thể đặt lịch nếu bạn chưa có lịch trống. Thêm ít nhất 1 slot.
          </p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Thêm lịch trống đầu tiên
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {DAY_NAMES.map((dayName, dayIdx) => {
            const daySlots = byDay[dayIdx] || []
            if (daySlots.length === 0) return null
            return (
              <Card key={dayIdx} className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold">{dayName}</h3>
                  <Badge variant="secondary">{daySlots.length} slot</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {daySlots
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map(s => (
                      <div key={s.id} className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg bg-muted/50 group">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-medium">{s.startTime} - {s.endTime}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(s)}
                          title="Xóa slot này"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm slot trống</DialogTitle>
            <DialogDescription>Học sinh có thể đặt lịch trong khoảng thời gian này</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Ngày trong tuần</Label>
              <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES.map((d, idx) => (
                  <button
                    key={d}
                    onClick={() => setDay(idx)}
                    className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                      day === idx
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/70'
                    }`}
                  >
                    {d === 'Chủ nhật' ? 'CN' : d.replace('Thứ ', 'T')}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Giờ bắt đầu <span className="text-xs text-muted-foreground">(24h)</span></Label>
                <Input type="time" step={1800} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Giờ kết thúc <span className="text-xs text-muted-foreground">(24h)</span></Label>
                <Input type="time" step={1800} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-semibold mb-1">💡 Mẹo:</p>
              <p>Nên chia slot theo buổi học 1.5-2 tiếng. Ví dụ: 18:00-20:00 cho buổi tối.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Hủy</Button>
            <Button onClick={handleAdd}><CheckCircle2 className="h-4 w-4 mr-1" /> Thêm slot</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
