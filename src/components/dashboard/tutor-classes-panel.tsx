'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Plus, GraduationCap, MapPin, Users, Clock, PencilLine, Trash2, PauseCircle,
  PlayCircle, CheckCircle2, CalendarDays, Wallet, Video, Home as HomeIcon,
  Info, UserCheck, UserX, XCircle, Ban, CalendarClock, ClipboardCheck,
  CalendarOff, RotateCcw, Download, Hourglass, ChevronDown, ChevronUp,
  MoreHorizontal, ChevronRight, Zap, Repeat,
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
  WAITLIST: { label: 'Đang chờ chỗ', cls: 'bg-violet-100 text-violet-700' },
  REJECTED: { label: 'Đã từ chối', cls: 'bg-rose-100 text-rose-700' },
  CANCELLED: { label: 'Đã rút', cls: 'bg-muted text-muted-foreground' },
}

const SESSION_STATUS: Record<string, { label: string; cls: string }> = {
  SCHEDULED: { label: 'Chờ diễn ra', cls: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Đã học', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Nghỉ buổi', cls: 'bg-rose-100 text-rose-700' },
}

interface Slot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface SessionAttendance {
  studentParentId: string
  status: string // PRESENT | ABSENT
  markedAt: string
}

interface ClassSessionItem {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string // SCHEDULED | COMPLETED | CANCELLED
  note?: string | null
  makeupForId?: string | null // id của buổi gốc nếu là buổi DẠY BÙ
  attendance: SessionAttendance[]
}

interface FeePayment {
  id: string
  enrollmentId: string
  studentParentId: string
  period: string // YYYY-MM
  amount: number
  method: string // CASH | BANK | MOMO | OTHER
  note: string | null
  paidAt: string
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
  enrollDeadline: string | null
  schedule: Slot[]
  enrollments: Enrollment[]
  sessions: ClassSessionItem[]
  feePayments: FeePayment[]
  stats: {
    upcomingCount: number
    nextSession: { date: string; startTime: string; endTime: string } | null
    completedCount: number
    cancelledCount: number
    feeUnpaidCurrent?: number // học sinh chưa đóng học phí tháng hiện tại
  }
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
  enrollDeadline: string
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
  enrollDeadline: '',
  schedule: [{ dayOfWeek: 2, startTime: '18:00', endTime: '20:30' }],
})

