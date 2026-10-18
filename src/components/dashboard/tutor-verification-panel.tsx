'use client'

// P6 — Panel "Xác minh" trong Tutor Studio: gia sư gửi bằng cấp/chứng chỉ
// (ảnh hoặc PDF ≤ 5MB) để admin duyệt ⇒ badge "Đã xác minh" trên hồ sơ công khai.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  BadgeCheck, ShieldCheck, FileText, ImageIcon, Upload, Loader2,
  CheckCircle2, XCircle, Clock3, Trash2, Info
} from 'lucide-react'
import { toast } from 'sonner'

interface VerificationRequest {
  id: string
  kind: string
  fileName: string
  fileType: string
  fileSize: number
  note: string | null
  status: string
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
}

const KINDS = [
  { id: 'DEGREE', label: 'Bằng cấp', hint: 'Bằng Cử nhân/Thạc sĩ/Tiến sĩ, bằng tốt nghiệp…' },
  { id: 'CERTIFICATE', label: 'Chứng chỉ', hint: 'IELTS/TOEIC, chứng chỉ sư phạm, giáo dục đặc biệt…' },
  { id: 'ID_CARD', label: 'Giấy tờ tùy thân', hint: 'CCCD/CMND (che bớt thông tin nhạy cảm nếu muốn)' },
] as const

const REQ_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Chờ admin duyệt', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Đã duyệt', className: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Bị từ chối', className: 'bg-rose-100 text-rose-700' },
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

