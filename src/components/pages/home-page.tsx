'use client'

import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { TutorCard, Tutor } from '@/components/tutor-card'
import {
  Search, MapPin, Home, School, Star, ShieldCheck,
  Calculator, Atom, FlaskConical, MessageCircle, GraduationCap,
  Award, Palette, Music, ArrowRight, BookOpen,
  CheckCircle2, TrendingUp, ChevronLeft, ChevronRight, Sparkles, PenLine, BellRing
} from 'lucide-react'

// Chip danh mục nổi bật — kiểu danh mục Airbnb
const QUICK_CATEGORIES = [
  { label: 'Toán', slug: 'toan-tieu-hoc', icon: Calculator },
  { label: 'Toán THPT', slug: 'toan-hoc', icon: Calculator },
  { label: 'Vật lý', slug: 'vat-ly', icon: Atom },
  { label: 'Hóa học', slug: 'hoa-hoc', icon: FlaskConical },
  { label: 'IELTS', slug: 'ielts', icon: GraduationCap },
  { label: 'Tiếng Anh', slug: 'tieng-anh-giao-tiep', icon: MessageCircle },
  { label: 'Ngữ Văn', slug: 'ngu-van', icon: BookOpen },
  { label: 'Luyện thi THPT', slug: 'luyen-thi-thpt', icon: Award },
  { label: 'Piano', slug: 'piano', icon: Music },
  { label: 'Vẽ sáng tạo', slug: 've-sang-tao', icon: Palette },
  { label: 'Lập trình', slug: 'lap-trinh-python', icon: GraduationCap },
]

const CITIES = ['Tất cả', 'Hà Nội', 'TP.HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ']

function CarouselRow({ children, title, subtitle, onSeeAll }: {
  children: React.ReactNode
  title: string
  subtitle?: string
  onSeeAll?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)

  const updateArrows = () => {
    const el = ref.current
    if (!el) return
    setCanLeft(el.scrollLeft > 8)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }

  useEffect(() => {
    updateArrows()
  }, [children])

  const scroll = (dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 640), behavior: 'smooth' })
  }

  return (
    <section className="container mx-auto max-w-7xl px-4 py-7">
      <div className="flex items-end justify-between mb-4 gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onSeeAll && (
            <Button variant="ghost" size="sm" className="font-semibold rounded-full" onClick={onSeeAll}>
              Xem tất cả <ArrowRight className="h-4 w-4 ml-0.5" />
            </Button>
          )}
          <div className="hidden md:flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" disabled={!canLeft} onClick={() => scroll(-1)} aria-label="Trước">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" disabled={!canRight} onClick={() => scroll(1)} aria-label="Sau">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div ref={ref} className="row-scroll" onScroll={updateArrows}>
        {children}
      </div>
    </section>
  )
}