const dateKeyNow = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const addDaysISO = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Số tiền gọn cho ô ma trận học phí (1,6tr / 300k)
const feeShort = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace('.0', '')}tr`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return `${n}`
}

// Nhãn tháng gọn: 2026-10 → T10/26
const monthLabel = (per: string) => `T${Number(per.slice(5))}/${per.slice(2, 4)}`

// Buổi đã đến giờ bắt đầu (đủ điều kiện điểm danh)
const isSessionStarted = (s: ClassSessionItem) =>
  new Date(`${s.date}T${s.startTime}`).getTime() <= Date.now()

// Buổi đến giờ điểm danh và lớp có học sinh — nổi bật lên đầu trang
const isDueForAttendance = (cls: GroupClass, s: ClassSessionItem) =>
  s.status === 'SCHEDULED' && isSessionStarted(s) &&
  cls.enrollments.some(e => e.status === 'APPROVED')

/**
 * Panel "Lớp học cố định" trong Tutor Studio — thiết kế nhanh-gọn:
 *  1. Thanh "CẦN LÀM NGAY" nổi bật việc urgency (điểm danh đến giờ / đơn chờ duyệt)
 *  2. Mỗi lớp = 1 card gọn: nhìn 1 lần biết trạng thái + 1 nút hành động chính
 *  3. Mọi thao tác khác nằm trong 1 dialog "Quản lý lớp" (tab Học sinh | Buổi học)
 *     và menu "..." trên card (sửa / sổ điểm danh / tạm dừng / đóng / xóa).
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

  // Dialog quản lý lớp (classId | null) — dữ liệu luôn lấy mới từ `classes`
  const [manageTarget, setManageTarget] = useState<string | null>(null)
  const [manageTab, setManageTab] = useState<'students' | 'sessions' | 'fees'>('students')
  const [showAllPast, setShowAllPast] = useState<Record<string, boolean>>({})

  // Dialog điểm danh
  const [attendanceTarget, setAttendanceTarget] = useState<{ cls: GroupClass; session: ClassSessionItem } | null>(null)
  const [attendanceMarks, setAttendanceMarks] = useState<Record<string, 'PRESENT' | 'LATE' | 'ABSENT'>>({})
  const [submittingAttendance, setSubmittingAttendance] = useState(false)

  // Dialog dời buổi (dạy bù)
  const [rescheduleTarget, setRescheduleTarget] = useState<{ cls: GroupClass; session: ClassSessionItem } | null>(null)
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', startTime: '', endTime: '', reason: '' })
  const [submittingReschedule, setSubmittingReschedule] = useState(false)

  // Dialog nghỉ buổi (+ tùy chọn xếp buổi DẠY BÙ thay thế)
  const [cancelSessionTarget, setCancelSessionTarget] = useState<{ cls: GroupClass; session: ClassSessionItem } | null>(null)
  const [cancelSessionReason, setCancelSessionReason] = useState('')
  const [submittingCancelSession, setSubmittingCancelSession] = useState(false)
  const [makeupEnabled, setMakeupEnabled] = useState(false)
  const [makeupForm, setMakeupForm] = useState({ date: '', startTime: '', endTime: '' })

  // Dialog ghi nhận học phí (sổ học phí theo tháng)
  const [feeTarget, setFeeTarget] = useState<{ cls: GroupClass; enrollment: Enrollment; period: string } | null>(null)
  const [feeForm, setFeeForm] = useState({ amount: '', method: 'CASH', note: '' })
  const [submittingFee, setSubmittingFee] = useState(false)

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

  // Dialog quản lý lớp — luôn đọc bản mới nhất sau mỗi thao tác
  const managed = manageTarget ? classes.find(c => c.id === manageTarget) ?? null : null

  const openManage = (cls: GroupClass, tab: 'students' | 'sessions' | 'fees' = 'students') => {
    setManageTarget(cls.id)
    setManageTab(tab)
  }

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
      enrollDeadline: cls.enrollDeadline ?? '',
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
    // Hạn đăng ký: khi TẠO MỚI không được trước hôm nay (khi sửa cho phép — để đóng đăng ký ngay)
    if (!editing && form.enrollDeadline && form.enrollDeadline < dateKeyNow()) {
      return 'Hạn đăng ký không được trước hôm nay'
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
        enrollDeadline: form.enrollDeadline || null,
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
      if (editing) {
        let extra = ''
        if (data.sessionsRegenerated > 0) extra = ` — lịch tuần mới áp dụng cho ${data.sessionsRegenerated} buổi tương lai, học sinh đã nhận thông báo`
        else if (data.promotedCount > 0) extra = ` — ${data.promotedCount} học sinh từ danh sách chờ đã được chuyển vào lớp`
        toast.success(`Đã cập nhật lớp "${body.title}"${extra}`, { duration: 6000 })
      } else {
        toast.success(
          `Đã mở lớp "${body.title}" — hệ thống đã tạo lịch 12 tuần tới (${data.sessionsCreated} buổi)`,
          { duration: 5000 },
        )
      }
      setFormOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Lưu lớp học thất bại')
    } finally {
      setSaving(false)
    }
  }

  // ===== Hành động cấp lớp (menu "...") =====
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
      setManageTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Xóa thất bại')
    }
  }

  // ===== Duyệt / từ chối / cho rời lớp / xử lý danh sách chờ =====
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
      const name = enrollment.studentName ?? enrollment.parent.name
      let msg = ''
      if (status === 'APPROVED') {
        msg = enrollment.status === 'WAITLIST'
          ? `${name} đã được chuyển từ danh sách chờ vào lớp`
          : `${name} đã vào lớp`
      } else if (status === 'REJECTED') {
        msg = enrollment.status === 'WAITLIST'
          ? `Đã gỡ ${name} khỏi danh sách chờ`
          : `${name} bị từ chối`
      } else {
        msg = `${name} đã rời lớp`
      }
      if (data.promotedFromWaitlist?.length > 0) {
        msg += ` — ${data.promotedFromWaitlist.map((p: any) => p.name).join(', ')} tự động vào lớp từ danh sách chờ`
      }
      toast.success(msg, { duration: data.promotedFromWaitlist?.length ? 6000 : 4000 })
      load()
    } catch (e: any) {
      toast.error(e.message || 'Cập nhật thất bại')
      load()
    }
  }

  // ===== Điểm danh =====
  const openAttendance = (cls: GroupClass, session: ClassSessionItem) => {
    const approved = cls.enrollments.filter(e => e.status === 'APPROVED')
    if (approved.length === 0) {
      toast.error('Lớp chưa có học sinh nào để điểm danh')
      return
    }
    // Mặc định: ai đã được điểm danh trước đó giữ nguyên, học sinh mới mặc định CÓ MẶT
    const marks: Record<string, 'PRESENT' | 'LATE' | 'ABSENT'> = {}
    for (const e of approved) {
      const existing = session.attendance.find(a => a.studentParentId === e.parent.id)
      marks[e.parent.id] = (existing?.status as 'PRESENT' | 'LATE' | 'ABSENT') ?? 'PRESENT'
    }
    setAttendanceMarks(marks)
    setAttendanceTarget({ cls, session })
  }

  const submitAttendance = async () => {
    if (!attendanceTarget) return
    const rows = Object.entries(attendanceMarks).map(([studentParentId, status]) => ({
      studentParentId,
      status,
    }))
    if (rows.length === 0) return
    setSubmittingAttendance(true)
    try {
      const res = await fetch(
        `/api/classes/${attendanceTarget.cls.id}/sessions/${attendanceTarget.session.id}/attendance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendance: rows }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã lưu điểm danh', { duration: 5000 })
      setAttendanceTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Lưu điểm danh thất bại')
    } finally {
      setSubmittingAttendance(false)
    }
  }

  // ===== Dời buổi (dạy bù) =====
  const openReschedule = (cls: GroupClass, session: ClassSessionItem) => {
    setRescheduleForm({
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      reason: '',
    })
    setRescheduleTarget({ cls, session })
  }

  const submitReschedule = async () => {
    if (!rescheduleTarget) return
    if (!rescheduleForm.date || !rescheduleForm.startTime || !rescheduleForm.endTime) {
      toast.error('Vui lòng chọn ngày và giờ mới')
      return
    }
    if (rescheduleForm.startTime >= rescheduleForm.endTime) {
      toast.error('Giờ bắt đầu phải trước giờ kết thúc')
      return
    }
    setSubmittingReschedule(true)
    try {
      const res = await fetch(
        `/api/classes/${rescheduleTarget.cls.id}/sessions/${rescheduleTarget.session.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reschedule',
            date: rescheduleForm.date,
            startTime: rescheduleForm.startTime,
            endTime: rescheduleForm.endTime,
            reason: rescheduleForm.reason.trim() || undefined,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã dời buổi học', { duration: 6000 })
      setRescheduleTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Dời buổi thất bại')
    } finally {
      setSubmittingReschedule(false)
    }
  }

  // ===== Nghỉ buổi (+ tùy chọn xếp buổi DẠY BÙ) =====
  const openCancelSession = (cls: GroupClass, session: ClassSessionItem) => {
    setCancelSessionTarget({ cls, session })
    setCancelSessionReason('')
    setMakeupEnabled(false)
    // Gợi ý buổi bù: cùng giờ, 1 tuần sau
    setMakeupForm({ date: addDaysISO(session.date, 7), startTime: session.startTime, endTime: session.endTime })
  }

  const submitCancelSession = async () => {
    if (!cancelSessionTarget) return
    if (cancelSessionReason.trim().length < 5) {
      toast.error('Vui lòng nhập lý do nghỉ buổi (tối thiểu 5 ký tự)')
      return
    }
    let makeup: { date: string; startTime: string; endTime: string } | undefined
    if (makeupEnabled) {
      if (!makeupForm.date || !makeupForm.startTime || !makeupForm.endTime) {
        toast.error('Chọn đủ ngày và giờ cho buổi dạy bù')
        return
      }
      if (makeupForm.startTime >= makeupForm.endTime) {
        toast.error('Giờ bắt đầu buổi bù phải trước giờ kết thúc')
        return
      }
      makeup = { date: makeupForm.date, startTime: makeupForm.startTime, endTime: makeupForm.endTime }
    }
    setSubmittingCancelSession(true)
    try {
      const res = await fetch(
        `/api/classes/${cancelSessionTarget.cls.id}/sessions/${cancelSessionTarget.session.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel', reason: cancelSessionReason.trim(), makeup }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã nghỉ buổi', { duration: 5000 })
      setCancelSessionTarget(null)
      setCancelSessionReason('')
      load()
    } catch (e: any) {
      toast.error(e.message || 'Hủy buổi thất bại')
    } finally {
      setSubmittingCancelSession(false)
    }
  }

  // ===== Sổ học phí (ghi nhận / sửa / xóa 1 dòng đóng tiền) =====
  const openFee = (cls: GroupClass, enrollment: Enrollment, period: string) => {
    const existing = cls.feePayments.find(p => p.enrollmentId === enrollment.id && p.period === period)
    setFeeForm({
      amount: String(existing?.amount ?? cls.monthlyFee ?? 0),
      method: existing?.method ?? 'CASH',
      note: existing?.note ?? '',
    })
    setFeeTarget({ cls, enrollment, period })
  }

  const submitFee = async () => {
    if (!feeTarget) return
    const amount = Number(feeForm.amount)
    if (isNaN(amount) || amount < 0) {
      toast.error('Số tiền không hợp lệ')
      return
    }
    setSubmittingFee(true)
    try {
      const res = await fetch(`/api/classes/${feeTarget.cls.id}/fees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentId: feeTarget.enrollment.id,
          period: feeTarget.period,
          amount,
          method: feeForm.method,
          note: feeForm.note.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã ghi nhận học phí', { duration: 5000 })
      setFeeTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Ghi nhận học phí thất bại')
    } finally {
      setSubmittingFee(false)
    }
  }

  const deleteFee = async () => {
    if (!feeTarget) return
    const existing = feeTarget.cls.feePayments.find(
      p => p.enrollmentId === feeTarget.enrollment.id && p.period === feeTarget.period,
    )
    if (!existing) return
    setSubmittingFee(true)
    try {
      const res = await fetch(`/api/classes/${feeTarget.cls.id}/fees/${existing.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'Đã xóa dòng học phí')
      setFeeTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Xóa thất bại')
    } finally {
      setSubmittingFee(false)
    }
  }

  // Menu "..." trên card lớp — mọi hành động cấp lớp ít dùng hơn
  const classMenu = (cls: GroupClass) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full shrink-0"
          title="Thao tác khác với lớp"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => openEdit(cls)}>
          <PencilLine className="h-3.5 w-3.5 mr-2" /> Sửa thông tin lớp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { window.location.href = `/api/classes/${cls.id}/export` }}>
          <Download className="h-3.5 w-3.5 mr-2" /> Tải sổ điểm danh (CSV)
        </DropdownMenuItem>
        {cls.status === 'OPEN' && (
          <DropdownMenuItem onClick={() => changeStatus(cls, 'PAUSED')}>
            <PauseCircle className="h-3.5 w-3.5 mr-2" /> Tạm dừng nhận học sinh
          </DropdownMenuItem>
        )}
        {cls.status === 'PAUSED' && (
          <DropdownMenuItem onClick={() => changeStatus(cls, 'OPEN')}>
            <PlayCircle className="h-3.5 w-3.5 mr-2" /> Mở lại nhận học sinh
          </DropdownMenuItem>
        )}
        {cls.status !== 'CLOSED' && (
          <DropdownMenuItem onClick={() => changeStatus(cls, 'CLOSED')}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Đóng lớp (kết thúc)
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(cls)}>
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Xóa lớp vĩnh viễn
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (loading) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Đang tải lớp học...</Card>
  }

  // ===== Số liệu tổng (chỉ dùng cho text 1 dòng + thanh "cần làm") =====
  const openCount = classes.filter(c => c.status === 'OPEN').length
  const pendingTotal = classes.reduce(
    (s, c) => s + (c.status !== 'CLOSED' ? c.enrollments.filter(e => e.status === 'PENDING').length : 0), 0,
  )
  const waitlistTotal = classes.reduce(
    (s, c) => s + c.enrollments.filter(e => e.status === 'WAITLIST').length, 0,
  )
  // Buổi đã đến giờ điểm danh (có học sinh) — việc gấp nhất của gia sư
  const dueList = classes
    .filter(c => c.status !== 'CLOSED')
    .flatMap(c => c.sessions.filter(s => isDueForAttendance(c, s)).map(s => ({ cls: c, session: s })))
    .sort((a, b) => (a.session.date + a.session.startTime).localeCompare(b.session.date + b.session.startTime))
  const firstPendingClass = classes.find(
    c => c.status !== 'CLOSED' && c.enrollments.some(e => e.status === 'PENDING'),
  )

  return (
    <div className="space-y-4">
      {/* ===== 1. CẦN LÀM NGAY — chỉ hiện khi có việc, thao tác 1 cú click ===== */}
      {(dueList.length > 0 || pendingTotal > 0) && (
        <Card className="p-4 rounded-2xl border-primary/25 bg-primary/[0.04]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary mb-2.5 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Cần làm ngay
          </p>
          <div className="space-y-2">
            {dueList.slice(0, 3).map(({ cls, session }) => (
              <div key={session.id} className="flex items-center gap-3 flex-wrap">
                <p className="flex-1 min-w-0 text-sm">
                  <b className="truncate">{cls.title}</b>
                  <span className="text-muted-foreground">
                    {' '}· {formatDate(session.date)} {session.startTime}–{session.endTime} — đã đến giờ
                  </span>
                </p>
                <Button size="sm" className="h-8 rounded-full shrink-0" onClick={() => openAttendance(cls, session)}>
                  <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" /> Điểm danh
                </Button>
              </div>
            ))}
            {dueList.length > 3 && (
              <p className="text-xs text-muted-foreground">
                +{dueList.length - 3} buổi khác đã đến giờ — mở từng lớp bên dưới để điểm danh
              </p>
            )}
            {pendingTotal > 0 && firstPendingClass && (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="flex-1 min-w-0 text-sm">
                  <b>{pendingTotal} đơn đăng ký</b>
                  <span className="text-muted-foreground"> đang chờ bạn duyệt</span>
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 rounded-full shrink-0"
                  onClick={() => openManage(firstPendingClass, 'students')}
                >
                  <UserCheck className="h-3.5 w-3.5 mr-1.5" /> Duyệt ngay
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ===== 2. Toolbar mỏng: tổng quan 1 dòng + nút mở lớp ===== */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          <b className="text-foreground">{classes.length}</b> lớp
          {openCount > 0 && (<> · <b className="text-foreground">{openCount}</b> đang mở</>)}
          {pendingTotal > 0 && (<> · <span className="font-semibold text-amber-600">{pendingTotal} đơn chờ duyệt</span></>)}
          {waitlistTotal > 0 && (<> · <span className="font-semibold text-violet-600">{waitlistTotal} chờ chỗ</span></>)}
        </p>
        <Button className="rounded-full font-semibold" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Mở lớp học mới
        </Button>
      </div>

      {/* ===== 3. Danh sách lớp — mỗi lớp 1 card gọn, click mở quản lý ===== */}
      {classes.length === 0 ? (
        <Card className="p-10 text-center">
          <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Chưa có lớp học cố định nào</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Mở lớp học nhóm tại nhà bạn (ví dụ <b>Lớp Toán 10</b> — thứ 3 &amp; thứ 5, 18:00–20:30).
            Hệ thống tự sinh từng buổi học theo lịch tuần để điểm danh và quản lý.
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
        <div className="space-y-3">
          {classes.map(cls => {
            const st = CLASS_STATUS[cls.status] ?? CLASS_STATUS.OPEN
            const approved = cls.enrollments.filter(e => e.status === 'APPROVED')
            const pending = cls.enrollments.filter(e => e.status === 'PENDING')
            const waitlist = cls.enrollments.filter(e => e.status === 'WAITLIST')
            const remaining = cls.capacity - approved.length
            const nextSession = cls.stats?.nextSession ?? null
            const due = cls.sessions.find(s => isDueForAttendance(cls, s))
            const closed = cls.status === 'CLOSED'
            return (
              <Card key={cls.id} className="p-4 rounded-2xl hover:border-primary/40 transition-colors">
                <div className="flex items-start gap-3">
                  {/* Phần info — click mở dialog quản lý lớp */}
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => openManage(cls, pending.length > 0 && !closed ? 'students' : 'sessions')}
                    title="Mở quản lý lớp"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm">{cls.title}</h3>
                      <Badge className={`${st.cls} border-0 text-[10px]`}>{st.label}</Badge>
                      <Badge variant="outline" className={`text-[10px] gap-1 ${remaining === 0 ? 'text-rose-600 border-rose-200' : 'text-muted-foreground'}`}>
                        <Users className="h-3 w-3" /> {approved.length}/{cls.capacity}
                      </Badge>
                      {pending.length > 0 && !closed && (
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] gap-1">
                          <UserCheck className="h-3 w-3" /> {pending.length} đơn chờ
                        </Badge>
                      )}
                      {waitlist.length > 0 && (
                        <Badge className="bg-violet-100 text-violet-700 border-0 text-[10px] gap-1">
                          <Hourglass className="h-3 w-3" /> {waitlist.length} chờ chỗ
                        </Badge>
                      )}
                      {cls.monthlyFee != null && !closed && (cls.stats?.feeUnpaidCurrent ?? 0) > 0 && (
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] gap-1" title="Học sinh trong lớp chưa đóng học phí tháng này">
                          <Wallet className="h-3 w-3" /> {cls.stats!.feeUnpaidCurrent} chưa đóng tháng này
                        </Badge>
                      )}
                      {cls.status === 'OPEN' && cls.enrollDeadline && (
                        <Badge
                          className={`border-0 text-[10px] gap-1 ${
                            cls.enrollDeadline < dateKeyNow()
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-sky-100 text-sky-700'
                          }`}
                          title="Hạn chót phụ huynh gửi đăng ký vào lớp"
                        >
                          <CalendarClock className="h-3 w-3" />
                          {cls.enrollDeadline < dateKeyNow()
                            ? `Hết hạn đăng ký ${formatDate(cls.enrollDeadline)}`
                            : `Hạn đăng ký ${formatDate(cls.enrollDeadline)}`}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {sortClassSlots(cls.schedule).map((s, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold">
                          <Clock className="h-3 w-3" />
                          {CLASS_DAY_NAMES[s.dayOfWeek]} {s.startTime}–{s.endTime}
                        </span>
                      ))}
                      {cls.monthlyFee != null && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Wallet className="h-3 w-3" /> {formatVnd(cls.monthlyFee)}/tháng
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        {cls.meetingType === 'ONLINE'
                          ? <><Video className="h-3 w-3" /> Trực tuyến</>
                          : <><HomeIcon className="h-3 w-3" /> Tại nhà gia sư</>}
                      </span>
                      {(cls.stats?.completedCount ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          · <ClipboardCheck className="h-3 w-3" /> đã học {cls.stats!.completedCount} buổi
                        </span>
                      )}
                      {closed ? (
                        <span>· Lớp đã kết thúc</span>
                      ) : nextSession ? (
                        <span className="text-foreground font-medium">
                          · Buổi tới: {formatDate(nextSession.date)} {nextSession.startTime}
                        </span>
                      ) : (
                        <span>· Chưa có buổi nào</span>
                      )}
                    </p>
                  </button>

                  {/* Cột phải: 1 nút hành động chính + menu "..." */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {classMenu(cls)}
                    {due ? (
                      <Button size="sm" className="h-8 rounded-full" onClick={() => openAttendance(cls, due)}>
                        <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Điểm danh
                      </Button>
                    ) : pending.length > 0 && !closed ? (
                      <Button size="sm" variant="secondary" className="h-8 rounded-full" onClick={() => openManage(cls, 'students')}>
                        <UserCheck className="h-3.5 w-3.5 mr-1" /> Duyệt {pending.length} đơn
                      </Button>
                    ) : !closed ? (
                      <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => openManage(cls, 'sessions')}>
                        Quản lý lớp <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ===== Dialog QUẢN LÝ LỚP — mọi thao tác của 1 lớp gom về 1 chỗ ===== */}
      <Dialog open={!!managed} onOpenChange={(open) => !open && setManageTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
          {managed && (() => {
            const st = CLASS_STATUS[managed.status] ?? CLASS_STATUS.OPEN
            const approved = managed.enrollments.filter(e => e.status === 'APPROVED')
            const pending = managed.enrollments.filter(e => e.status === 'PENDING')
            const waitlist = managed.enrollments.filter(e => e.status === 'WAITLIST')
            const remaining = managed.capacity - approved.length
            const feeUnpaid = managed.stats?.feeUnpaidCurrent ?? 0
            const today = dateKeyNow()
            const upcomingList = managed.sessions.filter(s => s.status === 'SCHEDULED' && s.date >= today)
            const pastSessions = managed.sessions.filter(s => s.date < today || s.status !== 'SCHEDULED')
            const showPast = showAllPast[managed.id] ?? false
            const pastShown = showPast ? pastSessions : pastSessions.slice(-5)
            const due = managed.sessions.find(s => isDueForAttendance(managed, s))
            return (
              <>
                <DialogHeader className="text-left">
                  <DialogTitle className="flex items-center gap-2 flex-wrap pr-8">
                    {managed.title}
                    <Badge className={`${st.cls} border-0 text-[10px]`}>{st.label}</Badge>
                    <Badge variant="outline" className={`text-[10px] gap-1 ${remaining === 0 ? 'text-rose-600 border-rose-200' : 'text-muted-foreground'}`}>
                      <Users className="h-3 w-3" /> {approved.length}/{managed.capacity}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2 flex-wrap">
                    {sortClassSlots(managed.schedule).map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold">
                        {CLASS_DAY_NAMES[s.dayOfWeek]} {s.startTime}–{s.endTime}
                      </span>
                    ))}
                    {managed.monthlyFee != null && (
                      <span className="inline-flex items-center gap-1">
                        <Wallet className="h-3 w-3" /> {formatVnd(managed.monthlyFee)}/tháng
                      </span>
                    )}
                    {managed.meetingType !== 'ONLINE' && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {managed.address ?? 'Chưa có địa điểm'}
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>

                <Tabs value={manageTab} onValueChange={(v) => setManageTab(v as 'students' | 'sessions' | 'fees')} className="flex-1 min-h-0 flex flex-col">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="students" className="gap-1.5 text-xs sm:text-sm">
                      <Users className="h-3.5 w-3.5" /> Học sinh
                      {pending.length > 0 && (
                        <span className="h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {pending.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="sessions" className="gap-1.5 text-xs sm:text-sm">
                      <CalendarClock className="h-3.5 w-3.5" /> Buổi học
                      {upcomingList.length > 0 && (
                        <span className="h-4 min-w-4 px-1 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center">
                          {upcomingList.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="fees" className="gap-1.5 text-xs sm:text-sm">
                      <Wallet className="h-3.5 w-3.5" /> Học phí
                      {feeUnpaid > 0 && (
                        <span className="h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {feeUnpaid}
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  {/* Vùng nội dung cuộn được — giữ dialog gọn bất kể nhiều dữ liệu */}
                  <div className="flex-1 min-h-0 overflow-y-auto scroll-area mt-3 pr-1 -mr-1">

                    {/* ===== TAB HỌC SINH ===== */}
                    <TabsContent value="students" className="mt-0 space-y-4">
                      {pending.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                            <UserCheck className="h-3.5 w-3.5 text-amber-600" /> Đơn đăng ký chờ duyệt ({pending.length})
                          </p>
                          <div className="space-y-2">
                            {pending.map(e => (
                              <div key={e.id} className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/50">
                                <Avatar className="h-9 w-9 rounded-lg shrink-0">
                                  <AvatarImage src={e.parent.avatar || undefined} alt={e.parent.name} />
                                  <AvatarFallback className="bg-amber-500/15 text-amber-700 text-xs font-semibold">
                                    {(e.studentName ?? e.parent.name).charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold truncate">{e.studentName ?? e.parent.name}</p>
                                    {e.studentName && e.studentName !== e.parent.name && (
                                      <span className="text-[10px] text-muted-foreground">(phụ huynh {e.parent.name})</span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground">{timeAgo(e.createdAt)}</span>
                                  </div>
                                  {e.note && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">&quot;{e.note}&quot;</p>}
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  <Button size="sm" className="h-8 text-xs" onClick={() => setEnrollmentStatus(managed, e, 'APPROVED')}>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Duyệt
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEnrollmentStatus(managed, e, 'REJECTED')}>
                                    <XCircle className="h-3.5 w-3.5 mr-1" /> Từ chối
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {waitlist.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                            <Hourglass className="h-3.5 w-3.5 text-violet-600" /> Danh sách chờ ({waitlist.length}) — tự động vào lớp khi có chỗ
                          </p>
                          <div className="space-y-2">
                            {waitlist.map((e, i) => (
                              <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-violet-200 bg-violet-50/40">
                                <span className="h-7 w-7 rounded-full bg-violet-500/15 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">
                                  {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold truncate">
                                    {e.studentName ?? e.parent.name}
                                    {e.studentName && e.studentName !== e.parent.name && (
                                      <span className="text-[10px] text-muted-foreground font-normal"> (phụ huynh {e.parent.name})</span>
                                    )}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Chờ từ {timeAgo(e.createdAt)}{e.note ? ` · &quot;${e.note}&quot;` : ''}
                                  </p>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  {remaining > 0 && (
                                    <Button size="sm" className="h-8 text-xs" onClick={() => setEnrollmentStatus(managed, e, 'APPROVED')}>
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Vào lớp
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEnrollmentStatus(managed, e, 'REJECTED')}>
                                    Gỡ
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-emerald-600" /> Học sinh trong lớp ({approved.length}/{managed.capacity})
                          {remaining > 0 && <span className="text-muted-foreground font-normal">· còn {remaining} chỗ</span>}
                        </p>
                        {approved.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-1 py-2">
                            Chưa có học sinh nào — lớp đang hiển thị trên hồ sơ của bạn để phụ huynh tìm và đăng ký.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {approved.map(e => (
                              <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl border">
                                <Avatar className="h-8 w-8 rounded-lg shrink-0">
                                  <AvatarImage src={e.parent.avatar || undefined} alt={e.parent.name} />
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                    {(e.studentName ?? e.parent.name).charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{e.studentName ?? e.parent.name}</p>
                                  {e.studentName && e.studentName !== e.parent.name && (
                                    <p className="text-[10px] text-muted-foreground">phụ huynh {e.parent.name}</p>
                                  )}
                                </div>
                                {e.parent.phone && (
                                  <span className="text-[11px] text-muted-foreground shrink-0">{e.parent.phone}</span>
                                )}
                                <button
                                  onClick={() => setEnrollmentStatus(managed, e, 'CANCELLED')}
                                  className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                  title="Mời rời lớp"
                                >
                                  <UserX className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    {/* ===== TAB BUỔI HỌC ===== */}
                    <TabsContent value="sessions" className="mt-0 space-y-3">
                      {due && (
                        <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/25 bg-primary/[0.05] flex-wrap">
                          <p className="flex-1 min-w-0 text-sm">
                            <b>{formatDate(due.date)} {due.startTime}–{due.endTime}</b>
                            <span className="text-muted-foreground"> — đã đến giờ điểm danh</span>
                          </p>
                          <Button size="sm" className="h-8 rounded-full shrink-0" onClick={() => openAttendance(managed, due)}>
                            <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Điểm danh
                          </Button>
                        </div>
                      )}

                      {upcomingList.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                            <CalendarClock className="h-3.5 w-3.5 text-primary" /> Buổi sắp diễn ra ({upcomingList.length})
                            <span className="text-muted-foreground font-normal">· lịch tự sinh 12 tuần &amp; tự gia hạn</span>
                          </p>
                          <div className="space-y-1.5">
                            {upcomingList.slice(0, 12).map(s => (
                              <div key={s.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border bg-background/50 flex-wrap">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold">{formatDate(s.date)}</span>
                                    <span className="text-sm">{s.startTime}–{s.endTime}</span>
                                    {s.date === today && (
                                      <Badge className="bg-primary text-primary-foreground border-0 text-[10px]">Hôm nay</Badge>
                                    )}
                                    {s.makeupForId && (
                                      <Badge className="bg-sky-100 text-sky-700 border-0 text-[10px] gap-1" title="Buổi dạy bù thay cho buổi đã nghỉ">
                                        <Repeat className="h-3 w-3" /> Dạy bù
                                      </Badge>
                                    )}
                                  </div>
                                  {s.note && <p className="text-[11px] text-muted-foreground mt-0.5 italic truncate">&quot;{s.note}&quot;</p>}
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  {isSessionStarted(s) ? (
                                    <Button size="sm" className="h-7 text-xs" onClick={() => openAttendance(managed, s)}>
                                      <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Điểm danh
                                    </Button>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground self-center" title="Điểm danh sau khi buổi bắt đầu">
                                      Điểm danh sau giờ bắt đầu
                                    </span>
                                  )}
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openReschedule(managed, s)} title="Dời buổi này (dạy bù)">
                                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Dời
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-7 text-xs text-destructive hover:text-destructive px-2"
                                    onClick={() => openCancelSession(managed, s)}
                                    title="Nghỉ đúng buổi này"
                                  >
                                    <CalendarOff className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {upcomingList.length > 12 && (
                              <p className="text-[11px] text-muted-foreground px-1">
                                +{upcomingList.length - 12} buổi xa hơn theo lịch tuần cố định
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {pastShown.length > 0 && (
                        <div className="pt-2 border-t">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1">
                            <ClipboardCheck className="h-3 w-3" /> Buổi đã diễn ra ({pastSessions.length})
                          </p>
                          <div className="space-y-1">
                            {pastShown.slice().reverse().map(s => {
                              const present = s.attendance.filter(a => a.status === 'PRESENT').length
                              const late = s.attendance.filter(a => a.status === 'LATE').length
                              const absent = s.attendance.filter(a => a.status === 'ABSENT').length
                              return (
                                <div key={s.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 flex-wrap">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-semibold">{formatDate(s.date)}</span>
                                      <span className="text-xs text-muted-foreground">{s.startTime}</span>
                                      <Badge className={`${SESSION_STATUS[s.status]?.cls} border-0 text-[9px]`}>
                                        {SESSION_STATUS[s.status]?.label}
                                      </Badge>
                                    </div>
                                    {s.status === 'COMPLETED' && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {present} có mặt
                                        {late > 0 && ` · ${late} muộn`}
                                        {absent > 0 && ` · ${absent} vắng`}
                                        {absent > 0 && (
                                          <span className="text-rose-600">
                                            {' '}vắng: {managed.enrollments
                                              .filter(e => e.status === 'APPROVED' && s.attendance.find(a => a.studentParentId === e.parent.id && a.status === 'ABSENT'))
                                              .map(e => e.studentName ?? e.parent.name)
                                              .join(', ')}
                                          </span>
                                        )}
                                      </p>
                                    )}
                                    {s.status === 'CANCELLED' && s.note && (
                                      <p className="text-[10px] text-rose-600 mt-0.5 truncate">Lý do: {s.note}</p>
                                    )}
                                  </div>
                                  {s.status === 'COMPLETED' && (
                                    <Button size="sm" variant="ghost" className="h-6 text-[10px] shrink-0" onClick={() => openAttendance(managed, s)}>
                                      Sửa điểm danh
                                    </Button>
                                  )}
                                </div>
                              )
                            })}
                            {pastSessions.length > 5 && !showPast && (
                              <button
                                className="text-[11px] text-primary hover:underline mt-1"
                                onClick={() => setShowAllPast(prev => ({ ...prev, [managed.id]: true }))}
                              >
                                Xem tất cả {pastSessions.length} buổi đã diễn ra
                              </button>
                            )}
                            {showPast && pastSessions.length > 5 && (
                              <button
                                className="text-[11px] text-muted-foreground hover:text-foreground mt-1"
                                onClick={() => setShowAllPast(prev => ({ ...prev, [managed.id]: false }))}
                              >
                                Thu gọn lịch sử buổi
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs"
                          title="Tải sổ điểm danh (CSV — mở bằng Excel/Google Sheets)"
                          onClick={() => { window.location.href = `/api/classes/${managed.id}/export` }}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" /> Tải sổ điểm danh (CSV)
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(managed)}>
                          <PencilLine className="h-3.5 w-3.5 mr-1" /> Sửa lịch tuần
                        </Button>
                      </div>
                    </TabsContent>

                    {/* ===== TAB HỌC PHÍ — ma trận học sinh × tháng ===== */}
                    <TabsContent value="fees" className="mt-0 space-y-3">
                      {(() => {
                        const now = dateKeyNow().slice(0, 7)
                        // Tháng tính phí: từ tháng bắt đầu (muộn nhất giữa khai giảng /
                        // buổi đầu tiên / người đầu vào lớp) đến tháng hiện tại
                        const starts: string[] = []
                        if (managed.startDate) starts.push(managed.startDate.slice(0, 7))
                        if (managed.sessions[0]?.date) starts.push(managed.sessions[0].date.slice(0, 7))
                        if (approved[0]?.createdAt) starts.push(approved[0].createdAt.slice(0, 7))
                        const months: string[] = []
                        if (starts.length > 0) {
                          let [y, m] = starts.reduce((a, b) => (a > b ? a : b)).split('-').map(Number)
                          const [ny, nm] = now.split('-').map(Number)
                          while (y < ny || (y === ny && m <= nm)) {
                            months.push(`${y}-${String(m).padStart(2, '0')}`)
                            m++
                            if (m > 12) { m = 1; y++ }
                          }
                        }
                        const byKey = new Map(managed.feePayments.map(p => [`${p.enrollmentId}|${p.period}`, p]))
                        const paidNow = new Set(managed.feePayments.filter(p => p.period === now).map(p => p.enrollmentId))
                        const unpaidNow = approved.length - paidNow.size
                        const totalCollected = managed.feePayments.reduce((s, p) => s + p.amount, 0)

                        if (managed.monthlyFee == null) {
                          return (
                            <div className="p-4 rounded-xl border border-dashed text-center">
                              <Wallet className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                              <p className="text-sm font-semibold mb-1">Chưa đặt học phí tháng</p>
                              <p className="text-xs text-muted-foreground mb-3 max-w-xs mx-auto">
                                Đặt “Học phí theo tháng” khi sửa lớp để bắt đầu ghi nhận đóng tiền từng học sinh theo từng tháng.
                              </p>
                              <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => openEdit(managed)}>
                                <PencilLine className="h-3.5 w-3.5 mr-1" /> Sửa lớp
                              </Button>
                            </div>
                          )
                        }

                        return (
                          <>
                            <p className="text-xs text-muted-foreground">
                              Tháng này (<b>{monthLabel(now)}</b>):{' '}
                              {unpaidNow === 0
                                ? <span className="text-emerald-600 font-semibold">đã thu đủ {approved.length}/{approved.length}</span>
                                : <span className="text-amber-600 font-semibold">còn {unpaidNow}/{approved.length} chưa thu</span>}
                              {' '}· đã thu tất cả <b>{formatVnd(totalCollected)}</b>
                            </p>
                            {approved.length === 0 || months.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-4 text-center">
                                {approved.length === 0
                                  ? 'Lớp chưa có học sinh nào đã vào lớp.'
                                  : 'Lớp chưa khai giảng — chưa tới kỳ thu học phí.'}
                              </p>
                            ) : (
                              <div className="overflow-x-auto scroll-area -mx-1 px-1 pb-1">
                                <table className="text-xs border-separate border-spacing-y-1 w-max min-w-full">
                                  <thead>
                                    <tr>
                                      <th className="text-left font-semibold text-muted-foreground pl-2 pr-4 whitespace-nowrap">Học sinh</th>
                                      {months.map(per => (
                                        <th key={per} className={`font-semibold px-1 pb-1 whitespace-nowrap ${per === now ? 'text-primary' : 'text-muted-foreground'}`}>
                                          {monthLabel(per)}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {approved.map(e => (
                                      <tr key={e.id}>
                                        <td className="pl-2 pr-4 py-1 max-w-[150px] truncate font-semibold" title={e.studentName ?? e.parent.name}>
                                          {e.studentName ?? e.parent.name}
                                        </td>
                                        {months.map(per => {
                                          const pay = byKey.get(`${e.id}|${per}`)
                                          return (
                                            <td key={per} className="px-0.5 py-0.5">
                                              {pay ? (
                                                <button
                                                  className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200 font-semibold whitespace-nowrap"
                                                  title={`Đã thu ${formatVnd(pay.amount)}${pay.note ? ` — ${pay.note}` : ''} — bấm để sửa/xóa`}
                                                  onClick={() => openFee(managed, e, per)}
                                                >
                                                  {feeShort(pay.amount)}
                                                </button>
                                              ) : (
                                                <button
                                                  className="px-2 py-1 rounded-lg border border-dashed text-muted-foreground hover:border-amber-400 hover:text-amber-600 whitespace-nowrap"
                                                  title="Ghi nhận đã đóng học phí tháng này"
                                                  onClick={() => openFee(managed, e, per)}
                                                >
                                                  {per === now ? '＋ Thu' : '—'}
                                                </button>
                                              )}
                                            </td>
                                          )
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <p className="text-[11px] text-muted-foreground">
                              Bấm ô trống để ghi nhận đóng tiền · bấm ô xanh để sửa hoặc xóa — phụ huynh nhận thông báo sau mỗi lần ghi nhận.
                            </p>
                          </>
                        )
                      })()}
                    </TabsContent>
                  </div>
                </Tabs>

                <DialogFooter className="mt-2">
                  <Button variant="outline" onClick={() => setManageTarget(null)}>Đóng</Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ===== Dialog điểm danh ===== */}
      <Dialog open={!!attendanceTarget} onOpenChange={(open) => !open && setAttendanceTarget(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto scroll-area">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" /> Điểm danh buổi học
            </DialogTitle>
            <DialogDescription>
              {attendanceTarget && (
                <>
                  Lớp <b>{attendanceTarget.cls.title}</b> · {formatDate(attendanceTarget.session.date)} ·{' '}
                  {attendanceTarget.session.startTime}–{attendanceTarget.session.endTime}
                  {attendanceTarget.session.status === 'COMPLETED' && ' — buổi đã điểm danh, bạn đang sửa lại'}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            {attendanceTarget && attendanceTarget.cls.enrollments
              .filter(e => e.status === 'APPROVED')
              .map(e => {
                const mark = attendanceMarks[e.parent.id] ?? 'PRESENT'
                return (
                  <div key={e.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl border">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={e.parent.avatar || undefined} alt={e.parent.name} />
                        <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                          {(e.studentName ?? e.parent.name).charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium truncate">{e.studentName ?? e.parent.name}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setAttendanceMarks(prev => ({ ...prev, [e.parent.id]: 'PRESENT' }))}
                        className={`px-2.5 h-7 rounded-full text-xs font-semibold border transition-all ${
                          mark === 'PRESENT'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-background text-muted-foreground border-border hover:border-emerald-400'
                        }`}
                      >
                        Có mặt
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttendanceMarks(prev => ({ ...prev, [e.parent.id]: 'LATE' }))}
                        className={`px-2.5 h-7 rounded-full text-xs font-semibold border transition-all ${
                          mark === 'LATE'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-background text-muted-foreground border-border hover:border-amber-400'
                        }`}
                      >
                        Muộn
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttendanceMarks(prev => ({ ...prev, [e.parent.id]: 'ABSENT' }))}
                        className={`px-2.5 h-7 rounded-full text-xs font-semibold border transition-all ${
                          mark === 'ABSENT'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-background text-muted-foreground border-border hover:border-rose-400'
                        }`}
                      >
                        Vắng
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>

          <p className="text-xs text-muted-foreground">
            Buổi sẽ được đánh dấu <b>đã học</b> sau khi lưu — phụ huynh thấy chuyên cần của con mình
            trong Bảng điều khiển. Có thể sửa lại điểm danh bất cứ lúc nào.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAttendanceTarget(null)}>Đóng</Button>
            <Button onClick={submitAttendance} disabled={submittingAttendance}>
              {submittingAttendance ? 'Đang lưu...' : 'Lưu điểm danh'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog dời buổi (dạy bù) ===== */}
      <Dialog open={!!rescheduleTarget} onOpenChange={(open) => !open && setRescheduleTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" /> Dời buổi học (dạy bù)
            </DialogTitle>
            <DialogDescription>
              {rescheduleTarget && (
                <>
                  Dời buổi <b>{formatDate(rescheduleTarget.session.date)} {rescheduleTarget.session.startTime}</b> của
                  lớp &quot;{rescheduleTarget.cls.title}&quot; sang ngày/giờ khác — chỉ buổi này thay đổi,
                  các buổi khác giữ nguyên. Toàn bộ học sinh nhận được thông báo.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2 py-1">
            <div>
              <Label className="text-xs font-semibold mb-1 block">Ngày mới *</Label>
              <Input
                type="date"
                value={rescheduleForm.date}
                onChange={(e) => setRescheduleForm(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1 block">Bắt đầu</Label>
              <Input
                type="time"
                value={rescheduleForm.startTime}
                onChange={(e) => setRescheduleForm(prev => ({ ...prev, startTime: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1 block">Kết thúc</Label>
              <Input
                type="time"
                value={rescheduleForm.endTime}
                onChange={(e) => setRescheduleForm(prev => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1 block">Lý do (gửi học sinh — tùy chọn)</Label>
            <Input
              placeholder="vd: Đi công tác nên dời sang thứ 7 cùng giờ"
              value={rescheduleForm.reason}
              onChange={(e) => setRescheduleForm(prev => ({ ...prev, reason: e.target.value }))}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Hệ thống tự chặn nếu khung giờ mới trùng lớp khác hoặc buổi 1-1 đã nhận.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleTarget(null)}>Đóng</Button>
            <Button onClick={submitReschedule} disabled={submittingReschedule}>
              {submittingReschedule ? 'Đang dời...' : 'Xác nhận dời buổi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog nghỉ buổi ===== */}
      <Dialog open={!!cancelSessionTarget} onOpenChange={(open) => !open && setCancelSessionTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff className="h-5 w-5 text-destructive" /> Nghỉ buổi học?
            </DialogTitle>
            <DialogDescription>
              {cancelSessionTarget && (
                <>
                  Nghỉ đúng buổi <b>{formatDate(cancelSessionTarget.session.date)} {cancelSessionTarget.session.startTime}</b> của
                  lớp &quot;{cancelSessionTarget.cls.title}&quot;. Các buổi khác trong tuần vẫn diễn ra
                  bình thường. Học sinh trong lớp nhận được thông báo kèm lý do.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label className="text-xs font-semibold">Lý do nghỉ buổi (bắt buộc)</Label>
            <Textarea
              placeholder="vd: Gia sư ốm, đi sự kiện đột xuất... (tối thiểu 5 ký tự)"
              rows={3}
              value={cancelSessionReason}
              onChange={(e) => setCancelSessionReason(e.target.value)}
            />
          </div>

          {/* Xếp buổi DẠY BÙ thay thế ngay trong lúc nghỉ buổi */}
          <div className="rounded-xl border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={makeupEnabled}
                onChange={(e) => setMakeupEnabled(e.target.checked)}
              />
              Xếp ngay buổi DẠY BÙ thay thế
            </label>
            {makeupEnabled && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs font-semibold mb-1 block">Ngày dạy bù *</Label>
                    <Input type="date" value={makeupForm.date} onChange={(e) => setMakeupForm(p => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1 block">Bắt đầu</Label>
                    <Input type="time" value={makeupForm.startTime} onChange={(e) => setMakeupForm(p => ({ ...p, startTime: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1 block">Kết thúc</Label>
                    <Input type="time" value={makeupForm.endTime} onChange={(e) => setMakeupForm(p => ({ ...p, endTime: e.target.value }))} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Hệ thống tự chặn nếu buổi bù trùng lịch khác. Học sinh nhận thông báo “nghỉ buổi → dạy bù”.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelSessionTarget(null)}>Giữ lịch</Button>
            <Button variant="destructive" onClick={submitCancelSession} disabled={submittingCancelSession || cancelSessionReason.trim().length < 5}>
              {submittingCancelSession ? 'Đang xử lý...' : 'Xác nhận nghỉ buổi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog ghi nhận học phí (sổ học phí theo tháng) ===== */}
      <Dialog open={!!feeTarget} onOpenChange={(open) => !open && setFeeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" /> Ghi nhận học phí tháng
            </DialogTitle>
            <DialogDescription>
              {feeTarget && (
                <>
                  <b>{feeTarget.enrollment.studentName ?? feeTarget.enrollment.parent.name}</b> · lớp &quot;{feeTarget.cls.title}&quot; · kỳ{' '}
                  {monthLabel(feeTarget.period)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs font-semibold mb-1 block">Số tiền đã thu (đồng) *</Label>
              <Input
                type="number"
                min={0}
                step={10000}
                value={feeForm.amount}
                onChange={(e) => setFeeForm(prev => ({ ...prev, amount: e.target.value }))}
              />
              {feeTarget?.cls.monthlyFee != null && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Học phí chuẩn: {formatVnd(feeTarget.cls.monthlyFee)}/tháng — chỉnh số tiền nếu miễn giảm / đóng thiếu.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1 block">Hình thức</Label>
              <select
                className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
                value={feeForm.method}
                onChange={(e) => setFeeForm(prev => ({ ...prev, method: e.target.value }))}
              >
                <option value="CASH">Tiền mặt</option>
                <option value="BANK">Chuyển khoản</option>
                <option value="MOMO">Ví MoMo</option>
                <option value="OTHER">Khác</option>
              </select>
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1 block">Ghi chú (tùy chọn)</Label>
              <Input
                placeholder="vd: đóng đủ, miễn tháng..."
                value={feeForm.note}
                onChange={(e) => setFeeForm(prev => ({ ...prev, note: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-1">
            {feeTarget && (() => {
              const existing = feeTarget.cls.feePayments.find(
                p => p.enrollmentId === feeTarget.enrollment.id && p.period === feeTarget.period,
              )
              return existing ? (
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={deleteFee} disabled={submittingFee}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Xóa ghi nhận
                </Button>
              ) : null
            })()}
            <Button variant="outline" onClick={() => setFeeTarget(null)}>Đóng</Button>
            <Button onClick={submitFee} disabled={submittingFee}>
              {submittingFee ? 'Đang lưu...' : 'Ghi nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog tạo / sửa lớp học ===== */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scroll-area">
          <DialogHeader>
            <DialogTitle>{editing ? `Sửa lớp "${editing.title}"` : 'Mở lớp học cố định mới'}</DialogTitle>
            <DialogDescription>
              Lớp học nhóm theo lịch cố định hằng tuần. Hệ thống tự sinh từng buổi học theo
              lịch (12 tuần &amp; tự gia hạn) để điểm danh từng buổi — đổi lịch tuần sẽ tự
              thông báo cho học sinh trong lớp.
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              <div>
                <Label className="text-sm font-semibold mb-1.5 flex items-center gap-1">
                  Hạn đăng ký
                  <span
                    className="h-4 w-4 rounded-full bg-muted text-[9px] font-bold inline-flex items-center justify-center text-muted-foreground cursor-help shrink-0"
                    title="Ngày chót phụ huynh được gửi đăng ký. Bỏ trống = tuyển liên tục đến khi đủ sĩ số. Sửa thành ngày trong quá khứ nếu muốn đóng đăng ký ngay."
                  >?</span>
                </Label>
                <Input
                  type="date"
                  value={form.enrollDeadline}
                  onChange={(e) => setForm(prev => ({ ...prev, enrollDeadline: e.target.value }))}
                />
                {form.enrollDeadline && (
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-destructive mt-1"
                    onClick={() => setForm(prev => ({ ...prev, enrollDeadline: '' }))}
                  >
                    ✕ Bỏ giới hạn (tuyển liên tục)
                  </button>
                )}
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
                Hệ thống chặn trùng lịch với lớp khác và buổi 1-1 đã nhận. Lớp đủ sĩ số thì
                đăng ký mới tự vào <b className="text-foreground">danh sách chờ</b> — khi có chỗ
                trống, học sinh chờ được chuyển vào lớp tự động (kèm thông báo).
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
              Xóa hẳn lớp <b>{deleteTarget?.title}</b> cùng lịch học,{' '}
              {deleteTarget
                ? deleteTarget.enrollments.filter(e => e.status === 'APPROVED').length
                : 0}{' '}
              học sinh đang theo học và toàn bộ lịch sử buổi học/điểm danh. Hành động này
              không thể hoàn tác — nếu chỉ muốn ngừng nhận học sinh, hãy dùng{' '}
              <b>Tạm dừng tuyển</b> hoặc <b>Đóng lớp</b> trong menu thao tác.
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
