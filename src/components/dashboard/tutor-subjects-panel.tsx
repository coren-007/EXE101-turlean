'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { Plus, BookOpen, Trash2, Pencil, Check, Wallet, Search } from 'lucide-react'
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

/**
 * Panel "Môn dạy & giá" trong Trang quản lý gia sư.
 * Sửa tại chỗ — không cần rời trang: danh sách môn hiện có (sửa giá/mô tả inline),
 * thêm môn qua dialog chọn theo nhóm, xóa môn từng dòng.
 */
export function TutorSubjectsPanel() {
  const { user } = useApp()
  const [subjects, setSubjects] = useState<MySubject[]>([])
  const [allSubjects, setAllSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog thêm môn (chọn từ danh sách theo nhóm, kèm giá)
  const [addOpen, setAddOpen] = useState(false)
  const [picked, setPicked] = useState<Record<string, { price: number; description?: string }>>({})
  const [addSearch, setAddSearch] = useState('')
  const [savingAdd, setSavingAdd] = useState(false)

  // Sửa inline từng môn
  const [editId, setEditId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState(0)
  const [editDesc, setEditDesc] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

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
    if (user?.role === 'TUTOR') load()
  }, [user])

  // Lọc môn chưa dạy + theo từ khóa
  const teachingIds = new Set(subjects.map(s => s.subjectId))
  const groupedAvailable = allSubjects
    .filter(s => !teachingIds.has(s.id))
    .filter(s => !addSearch || s.name.toLowerCase().includes(addSearch.toLowerCase()))
    .reduce((acc: any, s: any) => {
      if (!acc[s.category]) acc[s.category] = []
      acc[s.category].push(s)
      return acc
    }, {})

  const togglePick = (id: string) => {
    setPicked(prev => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = { price: 300000 }
      return next
    })
  }

  const handleAdd = async () => {
    const entries = Object.entries(picked)
    if (entries.length === 0) {
      toast.error('Chọn ít nhất một môn để thêm')
      return
    }
    const invalid = entries.find(([, v]) => v.price < 50000)
    if (invalid) {
      toast.error('Giá mỗi môn tối thiểu 50.000đ/giờ')
      return
    }
    setSavingAdd(true)
    try {
      for (const [subjectId, v] of entries) {
        const res = await fetch('/api/tutors/me/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId, pricePerHour: v.price, description: v.description || undefined })
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error)
        }
      }
      toast.success(`Đã thêm ${entries.length} môn dạy`)
      setAddOpen(false)
      setPicked({})
      setAddSearch('')
      load()
    } catch (e: any) {
      toast.error(e.message || 'Thêm môn thất bại')
    } finally {
      setSavingAdd(false)
    }
  }

  const startEdit = (s: MySubject) => {
    setEditId(s.id)
    setEditPrice(s.pricePerHour)
    setEditDesc(s.description || '')
  }

  const handleSaveEdit = async () => {
    if (!editId) return
    if (editPrice < 50000) {
      toast.error('Giá tối thiểu 50.000đ/giờ')
      return
    }
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/tutors/me/subject/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricePerHour: editPrice, description: editDesc })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      toast.success('Đã lưu thay đổi')
      setEditId(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async (s: MySubject) => {
    if (!confirm(`Xóa môn "${s.subject.name}"? Học sinh sẽ không thể đặt lịch môn này với bạn.`)) return
    try {
      await fetch(`/api/tutors/me/subject/${s.id}`, { method: 'DELETE' })
      toast.success(`Đã xóa môn ${s.subject.name}`)
      load()
    } catch {
      toast.error('Xóa thất bại')
    }
  }

  if (loading) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">Đang tải môn dạy...</Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* Mô tả khối */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Môn dạy & học phí
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Học sinh thấy rõ giá từng môn — sửa tại chỗ, thay đổi có hiệu lực ngay trên hồ sơ công khai.
          </p>
        </div>
        <Button className="rounded-full font-semibold" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Thêm môn dạy
        </Button>
      </div>

      {subjects.length === 0 ? (
        <Card className="p-10 text-center rounded-2xl">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-bold mb-1">Chưa có môn dạy nào</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Thêm ít nhất một môn kèm học phí để hồ sơ của bạn xuất hiện trong kết quả tìm kiếm.
          </p>
          <Button className="rounded-full" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Thêm môn đầu tiên
          </Button>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {subjects.map(s => {
            const editing = editId === s.id
            return (
              <Card key={s.id} className={`p-4 rounded-2xl ${editing ? 'ring-2 ring-primary/40' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm">{s.subject.name}</h3>
                      <Badge variant="secondary" className="text-[10px] rounded-full">
                        {CATEGORY_LABELS[s.subject.category] || s.subject.category}
                      </Badge>
                    </div>
                    {!editing ? (
                      <>
                        <p className="text-xl font-extrabold text-primary mt-1.5">
                          {formatVnd(s.pricePerHour)}
                          <span className="text-xs text-muted-foreground font-medium">/giờ</span>
                        </p>
                        {s.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                        )}
                      </>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step={50000}
                            min={50000}
                            value={editPrice}
                            onChange={(e) => setEditPrice(Number(e.target.value))}
                            className="w-32 h-9"
                          />
                          <span className="text-xs text-muted-foreground">VNĐ/giờ</span>
                        </div>
                        <Input
                          placeholder="Mô tả ngắn về môn này (tùy chọn)"
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!editing ? (
                      <>
                        <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={() => startEdit(s)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-lg h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(s)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" className="rounded-lg h-8" onClick={handleSaveEdit} disabled={savingEdit}>
                          <Check className="h-3.5 w-3.5 mr-1" /> {savingEdit ? 'Đang lưu...' : 'Lưu'}
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-lg h-8" onClick={() => setEditId(null)}>
                          Hủy
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Ghi chú minh bạch giá */}
      <Card className="p-4 rounded-2xl bg-muted/40 border-dashed">
        <div className="flex items-start gap-3">
          <Wallet className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold">Học phí minh bạch — 0% phí nền tảng</p>
            <p className="text-muted-foreground text-xs leading-relaxed mt-0.5">
              Giá bạn niêm yết là giá học sinh thấy và trả trực tiếp cho bạn.
              Nền tảng không thu hoa hồng giai đoạn này — không phụ phí ẩn.
              Tham khảo thị trường: tiểu học 120–200k/buổi, THCS 150–250k, THPT & luyện thi 200–400k.
            </p>
          </div>
        </div>
      </Card>

      {/* Dialog thêm môn */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto scroll-area">
          <DialogHeader>
            <DialogTitle>Thêm môn dạy</DialogTitle>
            <DialogDescription>
              Chọn môn bạn dạy và đặt học phí/giờ cho từng môn.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm môn học... (vd: Toán, IELTS, Piano)"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="space-y-4 mt-1">
            {Object.keys(groupedAvailable).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Không còn môn phù hợp — bạn đã dạy tất cả hoặc không tìm thấy kết quả.
              </p>
            ) : (
              Object.entries(groupedAvailable).map(([cat, subs]: [string, any]) => (
                <div key={cat}>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                    {CATEGORY_LABELS[cat] || cat}
                  </h4>
                  <div className="space-y-2">
                    {subs.map((s: any) => {
                      const selected = !!picked[s.id]
                      return (
                        <div
                          key={s.id}
                          className={`rounded-xl border-2 p-3 transition-all ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox checked={selected} onCheckedChange={() => togglePick(s.id)} />
                            <span className="font-semibold text-sm flex-1">{s.name}</span>
                            {selected && (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  step={50000}
                                  min={50000}
                                  value={picked[s.id].price}
                                  onChange={(e) => {
                                    const v = Number(e.target.value)
                                    setPicked(prev => ({ ...prev, [s.id]: { ...prev[s.id], price: v } }))
                                  }}
                                  className="w-28 h-8 text-xs"
                                />
                                <span className="text-xs text-muted-foreground">đ/giờ</span>
                              </div>
                            )}
                          </div>
                          {selected && (
                            <Input
                              placeholder="Mô tả ngắn (tùy chọn)"
                              value={picked[s.id].description || ''}
                              onChange={(e) => {
                                const v = e.target.value
                                setPicked(prev => ({ ...prev, [s.id]: { ...prev[s.id], description: v } }))
                              }}
                              className="mt-2 h-8 text-xs"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="mt-2">
            <div className="flex items-center justify-between w-full gap-3">
              <p className="text-xs text-muted-foreground">
                Đã chọn <span className="font-bold text-foreground">{Object.keys(picked).length}</span> môn
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAddOpen(false)}>Đóng</Button>
                <Button onClick={handleAdd} disabled={savingAdd || Object.keys(picked).length === 0}>
                  {savingAdd ? 'Đang thêm...' : `Thêm ${Object.keys(picked).length || ''} môn`}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