export function TutorVerificationPanel() {
  const { user } = useApp()
  const [loading, setLoading] = useState(true)
  const [isVerified, setIsVerified] = useState(false)
  const [requests, setRequests] = useState<VerificationRequest[]>([])

  // Form
  const [kind, setKind] = useState<string>('DEGREE')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Dialog rút yêu cầu
  const [withdrawTarget, setWithdrawTarget] = useState<VerificationRequest | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutors/me/verification')
      if (res.ok) {
        const data = await res.json()
        setRequests(data.requests ?? [])
        setIsVerified(!!data.isVerified)
      }
    } catch {
      toast.error('Không tải được dữ liệu xác minh')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const pendingKinds = new Set(
    requests.filter(r => r.status === 'PENDING').map(r => r.kind),
  )

  const submit = async () => {
    if (!file) {
      toast.error('Vui lòng chọn tệp bằng cấp/chứng chỉ')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Tệp quá lớn — tối đa 5MB')
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('kind', kind)
      if (note.trim()) form.append('note', note.trim())
      form.append('file', file)
      const res = await fetch('/api/tutors/me/verification', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Không gửi được yêu cầu')
        return
      }
      toast.success(data.message || 'Đã gửi yêu cầu xác minh')
      setFile(null)
      setNote('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await load()
    } catch {
      toast.error('Lỗi kết nối')
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    if (!withdrawTarget) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tutors/me/verification?id=${withdrawTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Không rút được yêu cầu')
        return
      }
      toast.success(data.message || 'Đã rút lại yêu cầu')
      setWithdrawTarget(null)
      await load()
    } catch {
      toast.error('Lỗi kết nối')
    } finally {
      setBusy(false)
    }
  }

  const selectedKind = KINDS.find(k => k.id === kind)

  return (
    <div className="space-y-6">
      {/* Trạng thái hiện tại */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          {isVerified ? (
            <>
              <BadgeCheck className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="font-bold text-emerald-700">Hồ sơ đã được xác minh</p>
                <p className="text-sm text-muted-foreground">
                  Badge “Đã xác minh” hiển thị trên hồ sơ công khai và kết quả tìm kiếm.
                </p>
              </div>
            </>
          ) : (
            <>
              <ShieldCheck className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-bold">Chưa được xác minh</p>
                <p className="text-sm text-muted-foreground">
                  Gửi bằng cấp/chứng chỉ để được duyệt — gia sư đã xác minh đáng tin cậy hơn với phụ huynh.
                </p>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Form gửi yêu cầu */}
      <Card className="p-5">
        <h2 className="font-bold mb-1">Gửi giấy tờ xác minh</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Ảnh chụp hoặc PDF, tối đa 5MB. Chỉ quản trị viên được xem — không hiển thị công khai.
        </p>

        <div className="space-y-4">
          {/* Loại giấy tờ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {KINDS.map(k => {
              const disabled = pendingKinds.has(k.id)
              return (
                <button
                  key={k.id}
                  disabled={disabled}
                  onClick={() => setKind(k.id)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    kind === k.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/40'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={disabled ? 'Bạn đã có yêu cầu loại này đang chờ duyệt' : undefined}
                >
                  <p className="font-semibold text-sm">{k.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{k.hint}</p>
                  {disabled && (
                    <p className="text-[11px] text-amber-600 font-semibold mt-1">Đang chờ duyệt</p>
                  )}
                </button>
              )
            })}
          </div>

          {/* Chọn tệp */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">Tệp bằng cấp/chứng chỉ</label>
            <div
              className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors p-5 text-center cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const f = e.dataTransfer.files?.[0]
                if (f) setFile(f)
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                  {file.type.startsWith('image/') ? <ImageIcon className="h-5 w-5 text-primary" /> : <FileText className="h-5 w-5 text-primary" />}
                  {file.name} · {fmtSize(file.size)}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground flex flex-col items-center gap-1">
                  <Upload className="h-6 w-6 mb-1" />
                  Bấm để chọn hoặc kéo thả ảnh (PNG/JPG/WebP) hoặc PDF — tối đa 5MB
                </div>
              )}
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">Ghi chú cho quản trị viên (không bắt buộc)</label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={selectedKind ? `vd: ${selectedKind.hint}` : ''}
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={submit} disabled={busy || !file || pendingKinds.has(kind)}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
              Gửi yêu cầu xác minh
            </Button>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3.5 w-3.5" /> Thường được duyệt trong 48 giờ làm việc
            </p>
          </div>
        </div>
      </Card>

      {/* Danh sách yêu cầu đã gửi */}
      <Card className="p-5">
        <h2 className="font-bold mb-4">Yêu cầu đã gửi ({requests.length})</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tải…
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Bạn chưa gửi giấy tờ nào — gửi ngay để tăng độ tin cậy của hồ sơ.
          </p>
        ) : (
          <div className="divide-y">
            {requests.map(r => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm">{KINDS.find(k => k.id === r.kind)?.label ?? r.kind}</p>
                    <Badge className={`${REQ_STATUS[r.status]?.className ?? ''} hover:${REQ_STATUS[r.status]?.className}`}>
                      {REQ_STATUS[r.status]?.label ?? r.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      {r.fileType.startsWith('image/') ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                      {r.fileName} · {fmtSize(r.fileSize)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" /> {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                  {r.status === 'APPROVED' && (
                    <p className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Đã duyệt — hồ sơ đang hiển thị badge xác minh
                    </p>
                  )}
                  {r.status === 'REJECTED' && (
                    <p className="text-xs text-rose-600 mt-1 flex items-start gap-1">
                      <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Bị từ chối{r.reviewNote ? `: ${r.reviewNote}` : ''} — bạn có thể gửi lại giấy tờ khác.</span>
                    </p>
                  )}
                  {r.note && r.status === 'PENDING' && (
                    <p className="text-xs text-muted-foreground mt-1">Ghi chú của bạn: “{r.note}”</p>
                  )}
                </div>
                {r.status === 'PENDING' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setWithdrawTarget(r)}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" /> Rút lại
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Dialog xác nhận rút lại */}
      <Dialog open={!!withdrawTarget} onOpenChange={o => !o && setWithdrawTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rút lại yêu cầu xác minh?</DialogTitle>
            <DialogDescription>
              Yêu cầu “{KINDS.find(k => k.id === withdrawTarget?.kind)?.label ?? ''}” sẽ bị xóa và không thể khôi phục.
              Bạn có thể gửi lại giấy tờ khác ngay sau đó.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawTarget(null)}>Giữ lại</Button>
            <Button variant="destructive" disabled={busy} onClick={withdraw}>
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              <Trash2 className="h-4 w-4 mr-1.5" /> Rút lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
