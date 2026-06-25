'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { GraduationCap, Mail, Lock, User, Phone, MapPin, Home, School, Briefcase, BookOpen } from 'lucide-react'
import { toast } from 'sonner'

const CITIES = ['Hà Nội', 'TP.HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ']

const CITY_DISTRICTS: Record<string, string[]> = {
  'Hà Nội': ['Cầu Giấy', 'Ba Đình', 'Hoàn Kiếm', 'Đống Đa', 'Hai Bà Trưng', 'Tây Hồ', 'Thanh Xuân', 'Hoàng Mai', 'Long Biên', 'Nam Từ Liêm'],
  'TP.HCM': ['Quận 1', 'Quận 3', 'Quận 5', 'Quận 7', 'Quận 10', 'Quận Bình Thạnh', 'Quận Phú Nhuận', 'Thành phố Thủ Đức', 'Quận Tân Bình', 'Quận Gò Vấp'],
  'Đà Nẵng': ['Hải Châu', 'Thanh Khê', 'Sơn Trà', 'Ngũ Hành Sơn', 'Cẩm Lệ'],
  'Hải Phòng': ['Lê Chân', 'Ngô Quyền', 'Hồng Bàng', 'Kiến An'],
  'Cần Thơ': ['Ninh Kiều', 'Bình Thủy', 'Cái Răng'],
}

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Hà Nội': { lat: 21.0285, lng: 105.8542 },
  'TP.HCM': { lat: 10.7769, lng: 106.7009 },
  'Đà Nẵng': { lat: 16.0544, lng: 108.2022 },
  'Hải Phòng': { lat: 20.8449, lng: 106.6881 },
  'Cần Thơ': { lat: 10.0452, lng: 105.7469 },
}

