'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { TutorCard, Tutor } from '@/components/tutor-card'
import { RatingStars } from '@/components/rating-stars'
import {
  Search, MapPin, Home, School, Star, ShieldCheck, Clock,
  Calculator, Atom, FlaskConical, MessageCircle, GraduationCap,
  Award, Palette, Music, ArrowRight, Users, BookOpen, Sparkles,
  Heart, CheckCircle2, TrendingUp
} from 'lucide-react'
import { formatVnd } from '@/lib/format'

const SUBJECT_CATEGORIES = [
  {
    title: 'STEM - Khoa học',
    desc: 'Toán, Lý, Hóa, Sinh từ cấp 1 đến THPT',
    icon: Calculator,
    color: 'from-rose-500/20 to-rose-500/5',
    iconBg: 'bg-rose-500/10 text-rose-600',
    subjects: [
      { name: 'Toán Tiểu học', slug: 'toan-tieu-hoc', icon: Calculator },
      { name: 'Toán lớp 6-9', slug: 'toan-cap-2', icon: Calculator },
      { name: 'Toán THPT', slug: 'toan-hoc', icon: Calculator },
      { name: 'Vật lý THPT', slug: 'vat-ly', icon: Atom },
      { name: 'Hóa học THPT', slug: 'hoa-hoc', icon: FlaskConical },
      { name: 'Luyện thi THPT QG', slug: 'luyen-thi-thpt', icon: Award },
    ]
  },
  {
    title: 'Ngoại ngữ',
    desc: 'Tiếng Anh, Trung, Nhật, Hàn',
    icon: MessageCircle,
    color: 'from-emerald-500/20 to-emerald-500/5',
    iconBg: 'bg-emerald-500/10 text-emerald-600',
    subjects: [
      { name: 'IELTS', slug: 'ielts', icon: GraduationCap },
      { name: 'TOEIC', slug: 'toeic', icon: Award },
      { name: 'Tiếng Anh giao tiếp', slug: 'tieng-anh-giao-tiep', icon: MessageCircle },
      { name: 'Tiếng Trung', slug: 'tieng-trung', icon: MessageCircle },
      { name: 'Tiếng Nhật', slug: 'tieng-nhat', icon: MessageCircle },
      { name: 'Tiếng Hàn', slug: 'tieng-han', icon: MessageCircle },
    ]
  },
  {
    title: 'Khoa học Xã hội & Văn',
    desc: 'Văn, Sử, Địa, GDCD',
    icon: BookOpen,
    color: 'from-amber-500/20 to-amber-500/5',
    iconBg: 'bg-amber-500/10 text-amber-600',
    subjects: [
      { name: 'Ngữ Văn THPT', slug: 'ngu-van', icon: BookOpen },
      { name: 'Lịch sử', slug: 'lich-su', icon: BookOpen },
      { name: 'Địa lý', slug: 'dia-ly', icon: BookOpen },
    ]
  },
  {
    title: 'Nghệ thuật & Tin học',
    desc: 'Vẽ, Piano, Guitar, Lập trình',
    icon: Palette,
    color: 'from-violet-500/20 to-violet-500/5',
    iconBg: 'bg-violet-500/10 text-violet-600',
    subjects: [
      { name: 'Vẽ sáng tạo', slug: 've-sang-tao', icon: Palette },
      { name: 'Piano', slug: 'piano', icon: Music },
      { name: 'Guitar', slug: 'guitar', icon: Music },
      { name: 'Lập trình Python', slug: 'lap-trinh-python', icon: GraduationCap },
    ]
  },
]

