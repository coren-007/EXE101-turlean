'use client'

// P6 — Trang quản trị (chỉ ADMIN): duyệt xác minh bằng cấp + theo dõi điểm tin cậy
// + mở khóa tài khoản bị tự khóa (reliability < 30).
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  ShieldCheck, FileCheck2, LockOpen, Users, GraduationCap, BookOpen,
  Star, School, AlertTriangle, FileText, ImageIcon, CheckCircle2, XCircle,
  Clock3, Loader2, BadgeCheck, Ban, ExternalLink, Wallet, CalendarOff, Lock, ScanSearch
} from 'lucide-react'
import { formatVnd, formatDate, timeAgo } from '@/lib/format'
import { toast } from 'sonner'
import { HolidaysDialog } from '@/components/dashboard/schedule/holidays-dialog'

interface VerificationRequest {
  id: string
  tutorId: string
  kind: string
  fileName: string
  fileType: string
  fileSize: number
  note: string | null
  status: string
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  tutor: {
    id: string
    name: string
    email: string
    avatar: string | null
    profession: string | null
    city: string | null
    isVerified: boolean
  }
}

interface StatsData {
  totals: {
    tutors: number
    students: number
    verifiedTutors: number
    pendingRequests: number
    approvedRequests: number
    rejectedRequests: number
    lockedAccounts: number
    bookings: number
    reviews: number
    classes: number
  }
  bookingByStatus: Record<string, number>
  watchlist: {
    id: string
    name: string
    avatar: string | null
    city: string | null
    isVerified: boolean
    locked: boolean
    score: number
    violations: number
    cancellations: number
  }[]
}

interface LockedUser {
  id: string
  name: string
  email: string
  avatar: string | null
  role: string
  city: string | null
  lockedAt: string | null
  lockedReason: string | null
  isVerified: boolean
  reliabilityScore: number
}

const KIND_LABEL: Record<string, string> = {
  DEGREE: 'Bằng cấp',
  CERTIFICATE: 'Chứng chỉ',
  ID_CARD: 'Giấy tờ tùy thân',
}

const REQ_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Chờ duyệt', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Đã duyệt', className: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Đã từ chối', className: 'bg-rose-100 text-rose-700' },
}