export function AuthPage({ initialMode }: { initialMode: 'login' | 'register' }) {
  const { navigate, setUser } = useApp()
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [role, setRole] = useState<'STUDENT' | 'TUTOR'>('STUDENT')
  const [loading, setLoading] = useState(false)

  // Login state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register state
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regCity, setRegCity] = useState('Hà Nội')
  const [regDistrict, setRegDistrict] = useState('')
  const [regAddress, setRegAddress] = useState('')

  // Reset district when city changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegDistrict('')
  }, [regCity])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(initialMode)
  }, [initialMode])

  // Fill demo credentials helper
  const fillDemo = (type: 'tutor' | 'student') => {
    setLoginEmail(type === 'tutor' ? 'minhanh.tutor@example.com' : 'hoa.parent@example.com')
    setLoginPassword('123456')
  }

  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) {
      toast.error('Vui lòng nhập email và mật khẩu')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setUser(data)
      toast.success(`Chào mừng ${data.name}!`)
      navigate({ name: 'dashboard' })
    } catch (e: any) {
      toast.error(e.message || 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!regName || !regEmail || !regPassword) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }
    if (regPassword.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự')
      return
    }

    setLoading(true)
    try {
      // Get coordinates from city
      const coords = CITY_COORDS[regCity] || { lat: 16.0, lng: 106.0 }
      // Add small offset per district (deterministic)
      const districtIdx = regDistrict ? (CITY_DISTRICTS[regCity] || []).indexOf(regDistrict) : 0
      const offsetLat = (districtIdx - 4) * 0.008
      const offsetLng = (districtIdx - 4) * 0.008

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          role,
          phone: regPhone,
          district: regDistrict,
          city: regCity,
          address: regAddress,
          lat: coords.lat + offsetLat,
          lng: coords.lng + offsetLng,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setUser(data)
      toast.success(`Đăng ký thành công! Chào mừng ${data.name}`)
      // New tutors go to onboarding; students go to dashboard
      if (data.role === 'TUTOR') {
        navigate({ name: 'onboarding' })
      } else {
        navigate({ name: 'dashboard' })
      }
    } catch (e: any) {
      toast.error(e.message || 'Đăng ký thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto max-w-md px-4 py-8">
      <Card className="p-6">
        <div className="text-center mb-6">
          <button
            onClick={() => navigate({ name: 'home' })}
            className="inline-flex items-center gap-2 mb-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">GiaSu<span className="text-primary">Connect</span></span>
          </button>
          <h1 className="text-2xl font-bold">
            {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === 'login' ? 'Chào mừng bạn trở lại!' : 'Tham gia cộng đồng gia sư và phụ huynh'}
          </p>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid w-full grid-cols-2 mb-5">
            <TabsTrigger value="login">Đăng nhập</TabsTrigger>
            <TabsTrigger value="register">Đăng ký</TabsTrigger>
          </TabsList>

          {/* LOGIN */}
          <TabsContent value="login" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="ban@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="pl-9"
                />
              </div>
            </div>

            <Button className="w-full h-11" onClick={handleLogin} disabled={loading}>
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>

            {/* Demo credentials */}
            <div className="rounded-xl bg-muted/50 p-3 text-xs">
              <p className="font-semibold mb-1.5">Tài khoản demo (mật khẩu: 123456):</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => fillDemo('student')}
                  className="px-2 py-1 rounded-md bg-background border hover:bg-accent text-left"
                >
                  <span className="font-semibold">Phụ huynh:</span> hoa.parent@example.com
                </button>
                <button
                  onClick={() => fillDemo('tutor')}
                  className="px-2 py-1 rounded-md bg-background border hover:bg-accent text-left"
                >
                  <span className="font-semibold">Gia sư:</span> minhanh.tutor@example.com
                </button>
              </div>
            </div>
          </TabsContent>

          {/* REGISTER */}
          <TabsContent value="register" className="space-y-4">
            {/* Role selector */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Bạn là?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRole('STUDENT')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${role === 'STUDENT' ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <Home className={`h-5 w-5 mb-1 ${role === 'STUDENT' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-sm font-semibold">Phụ huynh / Học sinh</p>
                  <p className="text-[10px] text-muted-foreground">Tìm và đặt lịch gia sư</p>
                </button>
                <button
                  onClick={() => setRole('TUTOR')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${role === 'TUTOR' ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <Briefcase className={`h-5 w-5 mb-1 ${role === 'TUTOR' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-sm font-semibold">Gia sư</p>
                  <p className="text-[10px] text-muted-foreground">Cung cấp dịch vụ dạy</p>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-name">Họ và tên</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reg-name"
                  placeholder={role === 'TUTOR' ? 'Nguyễn Văn A' : 'Phụ huynh Nguyễn Văn A'}
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reg-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="ban@email.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-phone">Số điện thoại</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reg-phone"
                    placeholder="09xxx..."
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-password">Mật khẩu</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="Ít nhất 6 ký tự"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reg-city">Tỉnh/Thành phố</Label>
                <select
                  id="reg-city"
                  value={regCity}
                  onChange={(e) => setRegCity(e.target.value)}
                  className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
                >
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-district">Quận/Huyện</Label>
                <select
                  id="reg-district"
                  value={regDistrict}
                  onChange={(e) => setRegDistrict(e.target.value)}
                  className="w-full h-10 px-3 border rounded-lg bg-background text-sm"
                >
                  <option value="">Chọn quận</option>
                  {(CITY_DISTRICTS[regCity] || []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-address">Địa chỉ</Label>
                <Input
                  id="reg-address"
                  placeholder="Số nhà, đường"
                  value={regAddress}
                  onChange={(e) => setRegAddress(e.target.value)}
                />
              </div>
            </div>

            <Button className="w-full h-11" onClick={handleRegister} disabled={loading}>
              {loading ? 'Đang tạo tài khoản...' : `Đăng ký ${role === 'TUTOR' ? 'làm gia sư' : ''}`}
            </Button>

            <p className="text-[11px] text-muted-foreground text-center">
              Bằng việc đăng ký, bạn đồng ý với Điều khoản & Chính sách bảo mật của GiaSuConnect
            </p>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}
