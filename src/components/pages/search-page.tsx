'use client'

import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetTitle, SheetHeader } from '@/components/ui/sheet'
import { TutorCard, Tutor } from '@/components/tutor-card'
import {
  Search, MapPin, Home, School, SlidersHorizontal, LayoutGrid, Map as MapIcon,
  X, Navigation, Star, GraduationCap, Video, ChevronLeft, ChevronRight, ChevronDown,
  Users, CalendarClock, Hourglass, BadgeCheck, Clock
} from 'lucide-react'
import { formatVnd, formatVndShort, formatDate, CLASS_DAY_NAMES, sortClassSlots } from '@/lib/format'
import { toast } from 'sonner'

// Dynamic import Leaflet map (no SSR)
const TutorMap = lazy(() => import('@/components/map/tutor-map').then(m => ({ default: m.TutorMap })))

const LEVELS = [
  { value: '', label: 'Tất cả cấp' },
  { value: 'PRIMARY', label: 'Tiểu học' },
  { value: 'SECONDARY', label: 'THCS' },
  { value: 'HIGH', label: 'THPT' },
]

const STORAGE_KEY = 'giasuconnect:search-filters'

interface SavedFilters {
  search?: string
  city?: string
  level?: string
  mode?: string
  maxPrice?: number
  minRating?: number
  sort?: string
  viewMode?: 'grid' | 'map'
  userLat?: number
  userLng?: number
  pickedLat?: number
  pickedLng?: number
}

function loadSavedFilters(): Partial<SavedFilters> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveFilters(filters: SavedFilters) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch {}
}

const PRICE_CHIPS = [
  { value: 800000, label: 'Mọi mức giá' },
  { value: 200000, label: '≤ 200k' },
  { value: 300000, label: '≤ 300k' },
  { value: 500000, label: '≤ 500k' },
]

// Lớp học nhóm công khai (tab "Lớp học" — kiểu Experiences của Airbnb)
interface ClassDiscoverItem {
  id: string
  tutorId: string
  title: string
  subject: { id: string; name: string; slug?: string; icon?: string | null }
  gradeLevel?: string | null
  description?: string | null
  meetingType: string
  address?: string | null
  capacity: number
  monthlyFee?: number | null
  startDate?: string | null
  enrollDeadline?: string | null
  deadlinePassed?: boolean
  schedule: { dayOfWeek: number; startTime: string; endTime: string }[]
  enrolledCount: number
  remaining: number
  waitlistCount: number
  nextSession?: { date: string; startTime: string; endTime: string } | null
  upcomingCount?: number
  tutor: {
    id: string
    name: string
    avatar?: string | null
    profession?: string | null
    district?: string | null
    city?: string | null
    isVerified?: boolean
    avgRating?: number
    reviewCount?: number
  }
}

const DAY_FILTERS = [1, 2, 3, 4, 5, 6, 0]

