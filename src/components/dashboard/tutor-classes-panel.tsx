'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import {
  Plus, GraduationCap, MapPin, Users, Clock, PencilLine, Trash2, PauseCircle,
  PlayCircle, CheckCircle2, CalendarDays, Wallet, Video, Home as HomeIcon,
  Info, UserCheck, UserX, XCircle, Ban,
} from 'lucide-react'
import { formatVnd, formatDate, timeAgo, CLASS_DAY_NAMES, sortClassSlots } from '@/lib/format'
import { toast } from 'sonner'

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const CLASS_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Đang tuyển học sinh', cls: 'bg-emerald-100 text-emerald-700' },
  PAUSED: { label: 'Tạm dừng tuyển', cls: 'bg-amber-100 text-amber-700' },
  CLOSED: { label: 'Đã đóng lớp', cls: 'bg-muted text-muted-foreground' },
}

const ENROLL_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Đã vào lớp', cls: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Đã từ chối', cls: 'bg-rose-100 text-rose-700' },
  CANCELLED: { label: 'Đã rút', cls: 'bg-muted text-muted-foreground' },
}

interface Slot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface Enrollment {
  id: string
  status: string
  studentName: string | null
  note: string | null
  createdAt: string
  parent: { id: string; name: string; avatar?: string | null; phone?: string | null; district?: string | null }
}

interface GroupClass {
  id: string
  title: string
  subject: { id: string; name: string }
  gradeLevel: string | null
  description: string | null
  meetingType: string
  address: string | null
  capacity: number
  monthlyFee: number | null
  status: string
  startDate: string | null
  schedule: Slot[]
  enrollments: Enrollment[]
}

interface TutorSubjectItem {
  id: string
  subjectId: string
  pricePerHour: number
  subject: { id: string; name: string }
}

interface ClassForm {
  title: string
  subjectId: string
  gradeLevel: string
  description: string
  meetingType: 'AT_TUTOR_HOME' | 'ONLINE'
  address: string
  capacity: number
  monthlyFee: string
  startDate: string
  schedule: Slot[]
}

const emptyForm = (): ClassForm => ({
  title: '',
  subjectId: '',
  gradeLevel: '',
  description: '',
  meetingType: 'AT_TUTOR_HOME',
  address: '',
  capacity: 8,
  monthlyFee: '',
  startDate: '',
  schedule: [{ dayOfWeek: 2, startTime: '18:00', endTime: '20:30' }],
})

/**
 * Panel "Lớp học cố định" trong Tutor Studio — gia sư mở lớp học nhóm tại nhà
 * mình theo lịch cố định hằng tuần, quản lý sĩ số và duyệt học sinh đăng ký.
 */