export function HomePage() {
  const { navigate, user } = useApp()
  const [searchQ, setSearchQ] = useState('')
  const [featured, setFeatured] = useState<Tutor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tutors?sort=rating')
      .then(r => r.json())
      .then(data => {
        setFeatured((data.tutors || []).slice(0, 8))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSearch = () => {
    navigate({
      name: 'search',
      subject: searchQ || undefined,
    })
  }

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-rose-50 via-orange-50/40 to-amber-50/30">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 -left-10 w-72 h-72 bg-rose-300/30 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-300/30 rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto max-w-7xl px-4 py-16 md:py-24 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm border shadow-sm mb-6">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium">Hơn 1.000+ gia sư trên khắp Việt Nam</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] mb-6">
              Tìm gia sư phù hợp
              <br />
              <span className="text-primary">theo vị trí</span> của bạn
            </h1>

            <p className="text-lg text-muted-foreground mb-8 max-w-2xl leading-relaxed">
              Gia sư đến nhà bạn dạy — hoặc bạn đến nơi dạy của gia sư.
              Khám phá hồ sơ chi tiết, đánh giá thực tế và đặt lịch trong vài cú click.
            </p>

            {/* Search bar */}
            <div className="bg-background rounded-2xl shadow-lg border p-2 flex flex-col md:flex-row gap-2 max-w-2xl">
              <div className="flex items-center gap-2 flex-1 px-3">
                <Search className="h-5 w-5 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Tên gia sư, môn học... (vd: Sarah, Toán, IELTS, Piano)"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="border-0 shadow-none focus-visible:ring-0 px-0 h-11"
                />
              </div>
              <Button size="lg" className="h-11 px-6" onClick={handleSearch}>
                <Search className="h-4 w-4 mr-1" />
                Tìm kiếm
              </Button>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-6 mt-8">
              <div>
                <p className="text-2xl font-bold">1.000+</p>
                <p className="text-xs text-muted-foreground">Gia sư xác minh</p>
              </div>
              <div className="border-l pl-6">
                <p className="text-2xl font-bold">25+</p>
                <p className="text-xs text-muted-foreground">Môn học</p>
              </div>
              <div className="border-l pl-6">
                <p className="text-2xl font-bold">4.8★</p>
                <p className="text-xs text-muted-foreground">Đánh giá TB</p>
              </div>
              <div className="border-l pl-6">
                <p className="text-2xl font-bold">5+</p>
                <p className="text-xs text-muted-foreground">Thành phố</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="container mx-auto max-w-7xl px-4 py-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Badge variant="secondary" className="mb-3">Đơn giản & nhanh chóng</Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Cách GiaSuConnect hoạt động</h2>
          <p className="text-muted-foreground">Đặc biệt: linh hoạt 2 chiều - chọn học tại nhà hoặc đến cơ sở</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="p-6 relative">
            <div className="absolute -top-3 -left-3 h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-md">1</div>
            <Search className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold text-lg mb-2">Tìm kiếm theo vị trí</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nhập môn học cần tìm và vị trí của bạn. Hệ thống hiển thị gia sư gần nhất,
              kèm khoảng cách và các option học tại nhà hoặc tại cơ sở.
            </p>
          </Card>

          <Card className="p-6 relative">
            <div className="absolute -top-3 -left-3 h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-md">2</div>
            <Users className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold text-lg mb-2">Chọn & đặt lịch</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Xem hồ sơ chi tiết: bằng cấp, kinh nghiệm, đánh giá từ phụ huynh khác.
              Chọn buổi học phù hợp và gửi yêu cầu đặt lịch.
            </p>
          </Card>

          <Card className="p-6 relative">
            <div className="absolute -top-3 -left-3 h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-md">3</div>
            <Heart className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold text-lg mb-2">Bắt đầu học</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Gia sư xác nhận và đến nhà bạn — hoặc bạn đến cơ sở của gia sư.
              Sau buổi học, để lại đánh giá để giúp cộng đồng.
            </p>
          </Card>
        </div>

        {/* Two modes highlight */}
        <div className="grid md:grid-cols-2 gap-4 mt-8">
          <div className="rounded-2xl bg-gradient-to-br from-rose-500/10 to-orange-500/5 border border-rose-500/20 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                <Home className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg">Gia sư đến nhà bạn</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tiện lợi cho phụ huynh: không cần đưa đón, học sinh học trong môi trường quen thuộc.
              Gia sư di chuyển trong bán kính linh hoạt (5-10km).
            </p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-violet-600 text-white flex items-center justify-center">
                <School className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg">Đến nơi dạy của gia sư</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Phù hợp với môn cần thiết bị: Piano (có piano cơ), Vẽ (studio), Hóa (phòng thí nghiệm).
              Môi trường học chuyên nghiệp, đầy đủ dụng cụ.
            </p>
          </div>
        </div>
      </section>

      {/* SUBJECTS */}
      <section className="container mx-auto max-w-7xl px-4 py-12">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
          <div>
            <Badge variant="secondary" className="mb-2">Khám phá theo môn</Badge>
            <h2 className="text-3xl font-bold">Môn học phổ biến</h2>
          </div>
          <Button variant="ghost" onClick={() => navigate({ name: 'search' })}>
            Xem tất cả <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {SUBJECT_CATEGORIES.map((cat) => {
            const Icon = cat.icon
            return (
              <Card key={cat.title} className={`p-6 bg-gradient-to-br ${cat.color} border-0`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`h-12 w-12 rounded-xl ${cat.iconBg} flex items-center justify-center`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{cat.title}</h3>
                    <p className="text-xs text-muted-foreground">{cat.desc}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {cat.subjects.map((s) => {
                    const SubIcon = s.icon
                    return (
                      <button
                        key={s.slug}
                        onClick={() => navigate({ name: 'search', subject: s.slug })}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-background/60 hover:bg-background transition-colors text-left"
                      >
                        <SubIcon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{s.name}</span>
                        <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                      </button>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      </section>

      {/* FEATURED TUTORS */}
      <section className="container mx-auto max-w-7xl px-4 py-12">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
          <div>
            <Badge variant="secondary" className="mb-2">Được đánh giá cao</Badge>
            <h2 className="text-3xl font-bold">Gia sư nổi bật</h2>
          </div>
          <Button variant="ghost" onClick={() => navigate({ name: 'search' })}>
            Xem tất cả <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="p-0 overflow-hidden">
                <div className="aspect-[4/3] bg-muted animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
                  <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {featured.map((t) => (
              <TutorCard key={t.id} tutor={t} />
            ))}
          </div>
        )}
      </section>

      {/* WHY US */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-3">Tại sao chọn chúng tôi</Badge>
            <h2 className="text-3xl md:text-4xl font-bold">Khác biệt so với gia sư truyền thống</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: ShieldCheck, title: 'Gia sư xác minh', desc: '100% gia sư được kiểm tra bằng cấp và giấy tờ tuỳ thân trước khi lên nền tảng.' },
              { icon: MapPin, title: 'Khớp vị trí 2 chiều', desc: 'Lựa chọn gia sư đến nhà hoặc đến cơ sở - linh hoạt theo nhu cầu từng môn học.' },
              { icon: Star, title: 'Đánh giá thực tế', desc: 'Mọi đánh giá đến từ phụ huynh đã từng học. Không có đánh giá ảo.' },
              { icon: TrendingUp, title: 'Học phí minh bạch', desc: 'Giá học hiện rõ ngay từ đầu. Không phụ phí ẩn, không trung gian.' },
            ].map((f, i) => {
              const Icon = f.icon
              return (
                <Card key={i} className="p-6 text-center">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto max-w-7xl px-4 py-16">
        <div className="rounded-3xl bg-gradient-to-br from-primary to-rose-600 p-8 md:p-12 text-center text-primary-foreground relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          </div>
          <div className="relative">
            {/* Guest: recruit tutors */}
            {!user && (
              <>
                <h2 className="text-3xl md:text-4xl font-bold mb-3">Bạn là gia sư?</h2>
                <p className="text-primary-foreground/90 max-w-xl mx-auto mb-6">
                  Đăng ký miễn phí, tạo hồ sơ chuyên nghiệp và kết nối với hàng trăm phụ huynh đang tìm gia sư mỗi ngày.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => navigate({ name: 'register' })}
                    className="bg-background text-foreground hover:bg-background/90"
                  >
                    Đăng ký làm gia sư <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate({ name: 'search' })}
                    className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                  >
                    Tìm gia sư
                  </Button>
                </div>
              </>
            )}
            {/* Student: encourage to find tutor */}
            {user?.role === 'STUDENT' && (
              <>
                <h2 className="text-3xl md:text-4xl font-bold mb-3">Sẵn sàng tìm gia sư phù hợp?</h2>
                <p className="text-primary-foreground/90 max-w-xl mx-auto mb-6">
                  Hàng trăm gia sư đã được xác minh trên khắp Việt Nam đang chờ bạn khám phá.
                </p>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => navigate({ name: 'search' })}
                  className="bg-background text-foreground hover:bg-background/90"
                >
                  Bắt đầu tìm gia sư <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
            {/* Tutor: encourage to manage profile */}
            {user?.role === 'TUTOR' && (
              <>
                <h2 className="text-3xl md:text-4xl font-bold mb-3">Quản lý lớp học của bạn</h2>
                <p className="text-primary-foreground/90 max-w-xl mx-auto mb-6">
                  Cập nhật môn dạy, lịch trống và xem các yêu cầu mới từ phụ huynh.
                </p>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => navigate({ name: 'dashboard' })}
                  className="bg-background text-foreground hover:bg-background/90"
                >
                  Vào bảng điều khiển <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