export function HomePage() {
  const { navigate, user } = useApp()
  const [searchQ, setSearchQ] = useState('')
  const [city, setCity] = useState('Tất cả')
  const [tutors, setTutors] = useState<Tutor[]>([])
  const [loading, setLoading] = useState(true)
  // Thống kê thật từ API
  const [liveStats, setLiveStats] = useState<{ tutorCount: number; avgRating: number; reviewCount: number } | null>(null)

  useEffect(() => {
    fetch('/api/tutors?sort=rating&pageSize=50')
      .then(r => r.json())
      .then(data => {
        setTutors(data.tutors || [])
        const all = data.tutors || []
        const reviewed = all.filter((t: Tutor) => t.reviewCount > 0)
        const avg = reviewed.length
          ? reviewed.reduce((s: number, t: Tutor) => s + t.avgRating, 0) / reviewed.length
          : 0
        setLiveStats({
          tutorCount: data.total ?? all.length,
          avgRating: Math.round(avg * 10) / 10,
          reviewCount: all.reduce((s: number, t: Tutor) => s + t.reviewCount, 0),
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSearch = () => {
    navigate({
      name: 'search',
      subject: searchQ || undefined,
      ...(city !== 'Tất cả' ? { district: city } : {}),
    })
  }

  // Chia hàng theo nhóm môn (client-side từ 1 lần fetch)
  const topRated = tutors.slice(0, 10)
  const mathTutors = tutors.filter(t => t.subjects.some(s => ['toan-tieu-hoc', 'toan-cap-2', 'toan-hoc'].includes(s.slug))).slice(0, 8)
  const englishTutors = tutors.filter(t => t.subjects.some(s => ['ielts', 'tieng-anh-giao-tiep', 'toeic'].includes(s.slug))).slice(0, 8)

  return (
    <div>
      {/* ============ HERO + SEARCH PILL ============ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-rose-50 via-orange-50/50 to-amber-50/40 border-b border-border/60">
        <div className="absolute inset-0 opacity-40 pointer-events-none">
          <div className="absolute top-0 -left-10 w-72 h-72 bg-rose-300/30 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-300/25 rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto max-w-7xl px-4 py-14 md:py-20 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-sm border shadow-e1 mb-5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold">Minh bạch giá · Điểm uy tín công khai · Đặt lịch trực tiếp</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.08] mb-4">
              Gia sư giỏi,
              <br className="md:hidden" /> <span className="text-primary">gần nhà bạn</span>
            </h1>

            <p className="text-base md:text-lg text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
              Hàng nghìn gia sư đã có hồ sơ, lịch dạy và học phí rõ ràng.
              Chọn buổi, đặt lịch và bắt đầu học — chỉ trong vài phút.
            </p>

            {/* Search pill — kiểu Airbnb */}
            <div className="search-pill max-w-2xl mx-auto flex-col md:flex-row">
              <div className="flex items-center gap-2 flex-1 px-5 py-3 md:py-0 md:px-4 md:border-0 border-b md:border-b-0">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Môn học, tên gia sư... (vd: Toán, IELTS, Piano)"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="border-0 shadow-none focus-visible:ring-0 px-0 h-9 text-sm font-medium placeholder:font-normal"
                />
              </div>
              <div className="pill-sep hidden md:block" />
              <div className="flex items-center gap-2 px-5 py-3 md:py-0 md:px-4 md:border-0 border-b md:border-b-0">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="bg-transparent text-sm font-medium outline-none cursor-pointer h-9 pr-6"
                  aria-label="Thành phố"
                >
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button
                onClick={handleSearch}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm px-7 py-3 md:py-0 md:my-2 md:mr-2 rounded-full transition-colors flex items-center gap-2 justify-center"
              >
                <Search className="h-4 w-4" /> Tìm kiếm
              </button>
            </div>

            {/* Quick stats thật */}
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mt-8">
              {[
                { v: liveStats ? liveStats.tutorCount : '—', l: 'Gia sư trên nền tảng' },
                { v: '34', l: 'Môn học' },
                { v: liveStats ? (liveStats.avgRating ? `${liveStats.avgRating}★` : '—') : '—', l: `${liveStats?.reviewCount ?? 0} đánh giá thật` },
                { v: '5', l: 'Thành phố' },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <p className="text-xl md:text-2xl font-extrabold">{s.v}</p>
                  <p className="text-xs text-muted-foreground">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ CHIP DANH MỤC ============ */}
      <section className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="container mx-auto max-w-7xl px-4 py-3">
          <div className="row-scroll" style={{ gap: '0.625rem' }}>
            {QUICK_CATEGORIES.map(cat => {
              const Icon = cat.icon
              return (
                <button
                  key={cat.slug}
                  className="chip"
                  onClick={() => navigate({ name: 'search', subject: cat.slug })}
                >
                  <Icon className="h-4 w-4 text-primary" />
                  {cat.label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ============ CAROUSEL: GIA SƯ NỔI BẬT ============ */}
      <CarouselRow
        title="Gia sư được đánh giá cao nhất"
        subtitle="Điểm uy tín và học phí minh bạch — chọn ngay một buổi học thử"
        onSeeAll={() => navigate({ name: 'search' })}
      >
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-[270px] rounded-2xl border bg-card overflow-hidden">
                <div className="aspect-[4/3] skeleton-shimmer" />
                <div className="p-4 space-y-2">
                  <div className="h-4 rounded skeleton-shimmer w-2/3" />
                  <div className="h-3 rounded skeleton-shimmer w-1/2" />
                </div>
              </div>
            ))
          : topRated.map(t => (
              <div key={t.id} className="w-[270px] sm:w-[290px]">
                <TutorCard tutor={t} />
              </div>
            ))}
      </CarouselRow>

      {/* ============ CAROUSEL THEO MÔN ============ */}
      {!loading && mathTutors.length > 0 && (
        <CarouselRow
          title="Gia sư Toán"
          subtitle="Từ tiểu học đến luyện thi THPT quốc gia"
          onSeeAll={() => navigate({ name: 'search', subject: 'toan-hoc' })}
        >
          {mathTutors.map(t => (
            <div key={t.id} className="w-[270px] sm:w-[290px]">
              <TutorCard tutor={t} compact />
            </div>
          ))}
        </CarouselRow>
      )}

      {!loading && englishTutors.length > 0 && (
        <CarouselRow
          title="Gia sư Tiếng Anh & IELTS"
          subtitle="Giao tiếp, TOEIC, luyện thi lấy chứng chỉ quốc tế"
          onSeeAll={() => navigate({ name: 'search', subject: 'ielts' })}
        >
          {englishTutors.map(t => (
            <div key={t.id} className="w-[270px] sm:w-[290px]">
              <TutorCard tutor={t} compact />
            </div>
          ))}
        </CarouselRow>
      )}

      {/* ============ 2 LUỒNG: PHỤ HUYNH & GIA SƯ ============ */}
      <section className="section-pad bg-muted/30 border-t border-border/60">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Hai luồng đơn giản, không rườm rà</h2>
            <p className="text-muted-foreground mt-2 text-sm md:text-base">Phụ huynh tìm và đặt — gia sư chỉ đăng hồ sơ, nhận yêu cầu và xác nhận.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Phụ huynh / học sinh */}
            <div className="rounded-3xl bg-card border shadow-e1 p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-11 w-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-e1">
                  <Home className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg">Dành cho phụ huynh & học sinh</h3>
                  <p className="text-xs text-muted-foreground">3 bước để có gia sư phù hợp</p>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  { icon: Search, title: 'Tìm & so sánh', desc: 'Lọc theo môn, cấp học, khu vực và phương thức học (tại nhà / cơ sở / online). Xem điểm uy tín, đánh giá thật và học phí rõ ràng ngay trên thẻ.' },
                  { icon: BookOpen, title: 'Đặt buổi học thử', desc: 'Chọn môn theo giá niêm yết, chọn lịch trong tuần và số buổi. Hệ thống tự kiểm tra trùng lịch cho cả hai bên.' },
                  { icon: CheckCircle2, title: 'Theo dõi & đánh giá', desc: 'Nhận thông báo khi gia sư xác nhận. Theo dõi tiến độ lớp học trên lịch tuần và để lại đánh giá sau mỗi buổi.' },
                ].map((s, i) => {
                  const Icon = s.icon
                  return (
                    <div key={i} className="flex gap-4">
                      <div className="shrink-0 flex flex-col items-center">
                        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-extrabold text-sm">
                          {i + 1}
                        </div>
                        {i < 2 && <div className="w-px flex-1 bg-border mt-1" />}
                      </div>
                      <div className="pb-2">
                        <p className="font-bold text-sm flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" /> {s.title}
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-1">{s.desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Button className="w-full mt-2 rounded-xl font-semibold" size="lg" onClick={() => navigate({ name: 'search' })}>
                Tìm gia sư ngay <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            {/* Gia sư */}
            <div className="rounded-3xl bg-card border shadow-e1 p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-11 w-11 rounded-2xl bg-foreground text-background flex items-center justify-center shadow-e1">
                  <School className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg">Dành cho gia sư</h3>
                  <p className="text-xs text-muted-foreground">Đăng một lần — học sinh tự tìm đến</p>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  { icon: PenLine, title: 'Đăng hồ sơ 5 phút', desc: 'Điền thông tin chuyên môn, chọn môn dạy kèm học phí và lịch dạy trong tuần. Không cần thao tác slot rời rạc — mọi thứ nằm trong một trang.' },
                  { icon: BellRing, title: 'Nhận yêu cầu', desc: 'Hồ sơ lên sóng, phụ huynh tìm thấy bạn qua tìm kiếm và bản đồ. Yêu cầu đặt lịch hiện trong Trang quản lý kèm thông báo.' },
                  { icon: CheckCircle2, title: 'Xác nhận & dạy', desc: 'Bấm xác nhận (hoặc từ chối kèm lý do). Lịch tuần, lớp học và thu nhập hoàn thành được tổng hợp tự động.' },
                ].map((s, i) => {
                  const Icon = s.icon
                  return (
                    <div key={i} className="flex gap-4">
                      <div className="shrink-0 flex flex-col items-center">
                        <div className="h-9 w-9 rounded-full bg-foreground text-background flex items-center justify-center font-extrabold text-sm">
                          {i + 1}
                        </div>
                        {i < 2 && <div className="w-px flex-1 bg-border mt-1" />}
                      </div>
                      <div className="pb-2">
                        <p className="font-bold text-sm flex items-center gap-2">
                          <Icon className="h-4 w-4" /> {s.title}
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-1">{s.desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Button
                variant="outline"
                size="lg"
                className="w-full mt-2 rounded-xl font-semibold"
                onClick={() => navigate(user?.role === 'TUTOR' ? { name: 'dashboard' } : { name: 'register' })}
              >
                {user?.role === 'TUTOR' ? 'Vào Trang quản lý' : 'Đăng ký làm gia sư'} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ============ WHY US ============ */}
      <section className="section-pad">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-3 rounded-full">Vì sao tin tưởng GiaSuConnect</Badge>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Khác biệt so với tin đăng rải rác</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: ShieldCheck, title: 'Điểm uy tín công khai', desc: 'Mọi hủy lịch có lý do đều ảnh hưởng điểm uy tín 0–100 của gia sư và phụ huynh. Điểm này hiển thị ngay trên hồ sơ.' },
              { icon: MapPin, title: 'Khớp vị trí 2 chiều', desc: 'Xem gia sư quanh bạn trên bản đồ: họ đến nhà bạn, hoặc bạn đến cơ sở của họ — chọn theo môn học.' },
              { icon: Star, title: 'Đánh giá thật sau buổi học', desc: 'Chỉ ai từng học mới được đánh giá. Không điểm ảo, không seeded reviews giả danh phụ huynh.' },
              { icon: TrendingUp, title: 'Học phí minh bạch', desc: 'Giá từng môn do gia sư niêm yết, hiện rõ trước khi đặt. Tổng tiền tính đúng theo số buổi, không phụ phí ẩn.' },
            ].map((f, i) => {
              const Icon = f.icon
              return (
                <div key={i} className="rounded-2xl border bg-card p-5 card-lift">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold mb-1.5">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="container mx-auto max-w-7xl px-4 pb-14">
        <div className="rounded-3xl bg-gradient-to-br from-primary to-rose-600 p-8 md:p-12 text-center text-primary-foreground relative overflow-hidden shadow-e3">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          </div>
          <div className="relative">
            {!user && (
              <>
                <h2 className="text-3xl md:text-4xl font-extrabold mb-3">Bạn là gia sư?</h2>
                <p className="text-primary-foreground/90 max-w-xl mx-auto mb-6">
                  Đăng hồ sơ một lần — 5 phút. Phụ huynh tìm thấy bạn, gửi yêu cầu, bạn xác nhận là bắt đầu dạy. 0% phí nền tảng giai đoạn đầu.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button
                    size="lg"
                    className="bg-background text-foreground hover:bg-background/90 rounded-full font-semibold px-7"
                    onClick={() => navigate({ name: 'register' })}
                  >
                    Đăng ký làm gia sư <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 rounded-full px-7"
                    onClick={() => navigate({ name: 'search' })}
                  >
                    Thử tìm gia sư
                  </Button>
                </div>
              </>
            )}
            {user?.role === 'STUDENT' && (
              <>
                <h2 className="text-3xl md:text-4xl font-extrabold mb-3">Sẵn sàng tìm gia sư phù hợp?</h2>
                <p className="text-primary-foreground/90 max-w-xl mx-auto mb-6">
                  So sánh hồ sơ, học phí và điểm uy tín — rồi đặt buổi học thử chỉ trong vài phút.
                </p>
                <Button
                  size="lg"
                  className="bg-background text-foreground hover:bg-background/90 rounded-full font-semibold px-7"
                  onClick={() => navigate({ name: 'search' })}
                >
                  Bắt đầu tìm gia sư <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
            {user?.role === 'TUTOR' && (
              <>
                <h2 className="text-3xl md:text-4xl font-extrabold mb-3">Quản lý lớp học của bạn</h2>
                <p className="text-primary-foreground/90 max-w-xl mx-auto mb-6">
                  Môn dạy, lịch tuần và yêu cầu từ phụ huynh — tất cả trong một Trang quản lý.
                </p>
                <Button
                  size="lg"
                  className="bg-background text-foreground hover:bg-background/90 rounded-full font-semibold px-7"
                  onClick={() => navigate({ name: 'dashboard' })}
                >
                  Vào Trang quản lý <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
