'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Briefcase, GraduationCap, Home, School, MessageSquare, MapPin,
  ArrowRight, ArrowLeft, CheckCircle2, Plus, Trash2, Clock,
  Sparkles, BookOpen, Calendar, Wallet, Star
} from 'lucide-react'
import { toast } from 'sonner'
import { formatVnd } from '@/lib/format'

const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const TIME_PRESETS = ['06:00', '08:00', '10:00', '14:00', '16:00', '18:00', '20:00']

const CITIES = ['Hà Nội', 'TP.HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ']

const CITY_DISTRICTS: Record<string, string[]> = {
  'Hà Nội': ['Cầu Giấy', 'Ba Đình', 'Hoàn Kiếm', 'Đống Đa', 'Hai Bà Trưng', 'Tây Hồ', 'Thanh Xuân', 'Hoàng Mai', 'Long Biên', 'Nam Từ Liêm'],
  'TP.HCM': ['Quận 1', 'Quận 3', 'Quận 5', 'Quận 7', 'Quận 10', 'Quận Bình Thạnh', 'Quận Phú Nhuận', 'Thành phố Thủ Đức', 'Quận Tân Bình', 'Quận Gò Vấp'],
  'Đà Nẵng': ['Hải Châu', 'Thanh Khê', 'Sơn Trà', 'Ngũ Hành Sơn', 'Cẩm Lệ'],
  'Hải Phòng': ['Lê Chân', 'Ngô Quyền', 'Hồng Bàng', 'Kiến An'],
  'Cần Thơ': ['Ninh Kiều', 'Bình Thủy', 'Cái Răng'],
}