export function SearchPage() {
  const { view, navigate } = useApp()
  const initial = view.name === 'search' ? view : { subject: '', mode: '', district: '', lat: undefined, lng: undefined }
  const saved = typeof window !== 'undefined' ? loadSavedFilters() : {}

  const [tutors, setTutors] = useState<Tutor[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  // ===== Tab "Lớp học" (khám phá lớp nhóm — kiểu Airbnb Experiences) =====
  const [resultTab, setResultTab] = useState<'tutors' | 'classes'>('tutors')
  const [classDay, setClassDay] = useState<number | null>(null)
  const [classMeetType, setClassMeetType] = useState<string>('')
  const [classSort, setClassSort] = useState<'next' | 'fee_asc' | 'fee_desc' | 'seats'>('next')
  const [classResults, setClassResults] = useState<ClassDiscoverItem[]>([])
  const [classesLoading, setClassesLoading] = useState(false)

  // Locations data
  const [locations, setLocations] = useState<{ city: string; tutorCount: number; districts: { name: string; count: number }[] }[]>([])

  // Filters (with localStorage persistence)
  const [search, setSearch] = useState(initial.subject || saved.search || '')
  const [city, setCity] = useState<string>('')
  const [district, setDistrict] = useState<string>(initial.district || '')
  const [level, setLevel] = useState<string>(saved.level || '')
  const [mode, setMode] = useState<string>(initial.mode || saved.mode || '')
  const [maxPrice, setMaxPrice] = useState<number>(saved.maxPrice ?? 800000)
  const [minRating, setMinRating] = useState<number>(saved.minRating ?? 0)
  const [sort, setSort] = useState<'rating' | 'newest' | 'price_asc' | 'price_desc' | 'distance'>(saved.sort as any || 'rating')
  const [viewMode, setViewMode] = useState<'grid' | 'map'>(saved.viewMode || 'grid')
  const [selectedId, setSelectedId] = useState<string | undefined>()

  // User location (geolocation)
  const [userLat, setUserLat] = useState<number | undefined>(initial.lat || saved.userLat)
  const [userLng, setUserLng] = useState<number | undefined>(initial.lng || saved.userLng)
  const [locating, setLocating] = useState(false)

  // Picked location (click on map)
  const [pickedLat, setPickedLat] = useState<number | undefined>(saved.pickedLat)
  const [pickedLng, setPickedLng] = useState<number | undefined>(saved.pickedLng)
  const [pickMode, setPickMode] = useState(false)

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    saveFilters({
      search, city, level, mode, maxPrice, minRating, sort, viewMode,
      userLat, userLng, pickedLat, pickedLng,
    })
  }, [search, city, level, mode, maxPrice, minRating, sort, viewMode, userLat, userLng, pickedLat, pickedLng])

  // Load locations on mount
  useEffect(() => {
    fetch('/api/locations')
      .then(r => r.json())
      .then(data => setLocations(data.locations || []))
      .catch(() => {})
  }, [])

  // When city changes, reset district (inline in onClick handlers below)
  const changeCity = (newCity: string) => {
    setCity(newCity)
    setDistrict('')
  }

  // Detect location (geolocation API)
  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Trình duyệt không hỗ trợ định vị. Hãy mở chế độ bản đồ rồi click chọn vị trí.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        setPickedLat(undefined)
        setPickedLng(undefined)
        setLocating(false)
        toast.success('Đã lấy vị trí của bạn — kết quả sắp xếp theo khoảng cách')
      },
      () => {
        setLocating(false)
        toast.error('Không lấy được vị trí. Hãy cho phép truy cập hoặc chọn thủ công trên bản đồ.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Pick location from map click
  const handlePickLocation = (lat: number, lng: number) => {
    setPickedLat(lat)
    setPickedLng(lng)
    setUserLat(undefined)
    setUserLng(undefined)
    setPickMode(false)
  }

  const clearLocation = () => {
    setUserLat(undefined)
    setUserLng(undefined)
    setPickedLat(undefined)
    setPickedLng(undefined)
    setPickMode(false)
  }

  // Effective lat/lng for filter
  const effectiveLat = userLat ?? pickedLat
  const effectiveLng = userLng ?? pickedLng

  // Build query string and fetch (kèm page + pageSize)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Chữ ký bộ lọc — đổi filter tự động reset về trang 1 (derived state,
  // tránh setState-in-effect)
  const filterSignature = useMemo(() =>
    JSON.stringify([search, city, district, level, mode, maxPrice, minRating, effectiveLat, effectiveLng, sort]),
    [search, city, district, level, mode, maxPrice, minRating, effectiveLat, effectiveLng, sort]
  )
  const [pageState, setPageState] = useState({ sig: filterSignature, page: 1 })
  const page = pageState.sig === filterSignature ? pageState.page : 1
  const setPage = (updater: number | ((p: number) => number)) => {
    const next = typeof updater === 'function' ? (updater as (p: number) => number)(page) : updater
    setPageState({ sig: filterSignature, page: next })
  }

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (city) params.set('city', city)
    if (district) params.set('district', district)
    if (level) params.set('level', level)
    if (mode) params.set('mode', mode)
    if (maxPrice < 800000) params.set('maxPrice', String(maxPrice))
    if (minRating > 0) params.set('minRating', String(minRating))
    if (effectiveLat != null && effectiveLng != null) {
      params.set('lat', String(effectiveLat))
      params.set('lng', String(effectiveLng))
      params.set('radius', '15')
    }
    params.set('sort', sort)
    params.set('page', String(page))
    params.set('pageSize', '12')
    return params.toString()
  }, [search, city, district, level, mode, maxPrice, minRating, effectiveLat, effectiveLng, sort, page])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/tutors?${queryString}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setTutors(data.tutors || [])
        setTotal(data.total ?? (data.tutors || []).length)
        setTotalPages(data.totalPages ?? 1)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [queryString])

  // ===== Fetch lớp học nhóm khi tab "Lớp học" đang mở =====
  useEffect(() => {
    if (resultTab !== 'classes') return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClassesLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (city) params.set('city', city)
    if (classDay !== null) params.set('day', String(classDay))
    if (classMeetType) params.set('meetingType', classMeetType)
    params.set('sort', classSort)
    fetch(`/api/classes/discover?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setClassResults(data.classes || [])
        setClassesLoading(false)
      })
      .catch(() => {
        if (!cancelled) setClassesLoading(false)
      })
    return () => { cancelled = true }
  }, [resultTab, search, city, classDay, classMeetType, classSort])

  const activeFilterCount =
    (city ? 1 : 0) +
    (district ? 1 : 0) +
    (level ? 1 : 0) +
    (mode ? 1 : 0) +
    (maxPrice < 800000 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (effectiveLat != null ? 1 : 0)

  const clearFilters = () => {
    setCity('')
    setDistrict('')
    setLevel('')
    setMode('')
    setMaxPrice(800000)
    setMinRating(0)
    clearLocation()
  }

  const modeChip = (value: string, label: string, icon: any) => (
    <button
      className={`chip ${mode === value ? 'is-active' : ''}`}
      onClick={() => setMode(mode === value ? '' : value)}
    >
      {icon} {label}
    </button>
  )

  // Bảng lọc chi tiết trong Sheet (quận, giá, đánh giá)
  const renderAdvancedFilters = () => {
    const availableDistricts = locations.find(l => l.city === city)?.districts || []
    return (
      <div className="space-y-6">
        {/* City filter */}
        <div>
          <Label className="text-sm font-bold mb-3 block flex items-center gap-1">
            <MapPin className="h-4 w-4 text-primary" /> Tỉnh/Thành phố
          </Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => changeCity('')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!city ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}
            >
              Tất cả
            </button>
            {locations.map(loc => (
              <button
                key={loc.city}
                onClick={() => changeCity(loc.city)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${city === loc.city ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}
              >
                {loc.city} <span className="opacity-60">({loc.tutorCount})</span>
              </button>
            ))}
          </div>
        </div>

        {/* District filter */}
        {city && availableDistricts.length > 0 && (
          <>
            <Separator />
            <div>
              <Label className="text-sm font-bold mb-3 block">Quận/Huyện</Label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto scroll-area">
                <button
                  onClick={() => setDistrict('')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!district ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}
                >
                  Tất cả
                </button>
                {availableDistricts.map(d => (
                  <button
                    key={d.name}
                    onClick={() => setDistrict(district === d.name ? '' : d.name)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${district === d.name ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}
                  >
                    {d.name} <span className="opacity-60">({d.count})</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Price filter */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-bold">Học phí tối đa</Label>
            <span className="text-sm font-extrabold text-primary">{formatVnd(maxPrice)}</span>
          </div>
          <Slider
            value={[maxPrice]}
            onValueChange={(v) => setMaxPrice(v[0])}
            min={100000}
            max={800000}
            step={50000}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>100k</span><span>800k+</span>
          </div>
        </div>

        <Separator />

        {/* Rating filter */}
        <div>
          <Label className="text-sm font-bold mb-3 block">Đánh giá tối thiểu</Label>
          <div className="flex gap-1.5">
            {[0, 3, 4, 4.5].map(r => (
              <button
                key={r}
                onClick={() => setMinRating(r)}
                className={`flex-1 px-2 py-2 rounded-xl text-xs font-bold transition-colors ${minRating === r ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}
              >
                {r === 0 ? 'Tất cả' : `${r}★+`}
              </button>
            ))}
          </div>
        </div>

        {activeFilterCount > 0 && (
          <Button variant="outline" size="sm" onClick={clearFilters} className="w-full rounded-xl">
            <X className="h-3.5 w-3.5 mr-1" /> Xóa toàn bộ bộ lọc ({activeFilterCount})
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ============ STICKY SEARCH + CHIP LỌC NHANH ============ */}
      <div className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="container mx-auto max-w-7xl px-4 py-3 space-y-2.5">
          {/* Hàng 0: tab Gia sư 1-1 | Lớp học nhóm (kiểu Stays/Experiences của Airbnb) */}
          <div className="flex items-center gap-1.5">
            <button
              className={`px-4 h-9 rounded-full text-sm font-bold transition-all ${
                resultTab === 'tutors'
                  ? 'bg-foreground text-background shadow-e1'
                  : 'text-muted-foreground hover:text-foreground bg-muted/60'
              }`}
              onClick={() => setResultTab('tutors')}
            >
              <Users className="h-4 w-4 inline mr-1.5" /> Gia sư (1-1)
            </button>
            <button
              className={`px-4 h-9 rounded-full text-sm font-bold transition-all ${
                resultTab === 'classes'
                  ? 'bg-foreground text-background shadow-e1'
                  : 'text-muted-foreground hover:text-foreground bg-muted/60'
              }`}
              onClick={() => setResultTab('classes')}
            >
              <GraduationCap className="h-4 w-4 inline mr-1.5" /> Lớp học nhóm
              <span className="ml-1.5 text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-1.5 py-0.5">{classResults.length || ''}</span>
            </button>
          </div>

          {/* Hàng 1: search pill + tiện ích */}
          {resultTab === 'tutors' && (
          <div className="flex gap-2 items-center">
            <div className="search-pill flex-1 max-w-2xl">
              <div className="flex items-center gap-2 flex-1 px-4">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Môn học, tên gia sư... (vd: Toán, IELTS)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-0 shadow-none focus-visible:ring-0 px-0 h-10 text-sm font-medium placeholder:font-normal"
                />
                {search && (
                  <button onClick={() => setSearch('')} aria-label="Xóa từ khóa" className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="pill-sep" />
              <div className="flex items-center px-4 min-w-[110px]">
                <select
                  value={city}
                  onChange={(e) => changeCity(e.target.value || '')}
                  className="bg-transparent text-sm font-semibold outline-none cursor-pointer h-10 pr-5"
                  aria-label="Thành phố"
                >
                  <option value="">Mọi thành phố</option>
                  {locations.map(loc => (
                    <option key={loc.city} value={loc.city}>{loc.city} ({loc.tutorCount})</option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground -ml-4 pointer-events-none" />
              </div>
              <button
                onClick={() => setPage(1)}
                className="hidden sm:flex bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm px-5 my-1.5 mr-1.5 rounded-full transition-colors items-center gap-1.5"
              >
                <Search className="h-4 w-4" /> Tìm
              </button>
            </div>

            {/* Nút vị trí của tôi */}
            <Button
              variant="outline"
              className={`h-11 rounded-full font-semibold shrink-0 ${effectiveLat != null ? 'border-primary text-primary' : ''}`}
              onClick={effectiveLat != null && userLat == null ? clearLocation : detectLocation}
              disabled={locating}
              title="Dùng GPS định vị quanh bạn"
            >
              <Navigation className={`h-4 w-4 ${locating ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{locating ? 'Đang định vị...' : effectiveLat != null ? 'Đang lọc gần bạn' : 'Gần tôi'}</span>
            </Button>

            {/* Bộ lọc chi tiết */}
            <Button
              variant={activeFilterCount > 0 ? 'default' : 'outline'}
              className="h-11 rounded-full font-semibold shrink-0"
              onClick={() => setShowFilters(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden lg:inline">Bộ lọc{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
            </Button>

            {/* View mode */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList className="h-11 rounded-full px-1">
                <TabsTrigger value="grid" className="px-3 rounded-full" title="Dạng lưới"><LayoutGrid className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="map" className="px-3 rounded-full" title="Kèm bản đồ"><MapIcon className="h-4 w-4" /></TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          )}

          {/* Hàng 1 (tab Lớp học): search pill đơn giản + lọc hình thức + ngày trong tuần */}
          {resultTab === 'classes' && (
            <div className="space-y-2.5">
              <div className="flex gap-2 items-center">
                <div className="search-pill flex-1 max-w-2xl">
                  <div className="flex items-center gap-2 flex-1 px-4">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Tên lớp, môn học, tên gia sư... (vd: Lớp Toán 10)"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="border-0 shadow-none focus-visible:ring-0 px-0 h-10 text-sm font-medium placeholder:font-normal"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} aria-label="Xóa từ khóa" className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="pill-sep" />
                  <div className="flex items-center px-4 min-w-[110px]">
                    <select
                      value={city}
                      onChange={(e) => changeCity(e.target.value || '')}
                      className="bg-transparent text-sm font-semibold outline-none cursor-pointer h-10 pr-5"
                      aria-label="Thành phố"
                    >
                      <option value="">Mọi thành phố</option>
                      {locations.map(loc => (
                        <option key={loc.city} value={loc.city}>{loc.city} ({loc.tutorCount})</option>
                      ))}
                    </select>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground -ml-4 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="row-scroll items-center" style={{ gap: '0.5rem' }}>
                <span className="text-xs font-semibold text-muted-foreground shrink-0 pr-1">Học vào</span>
                {DAY_FILTERS.map(d => (
                  <button
                    key={d}
                    className={`chip ${classDay === d ? 'is-active' : ''}`}
                    onClick={() => setClassDay(classDay === d ? null : d)}
                  >
                    {CLASS_DAY_NAMES[d]}
                  </button>
                ))}
                <div className="w-px h-6 bg-border shrink-0" />
                <button
                  className={`chip ${classMeetType === 'AT_TUTOR_HOME' ? 'is-active' : ''}`}
                  onClick={() => setClassMeetType(classMeetType === 'AT_TUTOR_HOME' ? '' : 'AT_TUTOR_HOME')}
                >
                  <Home className="h-4 w-4" /> Tại nhà gia sư
                </button>
                <button
                  className={`chip ${classMeetType === 'ONLINE' ? 'is-active' : ''}`}
                  onClick={() => setClassMeetType(classMeetType === 'ONLINE' ? '' : 'ONLINE')}
                >
                  <Video className="h-4 w-4" /> Trực tuyến
                </button>
              </div>
            </div>
          )}

          {/* Hàng 2: chip lọc nhanh — kiểu danh mục Airbnb (chỉ tab gia sư) */}
          {resultTab === 'tutors' && (
          <div className="row-scroll items-center" style={{ gap: '0.5rem' }}>
            {LEVELS.map(l => (
              <button
                key={l.value}
                className={`chip ${level === l.value ? 'is-active' : ''}`}
                onClick={() => setLevel(level === l.value ? '' : l.value)}
              >
                <GraduationCap className="h-4 w-4" /> {l.label}
              </button>
            ))}
            <div className="w-px h-6 bg-border shrink-0" />
            {modeChip('TUTOR_TO_STUDENT', 'Gia sư đến nhà', <Home className="h-4 w-4" />)}
            {modeChip('STUDENT_TO_TUTOR', 'Đến cơ sở', <School className="h-4 w-4" />)}
            {modeChip('ONLINE', 'Trực tuyến', <Video className="h-4 w-4" />)}
            <div className="w-px h-6 bg-border shrink-0" />
            {PRICE_CHIPS.map(p => (
              <button
                key={p.value}
                className={`chip ${maxPrice === p.value ? 'is-active' : ''}`}
                onClick={() => setMaxPrice(p.value)}
              >
                {p.value === 800000 ? `${formatVndShort(800000)}+` : p.label}
              </button>
            ))}
            <div className="w-px h-6 bg-border shrink-0" />
            {[4, 4.5].map(r => (
              <button
                key={r}
                className={`chip ${minRating === r ? 'is-active' : ''}`}
                onClick={() => setMinRating(minRating === r ? 0 : r)}
              >
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {r}★+
              </button>
            ))}
          </div>
          )}
        </div>
      </div>

      {/* ============ KẾT QUẢ ============ */}
      <div className="container mx-auto max-w-7xl px-4 py-5">
        {/* ===== TAB LỚP HỌC NHÓM: kết quả lớp + sắp xếp riêng ===== */}
        {resultTab === 'classes' ? (
          <>
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="text-lg font-extrabold">
                {classesLoading ? 'Đang tìm...' : `${classResults.length} lớp học nhóm đang tuyển`}
              </h2>
              <select
                value={classSort}
                onChange={(e) => setClassSort(e.target.value as any)}
                className="text-sm font-semibold border rounded-full px-3.5 py-2 bg-background cursor-pointer"
                aria-label="Sắp xếp lớp học"
              >
                <option value="next">Buổi khai giảng sớm nhất</option>
                <option value="fee_asc">Học phí thấp → cao</option>
                <option value="fee_desc">Học phí cao → thấp</option>
                <option value="seats">Còn nhiều chỗ nhất</option>
              </select>
            </div>

            {classesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="p-0 overflow-hidden">
                    <div className="aspect-[16/9] skeleton-shimmer" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 rounded skeleton-shimmer w-2/3" />
                      <div className="h-3 rounded skeleton-shimmer w-1/2" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : classResults.length === 0 ? (
              <Card className="p-12 text-center rounded-2xl">
                <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-bold text-lg mb-1">Không tìm thấy lớp học phù hợp</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Thử bỏ lọc ngày/hình thức hoặc đổi từ khóa — hoặc dùng tab Gia sư (1-1)
                </p>
                <Button
                  variant="outline" className="rounded-full"
                  onClick={() => { setClassDay(null); setClassMeetType(''); setSearch(''); setCity('') }}
                >
                  Xóa bộ lọc
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {classResults.map(cls => (
                  <ClassCard key={cls.id} cls={cls} onSelect={() => navigate({ name: 'tutor', id: cls.tutorId, classId: cls.id })} />
                ))}
              </div>
            )}
          </>
        ) : (
        <>
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-extrabold">
              {loading ? 'Đang tìm...' : `${total} gia sư phù hợp`}
            </h2>
            {!loading && total > 0 && (
              <span className="text-sm text-muted-foreground hidden sm:inline">
                · trang {page}/{Math.max(totalPages, 1)}
              </span>
            )}
            {pickMode && (
              <Badge className="bg-primary gap-1 rounded-full">
                <MapPin className="h-3 w-3" /> Click bản đồ để chọn vị trí
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="text-sm font-semibold border rounded-full px-3.5 py-2 bg-background cursor-pointer"
              aria-label="Sắp xếp"
            >
              <option value="rating">Đánh giá cao nhất</option>
              <option value="newest">Mới nhất</option>
              <option value="price_asc">Giá thấp → cao</option>
              <option value="price_desc">Giá cao → thấp</option>
              {effectiveLat != null && <option value="distance">Gần nhất</option>}
            </select>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="p-0 overflow-hidden">
                    <div className="aspect-[4/3] skeleton-shimmer" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 rounded skeleton-shimmer w-2/3" />
                      <div className="h-3 rounded skeleton-shimmer w-1/2" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : tutors.length === 0 ? (
              <Card className="p-12 text-center rounded-2xl">
                <Search className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-bold text-lg mb-1">Không tìm thấy gia sư phù hợp</h3>
                <p className="text-sm text-muted-foreground mb-4">Thử bỏ bớt bộ lọc hoặc đổi từ khóa khác</p>
                <Button variant="outline" className="rounded-full" onClick={clearFilters}>Xóa bộ lọc</Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {tutors.map(t => (
                  <TutorCard key={t.id} tutor={t} />
                ))}
              </div>
            )}

            {/* Phân trang */}
            {!loading && viewMode === 'grid' && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Trước
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  Trang {page}/{totalPages} · {total} gia sư
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Sau <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4 h-[calc(100vh-300px)] min-h-[480px]">
            {/* List */}
            <div className="overflow-y-auto scroll-area pr-2 space-y-3">
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="p-3">
                  <div className="flex gap-3 items-center">
                    <div className="h-12 w-12 rounded-xl skeleton-shimmer shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 rounded skeleton-shimmer w-1/2" />
                      <div className="h-3 rounded skeleton-shimmer w-1/3" />
                    </div>
                  </div>
                </Card>
              ))}
              {!loading && tutors.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left transition-all ${selectedId === t.id ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`}
                >
                  <Card className={`p-3 cursor-pointer transition-all rounded-2xl ${selectedId === t.id ? 'ring-2 ring-primary' : 'hover:shadow-e2'}`}>
                    <div className="flex gap-3 items-center">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-extrabold text-lg shrink-0">
                        {t.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <h4 className="font-bold text-sm truncate">{t.name}</h4>
                          {t.distanceKm != null && (
                            <Badge variant="outline" className="text-[10px] py-0 rounded-full">{t.distanceKm}km</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{t.profession}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span className="text-xs font-bold">{t.avgRating.toFixed(1)}</span>
                            <span className="text-[10px] text-muted-foreground">({t.reviewCount})</span>
                          </div>
                          <span className="text-xs font-extrabold text-primary">{formatVnd(t.minPrice)}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </button>
              ))}
            </div>

            {/* Map */}
            <div className={`rounded-2xl overflow-hidden border h-full min-h-[400px] sticky top-44 bg-muted relative ${pickMode ? 'ring-4 ring-primary/30' : ''}`}>
              <Suspense fallback={
                <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                  Đang tải bản đồ...
                </div>
              }>
                <TutorMap
                  tutors={tutors}
                  userLat={userLat}
                  userLng={userLng}
                  pickedLat={pickedLat}
                  pickedLng={pickedLng}
                  pickMode={pickMode}
                  onPickLocation={handlePickLocation}
                  onCancelPick={() => setPickMode(false)}
                  onSelect={setSelectedId}
                  selectedId={selectedId}
                  onLocate={detectLocation}
                />
              </Suspense>
              {/* Nút bật chế độ chọn vị trí */}
              <button
                onClick={() => setPickMode(p => !p)}
                className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2.5 rounded-full text-sm font-bold shadow-e3 transition-colors ${pickMode ? 'bg-primary text-primary-foreground' : 'bg-white text-foreground border'}`}
              >
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {pickMode ? 'Đang chọn vị trí — bấm vào bản đồ' : 'Chọn vị trí trên bản đồ'}
                </span>
              </button>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Sheet bộ lọc chi tiết (mobile-first) */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="right" className="w-[360px] max-w-[90vw] overflow-y-auto scroll-area">
          <SheetHeader>
            <SheetTitle className="text-left">Bộ lọc chi tiết</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {renderAdvancedFilters()}
            <Button className="w-full mt-6 rounded-xl font-semibold" onClick={() => setShowFilters(false)}>
              Xem {total} kết quả
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ===== Card lớp học nhóm — tab "Lớp học" (phong cách Experiences của Airbnb) =====
function ClassCard({ cls, onSelect }: { cls: ClassDiscoverItem; onSelect: () => void }) {
  const full = cls.remaining <= 0
  return (
    <Card
      className="p-0 overflow-hidden cursor-pointer card-lift group"
      onClick={onSelect}
    >
      {/* Cover — gradient theo môn học + icon lớp nhóm */}
      <div className="aspect-[16/9] bg-gradient-to-br from-primary/80 via-primary/60 to-rose-400/70 relative flex items-center justify-center">
        <GraduationCap className="h-12 w-12 text-white/90 drop-shadow" />
        <div className="absolute top-3 left-3 flex gap-1.5">
          <Badge className="bg-white/90 text-foreground border-0 text-[10px] font-bold gap-1">
            <Users className="h-3 w-3" /> Lớp nhóm
          </Badge>
          {cls.gradeLevel && (
            <Badge className="bg-white/90 text-foreground border-0 text-[10px] font-bold">{cls.gradeLevel}</Badge>
          )}
        </div>
        {/* Sĩ số còn trống / danh sách chờ */}
        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5">
          {full ? (
            <Badge className="bg-rose-600 text-white border-0 text-[10px] font-bold gap-1">
              <Hourglass className="h-3 w-3" /> Đã đủ — vào danh sách chờ
            </Badge>
          ) : (
            <Badge className="bg-emerald-600 text-white border-0 text-[10px] font-bold gap-1">
              <Users className="h-3 w-3" /> Còn {cls.remaining} chỗ
            </Badge>
          )}
          {cls.deadlinePassed && (
            <Badge className="bg-rose-100 text-rose-700 border-0 text-[10px] font-bold gap-1">
              <CalendarClock className="h-3 w-3" /> Hết hạn đăng ký
            </Badge>
          )}
        </div>
        {cls.meetingType === 'ONLINE' && (
          <div className="absolute bottom-3 left-3">
            <Badge className="bg-violet-600 text-white border-0 text-[10px] font-bold gap-1">
              <Video className="h-3 w-3" /> Trực tuyến
            </Badge>
          </div>
        )}
      </div>

      <div className="p-4 space-y-2.5">
        <div>
          <h3 className="font-bold text-base truncate group-hover:text-primary transition-colors">
            {cls.title}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {cls.subject.name} · {cls.tutor.name}
            {cls.tutor.isVerified && <BadgeCheck className="h-3 w-3 inline ml-0.5 text-primary" />}
          </p>
        </div>

        {/* Đánh giá gia sư */}
        {(cls.tutor.reviewCount ?? 0) > 0 && (
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-bold">{(cls.tutor.avgRating ?? 0).toFixed(1)}</span>
            <span className="text-[10px] text-muted-foreground">({cls.tutor.reviewCount})</span>
            {cls.tutor.district && (
              <span className="text-[10px] text-muted-foreground ml-1">· {cls.tutor.district}, {cls.tutor.city}</span>
            )}
          </div>
        )}

        {/* Lịch học tuần */}
        <div className="flex flex-wrap gap-1">
          {sortClassSlots(cls.schedule).slice(0, 3).map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold">
              <Clock className="h-2.5 w-2.5" />
              {CLASS_DAY_NAMES[s.dayOfWeek]} {s.startTime}
            </span>
          ))}
        </div>

        {/* Buổi tới */}
        {cls.nextSession ? (
          <p className="text-[11px] text-primary font-medium flex items-center gap-1">
            <CalendarClock className="h-3 w-3 shrink-0" />
            Buổi tới: {formatDate(cls.nextSession.date)} · {cls.nextSession.startTime}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <CalendarClock className="h-3 w-3" /> Lịch sắp xếp khi vào lớp
          </p>
        )}

        {/* Hạn đăng ký — hết hạn thì hiện nổi để phụ huynh không chọn nhầm */}
        {cls.enrollDeadline && (
          <p
            className={`text-[11px] flex items-center gap-1 font-medium ${
              cls.deadlinePassed ? 'text-rose-600' : 'text-sky-600'
            }`}
          >
            <CalendarClock className="h-3 w-3 shrink-0" />
            {cls.deadlinePassed
              ? `Đã hết hạn đăng ký (${formatDate(cls.enrollDeadline)})`
              : `Hạn đăng ký: ${formatDate(cls.enrollDeadline)}`}
          </p>
        )}

        {/* Học phí */}
        <div className="flex items-end justify-between pt-1">
          <div>
            {cls.monthlyFee != null ? (
              <>
                <span className="font-extrabold text-primary text-lg">{formatVnd(cls.monthlyFee)}</span>
                <span className="text-xs text-muted-foreground">/tháng</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Học phí thỏa thuận</span>
            )}
          </div>
          {(cls.waitlistCount ?? 0) > 0 && (
            <span className="text-[10px] text-violet-600 flex items-center gap-1">
              <Hourglass className="h-3 w-3" /> {cls.waitlistCount} chờ chỗ
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
