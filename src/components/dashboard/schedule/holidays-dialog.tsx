'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Trash2, Plus, CalendarOff } from 'lucide-react'
import { toast } from 'sonner'
import { HolidayItem, formatEventDate } from './schedule-shared'

/**
 * Dialog quản lý NGÀY NGHỈ LỄ toàn hệ thống (tab Lịch dạy):
 *  · Liệt kê ngày lễ từ hôm nay trở đi
 *  · Thêm ngày lễ → sinh buổi mới sẽ bỏ qua + buổi đã xếp trúng ngày tự nghỉ
 *    (kèm thông báo cho học sinh trong các lớp affected)
 *  · Xóa ngày lễ (buổi đã nghỉ không tự khôi phục — gia sư dời/dạy bù tay nếu cần)
 */
export function HolidaysDialog({ open, onOpenChange, onChanged }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onChanged: () => void
}) {
  const [holidays, setHolidays] = useState<HolidayItem[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ date: '', name: '' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/holidays')
      .then(r => r.json())
      .then(d => setHolidays(d.holidays || []))
      .catch(() => toast.error('Không tải được danh sách ngày lễ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  const add = async () => {
    if (!form.date || form.name.trim().length < 2) {
      toast.error('Chọn ngày và nhập tên ngày lễ')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: form.date, name: form.name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã thêm ngày lễ', { duration: 6000 })
      setForm({ date: '', name: '' })
      load()
      onChanged()
    } catch (e: any) {
      toast.error(e.message || 'Thêm ngày lễ thất bại')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (h: HolidayItem) => {
    try {
      const res = await fetch(`/api/holidays/${h.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã xóa ngày lễ')
      load()
      onChanged()
    } catch (e: any) {
      toast.error(e.message || 'Xóa ngày lễ thất bại')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-rose-600" /> Ngày nghỉ lễ
          </DialogTitle>
          <DialogDescription>
            Ngày lễ sẽ bị bỏ qua khi sinh buổi học mới. Thêm ngày lễ trúng buổi đã xếp
            thì buổi đó tự động nghỉ (kèm thông báo cho học sinh).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <div>
              <Label className="text-xs font-semibold mb-1 block">Ngày</Label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1 block">Tên ngày lễ</Label>
              <Input
                placeholder="vd: Tết Dương lịch"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full rounded-full"
            onClick={add}
            disabled={saving || !form.date || form.name.trim().length < 2}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> {saving ? 'Đang thêm...' : 'Thêm ngày lễ'}
          </Button>

          <div className="space-y-1.5 max-h-[280px] overflow-y-auto scroll-area pt-1">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Đang tải...</p>
            ) : holidays.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Chưa có ngày nghỉ lễ nào sắp tới.
              </p>
            ) : (
              holidays.map(h => (
                <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{formatEventDate(h.date)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive hover:text-destructive shrink-0"
                    onClick={() => remove(h)}
                    title="Xóa ngày lễ"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
