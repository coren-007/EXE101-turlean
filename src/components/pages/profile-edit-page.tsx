'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ArrowLeft, Save, Home, School, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'

const CITIES = ['Hà Nội', 'TP.HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ']

const CITY_DISTRICTS: Record<string, string[]> = {
  'Hà Nội': ['Cầu Giấy', 'Ba Đình', 'Hoàn Kiếm', 'Đống Đa', 'Hai Bà Trưng', 'Tây Hồ', 'Thanh Xuân', 'Hoàng Mai', 'Long Biên', 'Nam Từ Liêm'],
  'TP.HCM': ['Quận 1', 'Quận 3', 'Quận 5', 'Quận 7', 'Quận 10', 'Quận Bình Thạnh', 'Quận Phú Nhuận', 'Thành phố Thủ Đức', 'Quận Tân Bình', 'Quận Gò Vấp'],
  'Đà Nẵng': ['Hải Châu', 'Thanh Khê', 'Sơn Trà', 'Ngũ Hành Sơn', 'Cẩm Lệ'],
  'Hải Phòng': ['Lê Chân', 'Ngô Quyền', 'Hồng Bàng', 'Kiến An'],
  'Cần Thơ': ['Ninh Kiều', 'Bình Thủy', 'Cái Răng'],
}

export function ProfileEditPage() {
  const { user, navigate, setUser } = useApp()
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setForm(data.user)
        }
      })
  }, [])

  if (!user) {
    return (
      <div className="container mx-auto max-w-md py-16 text-center">
        <h2 className="text-2xl font-bold mb-2">Cần đăng nhập</h2>
        <Button onClick={() => navigate({ name: 'login' })}>Đăng nhập</Button>
      </div>
    )
  }

  const isTutor = user.role === 'TUTOR'

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (data.user) {
        setUser({
          ...user,
          name: data.user.name,
        })
      }
      toast.success('Đã lưu thông tin')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const update = (k: string, v: any) => setForm((prev: any) => ({ ...prev, [k]: v }))

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate({ name: 'dashboard' })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Quay lại
      </Button>

      <h1 className="text-2xl font-bold mb-6">Hồ sơ của tôi</h1>

      <div className="space-y-6">
        {/* Basic info */}
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4">Thông tin cơ bản</h2>

          <div className="flex items-center gap-4 mb-4">
            <Avatar className="h-16 w-16 rounded-xl">
              <AvatarImage src={form.avatar || undefined} alt={form.name} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {form.name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{form.name}</p>
              <p className="text-xs text-muted-foreground">{form.email}</p>
              <Badge variant="outline" className="mt-1 text-[10px]">
                {isTutor ? 'Gia sư' : 'Phụ huynh/Học sinh'}
              </Badge>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Họ và tên</Label>
              <Input id="name" value={form.name || ''} onChange={(e) => update('name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input id="phone" value={form.phone || ''} onChange={(e) => update('phone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Tỉnh/Thành phố</Label>
              <select
                id="city"
                value={form.city || 'Hà Nội'}
                onChange={(e) => { update('city', e.target.value); update('district', '') }}
                className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
              >
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="district">Quận/Huyện</Label>
              <select
                id="district"
                value={form.district || ''}
                onChange={(e) => update('district', e.target.value)}
                className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
              >
                <option value="">Chọn quận</option>
                {(CITY_DISTRICTS[form.city || 'Hà Nội'] || []).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Địa chỉ</Label>
              <Input id="address" value={form.address || ''} onChange={(e) => update('address', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <Label htmlFor="bio">Giới thiệu</Label>
            <Textarea
              id="bio"
              rows={4}
              placeholder={isTutor ? 'Giới thiệu về bản thân, phương pháp giảng dạy...' : 'Giới thiệu về gia đình, nhu cầu học...'}
              value={form.bio || ''}
              onChange={(e) => update('bio', e.target.value)}
            />
          </div>
        </Card>

        {/* Tutor-specific */}
        {isTutor && (
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-4">Thông tin gia sư</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="profession">Chuyên môn</Label>
                <Input id="profession" placeholder="vd: Giáo viên Toán THPT" value={form.profession || ''} onChange={(e) => update('profession', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="experienceYears">Số năm kinh nghiệm</Label>
                <Input id="experienceYears" type="number" value={form.experienceYears || ''} onChange={(e) => update('experienceYears', Number(e.target.value))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="education">Học vấn</Label>
                <Input id="education" placeholder="vd: Thạc sĩ Toán - ĐH Sư phạm" value={form.education || ''} onChange={(e) => update('education', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourlyRate">Học phí/giờ (VND)</Label>
                <Input id="hourlyRate" type="number" step="50000" value={form.hourlyRate || ''} onChange={(e) => update('hourlyRate', Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="travelRadiusKm">Bán kính di chuyển (km)</Label>
                <Input id="travelRadiusKm" type="number" value={form.travelRadiusKm ?? ''} onChange={(e) => update('travelRadiusKm', Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-3 mt-4">
              <Label className="text-sm font-semibold">Phương thức dạy</Label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.teachesAtStudentHome || false}
                  onCheckedChange={(v) => update('teachesAtStudentHome', v)}
                />
                <Home className="h-4 w-4 text-primary" />
                <span className="text-sm">Gia sư đến nhà học sinh</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.teachesAtOwnPlace || false}
                  onCheckedChange={(v) => update('teachesAtOwnPlace', v)}
                />
                <School className="h-4 w-4 text-violet-600" />
                <span className="text-sm">Học sinh đến cơ sở</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.teachesOnline || false}
                  onCheckedChange={(v) => update('teachesOnline', v)}
                />
                <MessageSquare className="h-4 w-4 text-emerald-600" />
                <span className="text-sm">Học trực tuyến</span>
              </label>
            </div>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate({ name: 'dashboard' })}>Hủy</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </div>
      </div>
    </div>
  )
}
