'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { CheckCircle2, XCircle, ClipboardCheck, CalendarClock, CalendarOff } from 'lucide-react'
import { toast } from 'sonner'
import { GroupClass, ClassSessionItem, BookingItem, formatEventDate } from './schedule-shared'

export interface AttendanceTarget { cls: GroupClass; session: ClassSessionItem }
export interface RescheduleTarget { cls: GroupClass; session: ClassSessionItem }
export interface CancelSessionTarget { cls: GroupClass; session: ClassSessionItem }

// ===== Dialog điểm danh =====
export function AttendanceDialog({ target, onClose, onDone }: {
  target: AttendanceTarget | null
  onClose: () => void
  onDone: () => void
}) {
  const [marks, setMarks] = useState<Record<string, 'PRESENT' | 'ABSENT'>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!target) return
    const approved = target.cls.enrollments.filter(e => e.status === 'APPROVED')
    const m: Record<string, 'PRESENT' | 'ABSENT'> = {}
    for (const e of approved) {
      const existing = target.session.attendance.find(a => a.studentParentId === e.parent.id)
      m[e.parent.id] = (existing?.status as 'PRESENT' | 'ABSENT') ?? 'PRESENT'
    }
    setMarks(m)
  }, [target])

  if (!target) return null
  const approved = target.cls.enrollments.filter(e => e.status === 'APPROVED')
  const alreadyMarked = target.session.attendance.length > 0

  const submit = async () => {
    const rows = Object.entries(marks).map(([studentParentId, status]) => ({ studentParentId, status }))
    if (rows.length === 0) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/classes/${target.cls.id}/sessions/${target.session.id}/attendance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendance: rows }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã lưu điểm danh', { duration: 5000 })
      onDone()
    } catch (e: any) {
      toast.error(e.message || 'Lưu điểm danh thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" /> Điểm danh buổi học
          </DialogTitle>
          <DialogDescription>
            {target.cls.title} · {formatEventDate(target.session.date)} · {target.session.startTime}–{target.session.endTime}
            {alreadyMarked && ' — đã điểm danh trước đó, sửa lại sẽ ghi đè'}
          </DialogDescription>
        </DialogHeader>

        {approved.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Lớp chưa có học sinh nào đã vào lớp để điểm danh.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[320px] overflow-y-auto py-1">
            {approved.map(e => {
              const st = marks[e.parent.id] ?? 'PRESENT'
              return (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={e.parent.avatar || undefined} />
                      <AvatarFallback className="text-[10px]">{e.parent.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.studentName || e.parent.name}</p>
                      {e.studentName && <p className="text-[10px] text-muted-foreground truncate">PH: {e.parent.name}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setMarks(p => ({ ...p, [e.parent.id]: 'PRESENT' }))}
                      className={`h-7 rounded-full px-2.5 text-[11px] font-bold inline-flex items-center gap-1 transition-colors ${
                        st === 'PRESENT'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Có mặt
                    </button>
                    <button
                      onClick={() => setMarks(p => ({ ...p, [e.parent.id]: 'ABSENT' }))}
                      className={`h-7 rounded-full px-2.5 text-[11px] font-bold inline-flex items-center gap-1 transition-colors ${
                        st === 'ABSENT'
                          ? 'bg-rose-600 text-white'
                          : 'bg-muted text-muted-foreground hover:bg-rose-100 hover:text-rose-700'
                      }`}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Vắng
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button onClick={submit} disabled={saving || approved.length === 0}>
            {saving ? 'Đang lưu...' : alreadyMarked ? 'Lưu lại' : 'Lưu điểm danh'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===== Dialog dời buổi / dạy bù =====
export function RescheduleDialog({ target, onClose, onDone }: {
  target: RescheduleTarget | null
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState({ date: '', startTime: '', endTime: '', reason: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!target) return
    setForm({ date: target.session.date, startTime: target.session.startTime, endTime: target.session.endTime, reason: '' })
  }, [target])

  if (!target) return null

  const submit = async () => {
    if (!form.date || !form.startTime || !form.endTime) {
      toast.error('Vui lòng chọn ngày và giờ mới')
      return
    }
    if (form.startTime >= form.endTime) {
      toast.error('Giờ bắt đầu phải trước giờ kết thúc')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(
        `/api/classes/${target.cls.id}/sessions/${target.session.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reschedule',
            date: form.date,
            startTime: form.startTime,
            endTime: form.endTime,
            reason: form.reason.trim() || undefined,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã dời buổi học', { duration: 6000 })
      onDone()
    } catch (e: any) {
      toast.error(e.message || 'Dời buổi thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" /> Dời buổi / dạy bù
          </DialogTitle>
          <DialogDescription>
            {target.cls.title} — hiện tại: {formatEventDate(target.session.date)} · {target.session.startTime}–{target.session.endTime}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 py-1">
          <div className="space-y-1.5">
            <Label>Ngày mới</Label>
            <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Bắt đầu</Label>
            <Input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Kết thúc</Label>
            <Input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Lý do (gửi cho phụ huynh)</Label>
          <Textarea
            rows={2}
            placeholder="VD: Gia sư có việc đột xuất, dời sang thứ 7 cùng giờ"
            value={form.reason}
            onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Hệ thống tự kiểm tra trùng lịch với các buổi khác trước khi dời.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Đang dời...' : 'Dời buổi'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===== Dialog nghỉ buổi =====
export function CancelSessionDialog({ target, onClose, onDone }: {
  target: CancelSessionTarget | null
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!target) setReason('') }, [target])
  if (!target) return null

  const submit = async () => {
    if (reason.trim().length < 5) {
      toast.error('Vui lòng nhập lý do nghỉ buổi (tối thiểu 5 ký tự)')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(
        `/api/classes/${target.cls.id}/sessions/${target.session.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel', reason: reason.trim() }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã nghỉ buổi', { duration: 5000 })
      onDone()
    } catch (e: any) {
      toast.error(e.message || 'Hủy buổi thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-rose-600" /> Nghỉ buổi học
          </DialogTitle>
          <DialogDescription>
            {target.cls.title} · {formatEventDate(target.session.date)} · {target.session.startTime}–{target.session.endTime}.
            Phụ huynh & học sinh sẽ được thông báo kèm lý do.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Lý do nghỉ buổi</Label>
          <Textarea
            rows={2}
            placeholder="VD: Gia sư ốm, nghỉ buổi này (buổi bù sẽ sắp xếp sau)"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            {saving ? 'Đang xử lý...' : 'Xác nhận nghỉ buổi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===== Dialog hủy buổi 1-1 =====
export function CancelBookingDialog({ target, onClose, onDone }: {
  target: BookingItem | null
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!target) setReason('') }, [target])
  if (!target) return null

  const submit = async () => {
    if (reason.trim().length < 5) {
      toast.error('Vui lòng nhập lý do hủy (tối thiểu 5 ký tự)')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/bookings/${target.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Hủy lịch thất bại')
      toast.success(data.message || 'Đã hủy buổi học')
      if (data.violation?.points > 0) {
        toast.warning(`Độ tin cậy của bạn bị trừ ${data.violation.points} điểm (${data.violation.label})`, { duration: 6000 })
      }
      onDone()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-rose-600" /> Hủy buổi 1-1
          </DialogTitle>
          <DialogDescription>
            {target.subject.name} với {target.student.name} · {formatEventDate(target.date)} · {target.startTime}–{target.endTime}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Lý do hủy (bắt buộc)</Label>
          <Textarea
            rows={2}
            placeholder="VD: Trùng lịch việc gia đình, xin phép dời buổi khác"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          Hủy gần giờ học có thể ảnh hưởng điểm độ tin cậy của bạn.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            {saving ? 'Đang hủy...' : 'Xác nhận hủy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