function tierColor(score: number): string {
  if (score >= 90) return 'text-emerald-600'
  if (score >= 70) return 'text-blue-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-rose-600'
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

export function AdminDashboardPage() {
  const { user, navigate } = useApp()
  const [tab, setTab] = useState<'overview' | 'verification' | 'locked'>('overview')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [requests, setRequests] = useState<VerificationRequest[]>([])
  const [lockedUsers, setLockedUsers] = useState<LockedUser[]>([])
  const [busy, setBusy] = useState(false)
  const [holidayOpen, setHolidayOpen] = useState(false)

  // Dialog xem file
  const [preview, setPreview] = useState<VerificationRequest | null>(null)
  // Dialog duyệt / từ chối
  const [reviewTarget, setReviewTarget] = useState<VerificationRequest | null>(null)
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED')
  const [reviewNote, setReviewNote] = useState('')
  // Dialog mở khóa
  const [unlockTarget, setUnlockTarget] = useState<LockedUser | null>(null)
  // Dialog khóa tay (watchlist — gia sư chưa chạm ngưỡng tự khóa nhưng có hành vi xấu)
  const [lockTarget, setLockTarget] = useState<StatsData['watchlist'][number] | null>(null)
  const [lockReason, setLockReason] = useState('')
  // Rà soát tự khóa toàn hệ thống (bất biến: điểm < 30 ⇒ khóa)
  const [sweeping, setSweeping] = useState(false)

  const load = useCallback(async () => {
    try {
      const [statsRes, reqRes, lockedRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/verification'),
        fetch('/api/admin/users?locked=1'),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (reqRes.ok) {
        const data = await reqRes.json()
        setRequests(data.requests ?? [])
      }
      if (lockedRes.ok) {
        const data = await lockedRes.json()
        setLockedUsers(data.users ?? [])
      }
    } catch {
      toast.error('Không tải được dữ liệu quản trị')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-20 text-center">
        <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-extrabold mb-2">Trang quản trị</h1>
        <p className="text-muted-foreground mb-6">Bạn cần đăng nhập bằng tài khoản quản trị viên.</p>
        <Button onClick={() => navigate({ name: 'login' })}>Đăng nhập</Button>
      </div>
    )
  }

  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  const submitReview = async () => {
    if (!reviewTarget) return
    if (reviewAction === 'REJECTED' && reviewNote.trim().length < 5) {
      toast.error('Từ chối phải kèm lý do tối thiểu 5 ký tự')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/verification/${reviewTarget.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: reviewAction, reviewNote: reviewNote.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Không xử lý được yêu cầu')
        return
      }
      toast.success(data.message || 'Đã xử lý')
      setReviewTarget(null)
      setReviewNote('')
      await load()
    } catch {
      toast.error('Lỗi kết nối')
    } finally {
      setBusy(false)
    }
  }

  const submitLock = async () => {
    if (!lockTarget) return
    if (lockReason.trim().length < 5) {
      toast.error('Lý do khóa cần tối thiểu 5 ký tự')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${lockTarget.id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: lockReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Không khóa được')
        return
      }
      toast.success(data.message || 'Đã khóa tài khoản')
      setLockTarget(null)
      setLockReason('')
      await load()
    } catch {
      toast.error('Lỗi kết nối')
    } finally {
      setBusy(false)
    }
  }

  const runSweep = async () => {
    setSweeping(true)
    try {
      const res = await fetch('/api/admin/users/lock-sweep', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Rà soát không thành công')
        return
      }
      if (data.locked > 0) {
        toast.success(
          `Đã khóa thêm ${data.locked} tài khoản: ${data.users.map((u: { name: string }) => u.name).join(', ')}`,
        )
      } else {
        toast.success(data.message || 'Mọi tài khoản đều trên ngưỡng tin cậy.')
      }
      await load()
    } catch {
      toast.error('Lỗi kết nối')
    } finally {
      setSweeping(false)
    }
  }

  const submitUnlock = async () => {
    if (!unlockTarget) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${unlockTarget.id}/unlock`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Không mở khóa được')
        return
      }
      toast.success(data.message || 'Đã mở khóa')
      setUnlockTarget(null)
      await load()
    } catch {
      toast.error('Lỗi kết nối')
    } finally {
      setBusy(false)
    }
  }

  const tabs = [
    { id: 'overview' as const, label: 'Tổng quan' },
    { id: 'verification' as const, label: 'Duyệt xác minh', badge: pendingCount },
    { id: 'locked' as const, label: 'Tài khoản khóa', badge: lockedUsers.length },
  ]

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Trang quản trị</h1>
          <p className="text-muted-foreground mt-1">
            Duyệt xác minh bằng cấp · theo dõi độ tin cậy · mở khóa tài khoản
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setHolidayOpen(true)}
          >
            <CalendarOff className="h-4 w-4 mr-1.5" /> Ngày nghỉ lễ
          </Button>
          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
            <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Quản trị viên
          </Badge>
        </div>
      </div>

      {/* Dialog quản lý ngày nghỉ lễ toàn hệ thống (SẬ-HOL: chuyển quyền sang ADMIN) */}
      <HolidaysDialog open={holidayOpen} onOpenChange={setHolidayOpen} onChanged={() => {}} />

      {/* Tab pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 h-10 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
              tab === t.id
                ? 'bg-primary text-primary-foreground shadow-e1'
                : 'bg-muted/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {!!t.badge && t.badge > 0 && (
              <span className={`h-5 min-w-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                tab === t.id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Đang tải dữ liệu…
        </div>
      ) : (
        <>
          {/* ============ TAB TỔNG QUAN ============ */}
          {tab === 'overview' && stats && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <GraduationCap className="h-4 w-4" /> Gia sư
                  </div>
                  <p className="text-3xl font-extrabold mt-1">{stats.totals.tutors}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="text-emerald-600 font-semibold">{stats.totals.verifiedTutors} đã xác minh</span>
                    {' · '}<span className="text-amber-600 font-semibold">{stats.totals.pendingRequests} chờ duyệt</span>
                  </p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <Users className="h-4 w-4" /> Phụ huynh/Học sinh
                  </div>
                  <p className="text-3xl font-extrabold mt-1">{stats.totals.students}</p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <BookOpen className="h-4 w-4" /> Buổi học 1-1
                  </div>
                  <p className="text-3xl font-extrabold mt-1">{stats.totals.bookings}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.bookingByStatus.COMPLETED ?? 0} hoàn thành · {stats.bookingByStatus.CANCELLED ?? 0} đã hủy
                  </p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <Ban className="h-4 w-4" /> Tài khoản khóa
                  </div>
                  <p className="text-3xl font-extrabold mt-1">{stats.totals.lockedAccounts}</p>
                  <p className="text-xs text-muted-foreground mt-1">Tự khóa khi độ tin cậy &lt; 30</p>
                </Card>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <Star className="h-4 w-4" /> Đánh giá
                  </div>
                  <p className="text-2xl font-extrabold mt-1">{stats.totals.reviews}</p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <School className="h-4 w-4" /> Lớp nhóm
                  </div>
                  <p className="text-2xl font-extrabold mt-1">{stats.totals.classes}</p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <FileCheck2 className="h-4 w-4" /> Yêu cầu xác minh
                  </div>
                  <p className="text-2xl font-extrabold mt-1">
                    {stats.totals.approvedRequests + stats.totals.rejectedRequests + stats.totals.pendingRequests}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.totals.approvedRequests} duyệt · {stats.totals.rejectedRequests} từ chối · {stats.totals.pendingRequests} chờ
                  </p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <Wallet className="h-4 w-4" /> Phí nền tảng
                  </div>
                  <p className="text-2xl font-extrabold mt-1">{formatVnd(0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Thanh toán trực tiếp 2 bên</p>
                </Card>
              </div>

              {/* Bảng gia sư cần chú ý */}
              <Card className="p-5">
                <h2 className="font-bold flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Gia sư cần theo dõi (độ tin cậy thấp nhất)
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Tự động khóa khi điểm rơi dưới 30/100. Danh sách 10 gia sư có điểm thấp nhất.
                </p>
                {stats.watchlist.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Chưa có dữ liệu độ tin cậy</p>
                ) : (
                  <div className="divide-y">
                    {stats.watchlist.map(t => (
                      <div key={t.id} className="flex items-center gap-3 py-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={t.avatar || undefined} alt={t.name} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {t.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <button
                          className="font-semibold text-sm hover:underline text-left"
                          onClick={() => navigate({ name: 'tutor', id: t.id })}
                        >
                          {t.name}
                        </button>
                        {t.isVerified && (
                          <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0" aria-label="Đã xác minh" />
                        )}
                        {t.locked && (
                          <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 shrink-0">
                            <Ban className="h-3 w-3 mr-1" /> Đã khóa
                          </Badge>
                        )}
                        <span className="ml-auto text-sm text-muted-foreground hidden sm:block">
                          {t.cancellations} lần hủy · {t.violations} vi phạm
                        </span>
                        <span className={`text-lg font-extrabold tabular-nums ${tierColor(t.score)}`}>
                          {t.score}
                          <span className="text-xs text-muted-foreground font-semibold">/100</span>
                        </span>
                        {!t.locked && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                            title="Khóa tay tài khoản này (hành vi xấu chưa chạm ngưỡng tự khóa)"
                            onClick={() => { setLockTarget(t); setLockReason('') }}
                          >
                            <Lock className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ============ TAB DUYỆT XÁC MINH ============ */}
          {tab === 'verification' && (
            <div className="space-y-4">
              {requests.length === 0 && (
                <Card className="p-12 text-center text-muted-foreground">
                  <FileCheck2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  Chưa có yêu cầu xác minh nào
                </Card>
              )}
              {requests.map(r => (
                <Card key={r.id} className="p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={r.tutor.avatar || undefined} alt={r.tutor.name} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {r.tutor.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className="font-bold hover:underline"
                          onClick={() => navigate({ name: 'tutor', id: r.tutor.id })}
                        >
                          {r.tutor.name}
                        </button>
                        {r.tutor.isVerified && (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            <BadgeCheck className="h-3 w-3 mr-1" /> Đã xác minh
                          </Badge>
                        )}
                        <Badge variant="outline">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                        <Badge className={`${REQ_STATUS[r.status]?.className ?? ''} hover:${REQ_STATUS[r.status]?.className}`}>
                          {REQ_STATUS[r.status]?.label ?? r.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {r.tutor.profession ?? 'Gia sư'}{r.tutor.city ? ` · ${r.tutor.city}` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-2">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          {r.fileType.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          {r.fileName} · {fmtSize(r.fileSize)}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock3 className="h-4 w-4" /> {timeAgo(r.createdAt)}
                        </span>
                      </div>
                      {r.note && (
                        <p className="text-sm mt-2 bg-muted/50 rounded-lg px-3 py-2">“{r.note}”</p>
                      )}
                      {r.status !== 'PENDING' && r.reviewNote && (
                        <p className="text-sm mt-2 text-muted-foreground">
                          <span className="font-semibold">Phản hồi:</span> {r.reviewNote}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 min-w-[140px]">
                      <Button variant="outline" size="sm" onClick={() => setPreview(r)}>
                        <ExternalLink className="h-4 w-4 mr-1.5" /> Xem tệp
                      </Button>
                      {r.status === 'PENDING' && (
                        <>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => { setReviewTarget(r); setReviewAction('APPROVED'); setReviewNote('') }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Duyệt
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => { setReviewTarget(r); setReviewAction('REJECTED'); setReviewNote('') }}
                          >
                            <XCircle className="h-4 w-4 mr-1.5" /> Từ chối
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* ============ TAB TÀI KHOẢN KHÓA ============ */}
          {tab === 'locked' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Tự khóa khi điểm tin cậy &lt; 30/100 · mở khóa không reset điểm
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={sweeping}
                  onClick={runSweep}
                >
                  {sweeping
                    ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    : <ScanSearch className="h-4 w-4 mr-1.5" />}
                  Rà soát tự khóa
                </Button>
              </div>
              {lockedUsers.length === 0 && (
                <Card className="p-12 text-center text-muted-foreground">
                  <LockOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  Không có tài khoản nào bị khóa — tất cả đều trên ngưỡng tin cậy 30/100
                </Card>
              )}
              {lockedUsers.map(u => (
                <Card key={u.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={u.avatar || undefined} alt={u.name} />
                      <AvatarFallback className="bg-rose-100 text-rose-700 font-bold">
                        {u.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{u.name}</p>
                        <Badge variant="outline">{u.role === 'TUTOR' ? 'Gia sư' : 'Phụ huynh/Học sinh'}</Badge>
                        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">
                          <Ban className="h-3 w-3 mr-1" /> Đã khóa
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{u.email}</p>
                      <p className="text-sm mt-1">
                        <span className="text-muted-foreground">Lý do:</span> {u.lockedReason ?? 'Không rõ'}
                        {' · '}
                        <span className="text-muted-foreground">Khóa lúc:</span> {u.lockedAt ? timeAgo(u.lockedAt) : '—'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className={`text-2xl font-extrabold ${tierColor(u.reliabilityScore)}`}>
                        {u.reliabilityScore}
                      </p>
                      <p className="text-xs text-muted-foreground">điểm tin cậy</p>
                    </div>
                    <Button
                      variant="outline"
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                      onClick={() => setUnlockTarget(u)}
                    >
                      <LockOpen className="h-4 w-4 mr-1.5" /> Mở khóa
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== Dialog xem tệp ===== */}
      <Dialog open={!!preview} onOpenChange={o => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {preview ? `${KIND_LABEL[preview.kind] ?? preview.kind} — ${preview.tutor.name}` : ''}
            </DialogTitle>
            <DialogDescription>
              {preview?.fileName} · {preview ? fmtSize(preview.fileSize) : ''}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="rounded-xl border bg-muted/30 overflow-hidden flex items-center justify-center min-h-[320px] max-h-[60vh]">
              {preview.fileType.startsWith('image/') ? (
                <img
                  src={`/api/admin/verification/${preview.id}/file`}
                  alt={preview.fileName}
                  className="max-h-[60vh] max-w-full object-contain"
                />
              ) : (
                <iframe
                  src={`/api/admin/verification/${preview.id}/file`}
                  title={preview.fileName}
                  className="w-full h-[60vh]"
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" asChild>
              <a
                href={preview ? `/api/admin/verification/${preview.id}/file` : '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-1.5" /> Mở tab mới
              </a>
            </Button>
            {preview?.status === 'PENDING' && (
              <>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => { setReviewTarget(preview); setReviewAction('APPROVED'); setPreview(null); setReviewNote('') }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Duyệt
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => { setReviewTarget(preview); setReviewAction('REJECTED'); setPreview(null); setReviewNote('') }}
                >
                  <XCircle className="h-4 w-4 mr-1.5" /> Từ chối
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog duyệt / từ chối ===== */}
      <Dialog open={!!reviewTarget} onOpenChange={o => !o && setReviewTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'APPROVED' ? 'Duyệt yêu cầu xác minh' : 'Từ chối yêu cầu xác minh'}
            </DialogTitle>
            <DialogDescription>
              {reviewTarget
                ? `${KIND_LABEL[reviewTarget.kind] ?? reviewTarget.kind} của ${reviewTarget.tutor.name}${
                    reviewAction === 'APPROVED'
                      ? ' — hồ sơ sẽ bật badge "Đã xác minh" công khai.'
                      : ' — gia sư sẽ thấy lý do và có thể gửi lại.'
                  }`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reviewNote}
            onChange={e => setReviewNote(e.target.value)}
            placeholder={
              reviewAction === 'APPROVED'
                ? 'Ghi chú (không bắt buộc) — vd: Đã đối chiếu bằng Cử nhân Sư phạm Toán…'
                : 'Lý do từ chối (bắt buộc ≥ 5 ký tự) — vd: Ảnh mờ không đọc được số hiệu bằng cấp…'
            }
            rows={3}
          />
          {reviewAction === 'REJECTED' && reviewNote.trim().length > 0 && reviewNote.trim().length < 5 && (
            <p className="text-sm text-rose-600">Lý do cần tối thiểu 5 ký tự</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Hủy</Button>
            <Button
              className={reviewAction === 'APPROVED' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              variant={reviewAction === 'REJECTED' ? 'destructive' : 'default'}
              disabled={busy || (reviewAction === 'REJECTED' && reviewNote.trim().length < 5)}
              onClick={submitReview}
            >
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {reviewAction === 'APPROVED' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog khóa tay (watchlist) ===== */}
      <Dialog open={!!lockTarget} onOpenChange={o => !o && setLockTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-rose-600" /> Khóa tài khoản
            </DialogTitle>
            <DialogDescription>
              {lockTarget
                ? `Khóa ${lockTarget.name} (điểm tin cậy ${lockTarget.score}/100)? Họ sẽ không đăng nhập được cho tới khi được mở khóa.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={lockReason}
            onChange={e => setLockReason(e.target.value)}
            placeholder="Lý do khóa (bắt buộc ≥ 5 ký tự) — tài khoản bị khóa sẽ thấy lý do này, vd: Hồ sơ bằng cấp giả mạo…"
            rows={3}
          />
          {lockReason.trim().length > 0 && lockReason.trim().length < 5 && (
            <p className="text-sm text-rose-600">Lý do cần tối thiểu 5 ký tự</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockTarget(null)}>Để sau</Button>
            <Button
              variant="destructive"
              disabled={busy || lockReason.trim().length < 5}
              onClick={submitLock}
            >
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              <Lock className="h-4 w-4 mr-1.5" /> Khóa tài khoản
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog mở khóa ===== */}
      <Dialog open={!!unlockTarget} onOpenChange={o => !o && setUnlockTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mở khóa tài khoản</DialogTitle>
            <DialogDescription>
              {unlockTarget
                ? `Mở khóa ${unlockTarget.name} (điểm tin cậy ${unlockTarget.reliabilityScore}/100)? Điểm được giữ nguyên — nếu tiếp tục hủy sát giờ, tài khoản sẽ tự khóa lại.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockTarget(null)}>Để sau</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={busy}
              onClick={submitUnlock}
            >
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              <LockOpen className="h-4 w-4 mr-1.5" /> Mở khóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