export function TutorClassesPanel() {
  const { user, navigate } = useApp()
  const [classes, setClasses] = useState<GroupClass[]>([])
  const [subjects, setSubjects] = useState<TutorSubjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<GroupClass | null>(null)
  const [form, setForm] = useState<ClassForm>(emptyForm())

  const [deleteTarget, setDeleteTarget] = useState<GroupClass | null>(null)

  const load = async () => {
    const [clsData, subjData] = await Promise.all([
      fetch('/api/classes/mine').then(r => r.json()),
      fetch('/api/tutors/me/subjects').then(r => r.json()),
    ])
    setClasses(clsData.classes || [])
    setSubjects(subjData.subjects || [])
    setLoading(false)
  }

  useEffect(() => {
    if (user?.role === 'TUTOR') load()
  }, [user])

  // ===== Dialog tạo / sửa lớp =====
  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm(), subjectId: subjects[0]?.subject.id ?? '' })
    setFormOpen(true)
  }

  const openEdit = (cls: GroupClass) => {
    setEditing(cls)
    setForm({
      title: cls.title,
      subjectId: cls.subject.id,
      gradeLevel: cls.gradeLevel ?? '',
      description: cls.description ?? '',
      meetingType: (cls.meetingType as 'AT_TUTOR_HOME' | 'ONLINE') ?? 'AT_TUTOR_HOME',
      address: cls.address ?? '',
      capacity: cls.capacity,
      monthlyFee: cls.monthlyFee != null ? String(cls.monthlyFee) : '',
      startDate: cls.startDate ?? '',
      schedule: cls.schedule.length > 0 ? cls.schedule.map(s => ({ ...s })) : emptyForm().schedule,
    })
    setFormOpen(true)
  }

  const updateSlot = (idx: number, patch: Partial<Slot>) => {
    setForm(prev => ({
      ...prev,
      schedule: prev.schedule.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }))
  }

  const validateForm = (): string | null => {
    if (form.title.trim().length < 3) return 'Tên lớp tối thiểu 3 ký tự'
    if (!form.subjectId) return 'Vui lòng chọn môn học'
    if (!form.capacity || form.capacity < 1 || form.capacity > 50) return 'Sĩ số từ 1 đến 50'
    if (form.schedule.length === 0) return 'Thêm ít nhất 1 buổi học cố định trong tuần'
    for (const s of form.schedule) {
      if (!s.startTime || !s.endTime || s.startTime >= s.endTime) {
        return `Buổi ${CLASS_DAY_NAMES[s.dayOfWeek]}: giờ bắt đầu phải trước giờ kết thúc`
      }
    }
    for (let i = 0; i < form.schedule.length; i++) {
      for (let j = i + 1; j < form.schedule.length; j++) {
        const a = form.schedule[i], b = form.schedule[j]
        if (a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime) {
          return 'Hai buổi học trong tuần chồng lấn giờ — vui lòng sửa'
        }
      }
    }
    if (form.monthlyFee && (isNaN(Number(form.monthlyFee)) || Number(form.monthlyFee) < 0)) {
      return 'Học phí tháng không hợp lệ'
    }
    return null
  }

  const saveClass = async () => {
    const err = validateForm()
    if (err) {
      toast.error(err)
      return
    }
    setSaving(true)
    try {
      const body = {
        title: form.title.trim(),
        subjectId: form.subjectId,
        gradeLevel: form.gradeLevel.trim() || null,
        description: form.description.trim() || null,
        meetingType: form.meetingType,
        address: form.address.trim() || null,
        capacity: Number(form.capacity),
        monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : null,
        startDate: form.startDate || null,
        schedule: form.schedule,
      }
      const res = editing
        ? await fetch(`/api/classes/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lưu lớp học thất bại')
      toast.success(
        editing
          ? `Đã cập nhật lớp "${body.title}"`
          : `Đã mở lớp "${body.title}" — lớp hiển thị ngay trên hồ sơ của bạn`,
        { duration: 5000 },
      )
      setFormOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Lưu lớp học thất bại')
    } finally {
      setSaving(false)
    }
  }

  // ===== Hành động nhanh trên lớp =====
  const changeStatus = async (cls: GroupClass, status: 'OPEN' | 'PAUSED' | 'CLOSED') => {
    try {
      const res = await fetch(`/api/classes/${cls.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const label = CLASS_STATUS[status]?.label ?? status
      toast.success(`Đã chuyển lớp "${cls.title}" sang: ${label}`)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Cập nhật thất bại')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/classes/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã xóa lớp học')
      setDeleteTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Xóa thất bại')
    }
  }

  // ===== Duyệt / từ chối / cho rời lớp =====
  const setEnrollmentStatus = async (
    cls: GroupClass,
    enrollment: Enrollment,
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
  ) => {
    try {
      const res = await fetch(`/api/classes/${cls.id}/enrollments/${enrollment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const label =
        status === 'APPROVED' ? 'đã vào lớp' :
        status === 'REJECTED' ? 'bị từ chối' : 'đã rời lớp'
      toast.success(
        `${enrollment.studentName ?? enrollment.parent.name} ${label}`,
      )
      load()
    } catch (e: any) {
      toast.error(e.message || 'Cập nhật thất bại')
      load()
    }
  }

  if (loading) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Đang tải lớp học...</Card>
  }

  const openCount = classes.filter(c => c.status === 'OPEN').length
  const pendingTotal = classes.reduce(
    (s, c) => s + c.enrollments.filter(e => e.status === 'PENDING').length, 0,
  )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" /> Lớp học cố định
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Mở lớp học nhóm tại nhà bạn theo lịch cố định hằng tuần — phụ huynh thấy ngay lịch học,
            sĩ số còn trống và đăng ký trực tiếp.
          </p>
        </div>
        <Button className="rounded-full font-semibold" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Mở lớp học mới
        </Button>
      </div>

      {/* Tổng quan nhanh */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Lớp đang mở</p>
          <p className="text-xl font-extrabold text-primary">{openCount}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Đơn chờ duyệt</p>
          <p className="text-xl font-extrabold text-amber-600">{pendingTotal}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Tổng lớp</p>
          <p className="text-xl font-extrabold">{classes.length}</p>
        </Card>
      </div>

      {classes.length === 0 ? (
        <Card className="p-10 text-center">
          <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Chưa có lớp học cố định nào</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Mở lớp học nhóm tại nhà bạn (ví dụ <b>Lớp Toán 10</b> — thứ 3 &amp; thứ 5, 18:00–20:30).
            Phụ huynh sẽ thấy lịch cố định, sĩ số còn trống và gửi đăng ký cho bạn duyệt.
          </p>
          {subjects.length === 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-amber-600 flex items-center justify-center gap-1.5">
                <Info className="h-3.5 w-3.5" /> Bạn cần thêm môn dạy trước khi mở lớp
              </p>
              <Button variant="outline" onClick={() => navigate({ name: 'dashboard', tab: 'subjects' })}>
                Thêm môn dạy ngay
              </Button>
            </div>
          ) : (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Mở lớp học đầu tiên
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {classes.map(cls => {
            const st = CLASS_STATUS[cls.status] ?? CLASS_STATUS.OPEN
            const approved = cls.enrollments.filter(e => e.status === 'APPROVED')
            const pending = cls.enrollments.filter(e => e.status === 'PENDING')
            const remaining = cls.capacity - approved.length
            const pct = Math.min(100, Math.round((approved.length / cls.capacity) * 100))
            return (
              <Card key={cls.id} className="p-5 rounded-2xl">
                {/* Dòng 1: tên lớp + trạng thái + hành động */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base">{cls.title}</h3>
                      <Badge className={`${st.cls} border-0 text-[10px]`}>{st.label}</Badge>
                      {pending.length > 0 && cls.status !== 'CLOSED' && (
                        <Badge className="bg-primary text-primary-foreground border-0 text-[10px] gap-1">
                          {pending.length} đơn chờ duyệt
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span>{cls.subject.name}</span>
                      {cls.gradeLevel && <span>· {cls.gradeLevel}</span>}
                      <span className="inline-flex items-center gap-1">
                        · {cls.meetingType === 'ONLINE'
                          ? <><Video className="h-3 w-3" /> Trực tuyến</>
                          : <><HomeIcon className="h-3 w-3" /> Tại nhà gia sư</>}
                      </span>
                      {cls.startDate && (
                        <span className="inline-flex items-center gap-1">
                          · <CalendarDays className="h-3 w-3" /> Khai giảng {formatDate(cls.startDate)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openEdit(cls)}>
                      <PencilLine className="h-3.5 w-3.5 mr-1" /> Sửa
                    </Button>
                    {cls.status === 'OPEN' && (
                      <Button size="sm" variant="ghost" onClick={() => changeStatus(cls, 'PAUSED')} title="Tạm dừng nhận học sinh mới">
                        <PauseCircle className="h-3.5 w-3.5 mr-1" /> Tạm dừng tuyển
                      </Button>
                    )}
                    {cls.status === 'PAUSED' && (
                      <Button size="sm" variant="ghost" onClick={() => changeStatus(cls, 'OPEN')} title="Mở lại đăng ký">
                        <PlayCircle className="h-3.5 w-3.5 mr-1" /> Mở lại tuyển
                      </Button>
                    )}
                    {cls.status !== 'CLOSED' && (
                      <Button size="sm" variant="ghost" onClick={() => changeStatus(cls, 'CLOSED')} title="Kết thúc lớp">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Đóng lớp
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(cls)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Dòng 2: lịch cố định + địa điểm + học phí */}
                <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Lịch học cố định hằng tuần
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {sortClassSlots(cls.schedule).map((s, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold">
                          {CLASS_DAY_NAMES[s.dayOfWeek]} {s.startTime}–{s.endTime}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
                    {cls.meetingType !== 'ONLINE' && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{cls.address ?? 'Chưa có địa điểm'}</span>
                      </p>
                    )}
                    {cls.monthlyFee != null && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-semibold text-foreground">{formatVnd(cls.monthlyFee)}</span>/tháng
                      </p>
                    )}
                    {cls.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{cls.description}</p>
                    )}
                  </div>
                </div>

                {/* Dòng 3: sĩ số */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-primary" /> Sĩ số lớp
                    </span>
                    <span className={remaining === 0 ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}>
                      {approved.length}/{cls.capacity} học sinh
                      {remaining > 0 ? ` · còn ${remaining} chỗ` : ' · đã đủ'}
                      {pending.length > 0 ? ` · ${pending.length} đơn chờ duyệt` : ''}
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>

                {/* Dòng 4: học sinh */}
                <div className="mt-4 space-y-3">
                  {pending.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-amber-600" /> Đơn đăng ký chờ duyệt
                      </p>
                      <div className="space-y-2 max-h-56 overflow-y-auto scroll-area pr-1">
                        {pending.map(e => (
                          <div key={e.id} className="flex items-start gap-3 p-2.5 rounded-xl border border-amber-200 bg-amber-50/50">
                            <Avatar className="h-9 w-9 rounded-lg shrink-0">
                              <AvatarImage src={e.parent.avatar || undefined} alt={e.parent.name} />
                              <AvatarFallback className="bg-amber-500/15 text-amber-700 text-xs font-semibold">
                                {(e.studentName ?? e.parent.name).charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold truncate">
                                  {e.studentName ?? e.parent.name}
                                </p>
                                {e.studentName && e.studentName !== e.parent.name && (
                                  <span className="text-[10px] text-muted-foreground">
                                    (phụ huynh {e.parent.name})
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground">{timeAgo(e.createdAt)}</span>
                              </div>
                              {e.note && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">"{e.note}"</p>}
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" className="h-7 text-xs" onClick={() => setEnrollmentStatus(cls, e, 'APPROVED')}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Duyệt vào lớp
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEnrollmentStatus(cls, e, 'REJECTED')}>
                                  <XCircle className="h-3.5 w-3.5 mr-1" /> Từ chối
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {approved.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-emerald-600" /> Học sinh trong lớp ({approved.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {approved.map(e => (
                          <span key={e.id} className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border bg-muted/50">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={e.parent.avatar || undefined} alt={e.parent.name} />
                              <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                                {(e.studentName ?? e.parent.name).charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium">{e.studentName ?? e.parent.name}</span>
                            {e.parent.phone && (
                              <span className="text-[10px] text-muted-foreground">{e.parent.phone}</span>
                            )}
                            <button
                              onClick={() => setEnrollmentStatus(cls, e, 'CANCELLED')}
                              className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Mời rời lớp"
                            >
                              <UserX className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ===== Dialog tạo / sửa lớp học ===== */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scroll-area">
          <DialogHeader>
            <DialogTitle>{editing ? `Sửa lớp "${editing.title}"` : 'Mở lớp học cố định mới'}</DialogTitle>
            <DialogDescription>
              Lớp học nhóm theo lịch cố định hằng tuần (ví dụ Lớp Toán 10: thứ 3 &amp; thứ 5,
              18:00–20:30). Phụ huynh xem lịch, sĩ số còn trống và đăng ký trên hồ sơ của bạn.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div>
              <Label className="text-sm font-semibold mb-1.5 block">Tên lớp *</Label>
              <Input
                placeholder="vd: Lớp Toán 10 — Nâng cao & Ôn tập"
                value={form.title}
                onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold mb-1.5 block">Môn học *</Label>
                <select
                  value={form.subjectId}
                  onChange={(e) => setForm(prev => ({ ...prev, subjectId: e.target.value }))}
                  className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
                >
                  {subjects.length === 0 && <option value="">— Chưa có môn dạy —</option>}
                  {subjects.map(s => (
                    <option key={s.subject.id} value={s.subject.id}>
                      {s.subject.name} ({formatVnd(s.pricePerHour)}/giờ)
                    </option>
                  ))}
                </select>
                {subjects.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Thêm môn dạy trong tab &quot;Môn &amp; giá&quot; trước khi mở lớp.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm font-semibold mb-1.5 block">Khối lớp</Label>
                <Input
                  placeholder="vd: Lớp 10, Cấp 3, Luyện thi..."
                  value={form.gradeLevel}
                  onChange={(e) => setForm(prev => ({ ...prev, gradeLevel: e.target.value }))}
                />
              </div>
            </div>

            {/* Lịch học cố định trong tuần */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-sm font-semibold">Lịch học cố định *</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-full"
                  disabled={form.schedule.length >= 10}
                  onClick={() => setForm(prev => ({
                    ...prev,
                    schedule: [...prev.schedule, { dayOfWeek: 4, startTime: '18:00', endTime: '20:30' }],
                  }))}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Thêm buổi
                </Button>
              </div>
              <div className="space-y-2">
                {form.schedule.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={slot.dayOfWeek}
                      onChange={(e) => updateSlot(idx, { dayOfWeek: Number(e.target.value) })}
                      className="h-10 px-2 border rounded-lg bg-background text-sm flex-1"
                    >
                      {DAY_ORDER.map(d => (
                        <option key={d} value={d}>{CLASS_DAY_NAMES[d]}</option>
                      ))}
                    </select>
                    <Input
                      type="time"
                      value={slot.startTime}
                      onChange={(e) => updateSlot(idx, { startTime: e.target.value })}
                      className="w-28"
                      aria-label="Giờ bắt đầu"
                    />
                    <span className="text-muted-foreground text-sm">→</span>
                    <Input
                      type="time"
                      value={slot.endTime}
                      onChange={(e) => updateSlot(idx, { endTime: e.target.value })}
                      className="w-28"
                      aria-label="Giờ kết thúc"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={form.schedule.length <= 1}
                      onClick={() => setForm(prev => ({
                        ...prev,
                        schedule: prev.schedule.filter((_, i) => i !== idx),
                      }))}
                      title="Xóa buổi học này"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-sm font-semibold mb-1.5 block">Sĩ số tối đa *</Label>
                <Input
                  type="number" min={1} max={50}
                  value={form.capacity}
                  onChange={(e) => setForm(prev => ({ ...prev, capacity: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label className="text-sm font-semibold mb-1.5 block">Học phí/tháng</Label>
                <Input
                  type="number" min={0} step={50000}
                  placeholder="vd: 1600000"
                  value={form.monthlyFee}
                  onChange={(e) => setForm(prev => ({ ...prev, monthlyFee: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-sm font-semibold mb-1.5 block">Khai giảng</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold mb-1.5 block">Hình thức lớp</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, meetingType: 'AT_TUTOR_HOME' }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    form.meetingType === 'AT_TUTOR_HOME' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <HomeIcon className={`h-4 w-4 ${form.meetingType === 'AT_TUTOR_HOME' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-semibold text-sm">Tại nhà gia sư</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Học sinh đến lớp tại nhà bạn</p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, meetingType: 'ONLINE' }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    form.meetingType === 'ONLINE' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Video className={`h-4 w-4 ${form.meetingType === 'ONLINE' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-semibold text-sm">Trực tuyến</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Google Meet / Zoom</p>
                </button>
              </div>
            </div>

            {form.meetingType === 'AT_TUTOR_HOME' && (
              <div>
                <Label className="text-sm font-semibold mb-1.5 block">Địa điểm học</Label>
                <Input
                  placeholder="Để trống = dùng địa chỉ nhà trong hồ sơ của bạn"
                  value={form.address}
                  onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>
            )}

            <div>
              <Label className="text-sm font-semibold mb-1.5 block">Mô tả lớp</Label>
              <Textarea
                placeholder="Nội dung, mục tiêu, đối tượng học sinh phù hợp, giáo trình..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Phụ huynh sẽ thấy: tên lớp, lịch cố định hằng tuần, địa điểm, học phí và
                <b className="text-foreground"> sĩ số còn trống</b> (vd 6/10 chỗ). Đặt lịch 1-1
                trùng giờ lớp sẽ tự động bị chặn để không chồng chéo lịch dạy của bạn.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Đóng</Button>
            <Button onClick={saveClass} disabled={saving || subjects.length === 0}>
              {saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Mở lớp học'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog xác nhận xóa lớp ===== */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" /> Xóa lớp học?
            </DialogTitle>
            <DialogDescription>
              Xóa hẳn lớp <b>{deleteTarget?.title}</b> cùng lịch học và{' '}
              {deleteTarget
                ? deleteTarget.enrollments.filter(e => e.status === 'APPROVED').length
                : 0}{' '}
              học sinh đang theo học. Hành động này không thể hoàn tác — nếu chỉ muốn ngừng nhận
              học sinh, hãy dùng <b>Tạm dừng tuyển</b> hoặc <b>Đóng lớp</b>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Giữ lớp</Button>
            <Button variant="destructive" onClick={confirmDelete}>Xóa vĩnh viễn</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
