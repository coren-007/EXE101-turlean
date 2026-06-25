'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { ArrowLeft, Plus, BookOpen, Trash2, Pencil, Check, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { formatVnd } from '@/lib/format'

interface MySubject {
  id: string
  subjectId: string
  pricePerHour: number
  description?: string | null
  subject: { id: string; name: string; slug: string; category: string }
}

const CATEGORY_LABELS: Record<string, string> = {
  STEM: 'Khoa học tự nhiên',
  LANGUAGE: 'Ngoại ngữ',
  ART: 'Nghệ thuật',
  OTHER: 'Khác',
}

export function ManageSubjectsPage() {
  const { user, navigate } = useApp()
  const [subjects, setSubjects] = useState<MySubject[]>([])
  const [allSubjects, setAllSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MySubject | null>(null)

  // Add form
  const [newSubjectId, setNewSubjectId] = useState('')
  const [newPrice, setNewPrice] = useState(300000)
  const [newDesc, setNewDesc] = useState('')

  // Edit form
  const [editPrice, setEditPrice] = useState(0)
  const [editDesc, setEditDesc] = useState('')

  const load = async () => {
    const [mine, all] = await Promise.all([
      fetch('/api/tutors/me/subjects').then(r => r.json()),
      fetch('/api/subjects').then(r => r.json()),
    ])
    setSubjects(mine.subjects || [])
    setAllSubjects(all || [])
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
    if (!newSubjectId || newPrice < 50000) {
      toast.error('Vui lòng chọn môn và giá tối thiểu 50.000đ')
      return
    }
    try {
      const res = await fetch('/api/tutors/me/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: newSubjectId, pricePerHour: newPrice, description: newDesc })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Đã thêm môn học')
      setAddOpen(false)
      setNewSubjectId('')
      setNewPrice(300000)
      setNewDesc('')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleEdit = async () => {
    if (!editTarget) return
    try {
      const res = await fetch(`/api/tutors/me/subject/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricePerHour: editPrice, description: editDesc })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      toast.success('Đã cập nhật')
      setEditTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleDelete = async (s: MySubject) => {
    if (!confirm(`Xóa môn "${s.subject.name}"? Học sinh sẽ không thể đặt lịch môn này với bạn.`)) return
    try {
      const res = await fetch(`/api/tutors/me/subject/${s.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Xóa thất bại')
      toast.success('Đã xóa môn học')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const openEdit = (s: MySubject) => {
    setEditTarget(s)
    setEditPrice(s.pricePerHour)
    setEditDesc(s.description || '')
  }

  const availableToAdd = allSubjects.filter(s => !subjects.some(ms => ms.subjectId === s.id))

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate({ name: 'dashboard' })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Bảng điều khiển
      </Button>

      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Quản lý môn dạy
          </h1>
          <p className="text-sm text-muted-foreground">Thêm, sửa giá, hoặc xóa các môn bạn dạy</p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={availableToAdd.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Thêm môn học
        </Button>
      </div>

      {loading ? (
        <Card className="p-12 text-center">
          <div className="text-sm text-muted-foreground">Đang tải...</div>
        </Card>
      ) : subjects.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Bạn chưa có môn dạy nào</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Thêm môn học để học sinh có thể tìm và đặt lịch với bạn
          </p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Thêm môn đầu tiên
          </Button>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {subjects.map(s => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{s.subject.name}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {CATEGORY_LABELS[s.subject.category] || s.subject.category}
                    </Badge>
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Học phí</p>
                  <p className="text-lg font-bold text-primary flex items-center gap-1">
                    <Wallet className="h-4 w-4" /> {formatVnd(s.pricePerHour)}
                    <span className="text-xs font-normal text-muted-foreground">/giờ</span>
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(s)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm môn dạy</DialogTitle>
            <DialogDescription>Chọn môn học và đặt giá học phí/giờ</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Môn học</Label>
              <select
                value={newSubjectId}
                onChange={(e) => setNewSubjectId(e.target.value)}
                className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
              >
                <option value="">-- Chọn môn --</option>
                {availableToAdd.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({CATEGORY_LABELS[s.category] || s.category})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Học phí (VNĐ/giờ)</Label>
              <Input
                type="number"
                step={50000}
                min={50000}
                value={newPrice}
                onChange={(e) => setNewPrice(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">{formatVnd(newPrice)} - Tối thiểu 50.000đ</p>
            </div>
            <div className="space-y-2">
              <Label>Mô tả (tùy chọn)</Label>
              <Textarea
                rows={3}
                placeholder="Mô tả ngắn về kinh nghiệm, phương pháp dạy môn này..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Hủy</Button>
            <Button onClick={handleAdd}>Thêm môn</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa môn {editTarget?.subject.name}</DialogTitle>
            <DialogDescription>Cập nhật giá và mô tả</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Học phí (VNĐ/giờ)</Label>
              <Input
                type="number"
                step={50000}
                min={50000}
                value={editPrice}
                onChange={(e) => setEditPrice(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">{formatVnd(editPrice)}</p>
            </div>
            <div className="space-y-2">
              <Label>Mô tả</Label>
              <Textarea
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Hủy</Button>
            <Button onClick={handleEdit}><Check className="h-4 w-4 mr-1" /> Lưu thay đổi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