export function OnboardingPage() {
  const { user, navigate, setUser } = useApp()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1: professional info
  const [profession, setProfession] = useState(user?.role === 'TUTOR' ? '' : '')
  const [experienceYears, setExperienceYears] = useState<number | ''>('')
  const [education, setEducation] = useState('')
  const [bio, setBio] = useState('')

  // Step 2: subjects
  const [allSubjects, setAllSubjects] = useState<any[]>([])
  const [mySubjects, setMySubjects] = useState<Record<string, { price: number; description?: string }>>({})

  // Step 3: modes + availability
  const [teachesAtStudentHome, setTeachesAtStudentHome] = useState(true)
  const [teachesAtOwnPlace, setTeachesAtOwnPlace] = useState(true)
  const [teachesOnline, setTeachesOnline] = useState(false)
  const [travelRadiusKm, setTravelRadiusKm] = useState<number | ''>(5)
  const [city, setCity] = useState('Hà Nội')
  const [district, setDistrict] = useState('')
  const [address, setAddress] = useState('')
  const [slots, setSlots] = useState<{ dayOfWeek: number; startTime: string; endTime: string }[]>([])

  useEffect(() => {
    fetch('/api/subjects').then(r => r.json()).then(setAllSubjects)
    // Pre-load existing profile data
    fetch('/api/me').then(r => r.json()).then(data => {
      if (data.user) {
        setProfession(data.user.profession || '')
        setExperienceYears(data.user.experienceYears || '')
        setEducation(data.user.education || '')
        setBio(data.user.bio || '')
        setTeachesAtStudentHome(data.user.teachesAtStudentHome)
        setTeachesAtOwnPlace(data.user.teachesAtOwnPlace)
        setTeachesOnline(data.user.teachesOnline)
        setTravelRadiusKm(data.user.travelRadiusKm ?? 5)
        setCity(data.user.city || 'Hà Nội')
        setDistrict(data.user.district || '')
        setAddress(data.user.address || '')
      }
    })
    fetch('/api/tutors/me/subjects').then(r => r.json()).then(data => {
      const map: Record<string, { price: number; description?: string }> = {}
      ;(data.subjects || []).forEach((s: any) => {
        map[s.subjectId] = { price: s.pricePerHour, description: s.description || '' }
      })
      setMySubjects(map)
    })
    fetch('/api/tutors/me/availability').then(r => r.json()).then(data => {
      setSlots((data.availability || []).map((s: any) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })))
    })
  }, [])

  if (!user || user.role !== 'TUTOR') {
    return (
      <div className="container mx-auto max-w-md py-16 text-center">
        <h2 className="text-2xl font-bold mb-2">Cần đăng nhập tài khoản gia sư</h2>
        <Button onClick={() => navigate({ name: 'login' })}>Đăng nhập</Button>
      </div>
    )
  }

  const totalSteps = 3
  const canNext = () => {
    if (step === 1) return profession && education && bio.length > 20
    if (step === 2) return Object.keys(mySubjects).length > 0
    if (step === 3) return (teachesAtStudentHome || teachesAtOwnPlace || teachesOnline) && district
    return false
  }

  const saveStep1 = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profession, experienceYears: experienceYears || null, education, bio }),
      })
      if (!res.ok) throw new Error('Lưu thất bại')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const saveStep2 = async () => {
    setSaving(true)
    try {
      // Get current subjects and sync
      const current = await fetch('/api/tutors/me/subjects').then(r => r.json())
      const currentIds = (current.subjects || []).map((s: any) => s.subjectId)
      const newIds = Object.keys(mySubjects)

      // Add new
      for (const sid of newIds.filter(id => !currentIds.includes(id))) {
        await fetch('/api/tutors/me/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId: sid, pricePerHour: mySubjects[sid].price, description: mySubjects[sid].description })
        })
      }
      // Update existing
      for (const s of current.subjects || []) {
        if (mySubjects[s.subjectId] && (
          mySubjects[s.subjectId].price !== s.pricePerHour ||
          (mySubjects[s.subjectId].description || '') !== (s.description || '')
        )) {
          await fetch(`/api/tutors/me/subject/${s.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pricePerHour: mySubjects[s.subjectId].price, description: mySubjects[s.subjectId].description })
          })
        }
      }
      // Remove deleted
      for (const s of current.subjects || []) {
        if (!mySubjects[s.subjectId]) {
          await fetch(`/api/tutors/me/subject/${s.id}`, { method: 'DELETE' })
        }
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const saveStep3 = async () => {
    setSaving(true)
    try {
      // Update profile
      await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teachesAtStudentHome,
          teachesAtOwnPlace,
          teachesOnline,
          travelRadiusKm: travelRadiusKm || null,
          city,
          district,
          address,
        }),
      })

      // Sync availability
      const current = await fetch('/api/tutors/me/availability').then(r => r.json())
      for (const slot of current.availability || []) {
        await fetch(`/api/tutors/me/availability/${slot.id}`, { method: 'DELETE' })
      }
      for (const slot of slots) {
        await fetch('/api/tutors/me/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slot),
        })
      }

      toast.success('Hoàn tất thiết lập hồ sơ!')
      navigate({ name: 'dashboard' })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleNext = async () => {
    if (step === 1) await saveStep1()
    else if (step === 2) await saveStep2()
    else if (step === 3) return saveStep3()
    setStep(s => Math.min(totalSteps, s + 1))
    window.scrollTo({ top: 0 })
  }

  const toggleSubject = (id: string) => {
    setMySubjects(prev => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = { price: 300000 }
      return next
    })
  }

  const groupedSubjects = allSubjects.reduce((acc: any, s: any) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {})

  const CATEGORY_LABELS: Record<string, string> = {
    STEM: 'Khoa học tự nhiên',
    LANGUAGE: 'Ngoại ngữ',
    ART: 'Nghệ thuật',
    OTHER: 'Khác',
  }

  const toggleSlot = (dayOfWeek: number, startTime: string) => {
    setSlots(prev => {
      const exists = prev.find(s => s.dayOfWeek === dayOfWeek && s.startTime === startTime)
      if (exists) return prev.filter(s => !(s.dayOfWeek === dayOfWeek && s.startTime === startTime))
      // Find end time (2 hours later)
      const startH = parseInt(startTime.split(':')[0])
      const endH = startH + 2
      const endTime = `${String(endH).padStart(2, '0')}:00`
      return [...prev, { dayOfWeek, startTime, endTime }]
    })
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            Thiết lập hồ sơ gia sư
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">Hoàn thiện hồ sơ để bắt đầu nhận học sinh</h1>
          <p className="text-sm text-muted-foreground mt-1">Hồ sơ càng chi tiết, cơ hội được đặt lịch càng cao</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                s < step ? 'bg-primary text-primary-foreground' :
                s === step ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                'bg-muted text-muted-foreground'
              }`}>
                {s < step ? <CheckCircle2 className="h-5 w-5" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${s < step ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        <Card className="p-6 md:p-8">
          {/* STEP 1: PROFESSIONAL INFO */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Thông tin chuyên môn</h2>
              </div>
              <p className="text-sm text-muted-foreground">Đây là thông tin LinkedIn-style hiển thị trên profile công khai của bạn.</p>

              <div className="space-y-2">
                <Label htmlFor="profession">Chức danh chuyên môn *</Label>
                <Input
                  id="profession"
                  placeholder="vd: Giáo viên Toán - Trường THPT Chuyên KHTN"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="education">Học vấn *</Label>
                  <Input
                    id="education"
                    placeholder="vd: Thạc sĩ Toán - ĐH Sư phạm HN"
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experience">Số năm kinh nghiệm</Label>
                  <Input
                    id="experience"
                    type="number"
                    min={0}
                    max={50}
                    placeholder="vd: 5"
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value ? Number(e.target.value) : '')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Giới thiệu bản thân * <span className="text-xs text-muted-foreground">(tối thiểu 20 ký tự)</span></Label>
                <Textarea
                  id="bio"
                  rows={5}
                  placeholder="Mô tả phương pháp giảng dạy, kinh nghiệm, điểm mạnh... Phụ huynh sẽ đọc phần này để quyết định chọn bạn."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{bio.length} ký tự</p>
              </div>
            </div>
          )}

          {/* STEP 2: SUBJECTS */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Môn học bạn dạy</h2>
              </div>
              <p className="text-sm text-muted-foreground">Chọn các môn bạn muốn dạy và đặt giá học phí/giờ cho từng môn.</p>

              {Object.keys(groupedSubjects).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Đang tải danh sách môn học...</div>
              ) : (
                Object.entries(groupedSubjects).map(([cat, subs]: [string, any]) => (
                  <div key={cat}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {CATEGORY_LABELS[cat] || cat}
                    </h3>
                    <div className="space-y-2">
                      {subs.map((s: any) => {
                        const selected = !!mySubjects[s.id]
                        return (
                          <div
                            key={s.id}
                            className={`rounded-xl border-2 p-3 transition-all ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={selected}
                                onCheckedChange={() => toggleSubject(s.id)}
                              />
                              <span className="font-medium text-sm flex-1">{s.name}</span>
                              {selected && (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step={50000}
                                    min={50000}
                                    placeholder="Giá/giờ"
                                    value={mySubjects[s.id].price}
                                    onChange={(e) => {
                                      const v = Number(e.target.value)
                                      setMySubjects(prev => ({
                                        ...prev,
                                        [s.id]: { ...prev[s.id], price: v }
                                      }))
                                    }}
                                    className="w-28 h-8 text-xs"
                                  />
                                  <span className="text-xs text-muted-foreground">VNĐ</span>
                                </div>
                              )}
                            </div>
                            {selected && (
                              <Input
                                placeholder="Mô tả ngắn về môn này (tùy chọn)"
                                value={mySubjects[s.id].description || ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setMySubjects(prev => ({
                                    ...prev,
                                    [s.id]: { ...prev[s.id], description: v }
                                  }))
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

              <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-semibold mb-1">💡 Mẹo định giá:</p>
                <p>Giá trung bình cho gia sư có kinh nghiệm 5+ năm là 300.000-500.000đ/giờ. Native speaker hoặc Tiến sĩ có thể đặt giá 600.000đ+.</p>
              </div>
            </div>
          )}

          {/* STEP 3: TEACHING MODES + AVAILABILITY */}
          {step === 3 && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Phương thức & lịch dạy</h2>
              </div>
              <p className="text-sm text-muted-foreground">Đặc biệt: bạn có thể chọn nhiều phương thức dạy. Học sinh sẽ thấy option phù hợp.</p>

              {/* Modes */}
              <div>
                <Label className="text-sm font-semibold mb-3 block">Phương thức dạy *</Label>
                <div className="grid sm:grid-cols-3 gap-2">
                  <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${teachesAtStudentHome ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Checkbox checked={teachesAtStudentHome} onCheckedChange={(v) => setTeachesAtStudentHome(v === true)} />
                      <Home className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-sm font-semibold">Đến nhà HS</p>
                    <p className="text-[10px] text-muted-foreground">Tôi di chuyển</p>
                  </label>
                  <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${teachesAtOwnPlace ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Checkbox checked={teachesAtOwnPlace} onCheckedChange={(v) => setTeachesAtOwnPlace(v === true)} />
                      <School className="h-4 w-4 text-violet-600" />
                    </div>
                    <p className="text-sm font-semibold">Tại cơ sở</p>
                    <p className="text-[10px] text-muted-foreground">HS đến tôi</p>
                  </label>
                  <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${teachesOnline ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Checkbox checked={teachesOnline} onCheckedChange={(v) => setTeachesOnline(v === true)} />
                      <MessageSquare className="h-4 w-4 text-emerald-600" />
                    </div>
                    <p className="text-sm font-semibold">Online</p>
                    <p className="text-[10px] text-muted-foreground">Zoom/Meet</p>
                  </label>
                </div>
              </div>

              {/* Location */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Tỉnh/Thành *</Label>
                  <select
                    id="city"
                    value={city}
                    onChange={(e) => { setCity(e.target.value); setDistrict('') }}
                    className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
                  >
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="district">Quận *</Label>
                  <select
                    id="district"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
                  >
                    <option value="">Chọn quận</option>
                    {(CITY_DISTRICTS[city] || []).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                {teachesAtStudentHome && (
                  <div className="space-y-2">
                    <Label htmlFor="radius">Bán kính di chuyển (km)</Label>
                    <Input
                      id="radius"
                      type="number"
                      min={1}
                      max={30}
                      value={travelRadiusKm}
                      onChange={(e) => setTravelRadiusKm(e.target.value ? Number(e.target.value) : '')}
                    />
                  </div>
                )}
              </div>

              {teachesAtOwnPlace && (
                <div className="space-y-2">
                  <Label htmlFor="address">Địa chỉ cơ sở dạy</Label>
                  <Input
                    id="address"
                    placeholder="Số nhà, đường, quận..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Học sinh sẽ thấy địa chỉ này khi đặt lịch "tại cơ sở"</p>
                </div>
              )}

              {/* Availability grid */}
              <div>
                <Label className="text-sm font-semibold mb-3 block flex items-center gap-1">
                  <Calendar className="h-4 w-4" /> Lịch trống trong tuần
                </Label>
                <div className="overflow-x-auto scroll-area">
                  <div className="min-w-[600px]">
                    <div className="grid grid-cols-8 gap-1 mb-1">
                      <div className="text-[10px] text-muted-foreground text-center">Giờ</div>
                      {DAY_NAMES.map(d => (
                        <div key={d} className="text-[10px] font-semibold text-center py-1">
                          {d === 'Chủ nhật' ? 'CN' : d.replace('Thứ ', 'T')}
                        </div>
                      ))}
                    </div>
                    {TIME_PRESETS.map(t => (
                      <div key={t} className="grid grid-cols-8 gap-1 mb-1">
                        <div className="text-[10px] text-muted-foreground text-center flex items-center justify-center">
                          {t}
                        </div>
                        {DAY_NAMES.map((_, dayIdx) => {
                          const active = slots.some(s => s.dayOfWeek === dayIdx && s.startTime === t)
                          return (
                            <button
                              key={dayIdx}
                              onClick={() => toggleSlot(dayIdx, t)}
                              className={`h-9 rounded-md text-[10px] font-medium transition-colors ${
                                active
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted hover:bg-primary/10 text-muted-foreground'
                              }`}
                            >
                              {active ? <CheckCircle2 className="h-3.5 w-3.5 mx-auto" /> : '+'}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Đã chọn {slots.length} slot. Bấm vào ô để thêm/bỏ lịch trống.
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t">
            {step > 1 ? (
              <Button variant="ghost" onClick={() => { setStep(s => s - 1); window.scrollTo({ top: 0 }) }}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Quay lại
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => navigate({ name: 'dashboard' })}>
                Bỏ qua sau
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canNext() || saving}
              className="min-w-[140px]"
            >
              {saving ? 'Đang lưu...' : (
                step === 3 ? (
                  <>Hoàn tất <CheckCircle2 className="h-4 w-4 ml-1" /></>
                ) : (
                  <>Tiếp theo <ArrowRight className="h-4 w-4 ml-1" /></>
                )
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
