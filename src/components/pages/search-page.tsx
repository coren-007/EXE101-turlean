'use client'

import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TutorCard, Tutor } from '@/components/tutor-card'
import {
  Search, MapPin, Home, School, SlidersHorizontal, LayoutGrid, Map as MapIcon,
  X, Navigation, Star, GraduationCap
} from 'lucide-react'
import { formatVnd } from '@/lib/format'

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

export function SearchPage() {
  const { view, navigate } = useApp()
  const initial = view.name === 'search' ? view : { subject: '', mode: '', district: '', lat: undefined, lng: undefined }
  const saved = typeof window !== 'undefined' ? loadSavedFilters() : {}

  const [tutors, setTutors] = useState<Tutor[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

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
  const [sort, setSort] = useState<'rating' | 'price_asc' | 'price_desc' | 'distance'>(saved.sort as any || 'rating')
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
      alert('Trình duyệt không hỗ trợ định vị. Hãy click vào bản đồ để chọn vị trí.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        // Clear picked when using real geolocation
        setPickedLat(undefined)
        setPickedLng(undefined)
        setLocating(false)
      },
      () => {
        setLocating(false)
        alert('Không lấy được vị trí. Hãy cho phép truy cập vị trí hoặc click vào bản đồ để chọn.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Pick location from map click
  const handlePickLocation = (lat: number, lng: number) => {
    setPickedLat(lat)
    setPickedLng(lng)
    // Clear user geolocation when manually picking
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

  // Build query string and fetch
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
    return params.toString()
  }, [search, city, district, level, mode, maxPrice, minRating, effectiveLat, effectiveLng, sort])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/tutors?${queryString}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setTutors(data.tutors || [])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [queryString])

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

  const renderFilterPanel = () => {
    const availableDistricts = locations.find(l => l.city === city)?.districts || []

    return (
    <div className="space-y-6">
      {/* Level filter */}
      <div>
        <Label className="text-sm font-semibold mb-3 block flex items-center gap-1">
          <GraduationCap className="h-4 w-4 text-primary" /> Cấp học
        </Label>
        <div className="grid grid-cols-4 gap-1.5">
          {LEVELS.map(l => (
            <button
              key={l.value}
              onClick={() => setLevel(l.value)}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                level === l.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/70 text-foreground'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Mode filter - the differentiator */}
      <div>
        <Label className="text-sm font-semibold mb-3 block">Phương thức học</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode(mode === 'TUTOR_TO_STUDENT' ? '' : 'TUTOR_TO_STUDENT')}
            className={`p-3 rounded-xl border-2 text-left transition-all ${
              mode === 'TUTOR_TO_STUDENT'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/30'
            }`}
          >
            <Home className={`h-5 w-5 mb-1 ${mode === 'TUTOR_TO_STUDENT' ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-xs font-semibold">Gia sư đến nhà</p>
            <p className="text-[10px] text-muted-foreground">Tiện lợi cho HS</p>
          </button>
          <button
            onClick={() => setMode(mode === 'STUDENT_TO_TUTOR' ? '' : 'STUDENT_TO_TUTOR')}
            className={`p-3 rounded-xl border-2 text-left transition-all ${
              mode === 'STUDENT_TO_TUTOR'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/30'
            }`}
          >
            <School className={`h-5 w-5 mb-1 ${mode === 'STUDENT_TO_TUTOR' ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-xs font-semibold">Đến cơ sở</p>
            <p className="text-[10px] text-muted-foreground">Có thiết bị</p>
          </button>
        </div>
      </div>

      <Separator />

      {/* City filter */}
      <div>
        <Label className="text-sm font-semibold mb-3 block flex items-center gap-1">
          <MapPin className="h-4 w-4 text-primary" /> Tỉnh/Thành phố
        </Label>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scroll-area">
          <button
            onClick={() => setCity('')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              !city
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/70 text-foreground'
            }`}
          >
            Tất cả
          </button>
          {locations.map(loc => (
            <button
              key={loc.city}
              onClick={() => changeCity(loc.city === city ? '' : loc.city)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                city === loc.city
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/70 text-foreground'
              }`}
            >
              {loc.city} <span className="opacity-60">({loc.tutorCount})</span>
            </button>
          ))}
        </div>
      </div>

      {/* District filter (only show if city selected) */}
      {city && availableDistricts.length > 0 && (
        <>
          <Separator />
          <div>
            <Label className="text-sm font-semibold mb-3 block">Quận/Huyện</Label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scroll-area">
              <button
                onClick={() => setDistrict('')}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  !district
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/70 text-foreground'
                }`}
              >
                Tất cả
              </button>
              {availableDistricts.map(d => (
                <button
                  key={d.name}
                  onClick={() => setDistrict(district === d.name ? '' : d.name)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    district === d.name
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/70 text-foreground'
                  }`}
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
          <Label className="text-sm font-semibold">Học phí tối đa</Label>
          <span className="text-sm font-bold text-primary">{formatVnd(maxPrice)}</span>
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
        <Label className="text-sm font-semibold mb-3 block">Đánh giá tối thiểu</Label>
        <div className="flex gap-1.5">
          {[0, 3, 4, 4.5].map(r => (
            <button
              key={r}
              onClick={() => setMinRating(r)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                minRating === r
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/70'
              }`}
            >
              {r === 0 ? 'Tất cả' : `${r}★+`}
            </button>
          ))}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
          <X className="h-3.5 w-3.5 mr-1" /> Xóa bộ lọc ({activeFilterCount})
        </Button>
      )}
    </div>
    )
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      {/* Search header */}
      <div className="mb-6">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên gia sư, môn học, nghề nghiệp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-11 lg:hidden"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            className="h-11"
            onClick={detectLocation}
            disabled={locating}
            title="Sử dụng GPS để định vị vị trí của bạn"
          >
            <Navigation className={`h-4 w-4 mr-1 ${locating ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{locating ? 'Đang định vị...' : 'Vị trí của tôi'}</span>
          </Button>
          <Button
            variant={pickMode ? 'default' : 'outline'}
            className="h-11"
            onClick={() => setPickMode(p => !p)}
            title="Click vào bản đồ để chọn vị trí tìm kiếm"
          >
            <MapPin className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{pickMode ? 'Đang chọn...' : 'Chọn trên bản đồ'}</span>
          </Button>
        </div>

        {/* Active filter chips */}
        {(district || mode || city || level || effectiveLat != null) && (
          <div className="flex gap-2 flex-wrap">
            {level && (
              <Badge variant="secondary" className="gap-1">
                <GraduationCap className="h-3 w-3" /> {LEVELS.find(l => l.value === level)?.label}
                <button onClick={() => setLevel('')}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {mode === 'TUTOR_TO_STUDENT' && (
              <Badge variant="secondary" className="gap-1">
                <Home className="h-3 w-3" /> Gia sư đến nhà
                <button onClick={() => setMode('')}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {mode === 'STUDENT_TO_TUTOR' && (
              <Badge variant="secondary" className="gap-1">
                <School className="h-3 w-3" /> Đến cơ sở
                <button onClick={() => setMode('')}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {city && (
              <Badge variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" /> {city}
                <button onClick={() => setCity('')}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {district && (
              <Badge variant="secondary" className="gap-1">
                {district}
                <button onClick={() => setDistrict('')}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {effectiveLat != null && (
              <Badge variant="secondary" className="gap-1">
                <Navigation className="h-3 w-3 text-blue-600" />
                {userLat != null ? 'Vị trí của tôi' : 'Vị trí đã chọn'}
                {effectiveLat.toFixed(3)}, {effectiveLng?.toFixed(3)}
                <button onClick={clearLocation}><X className="h-3 w-3" /></button>
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-6">
        {/* Sidebar filters (desktop) */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-20">
            <Card className="p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" /> Bộ lọc
              </h3>
              {renderFilterPanel()}
            </Card>
          </div>
        </aside>

        {/* Mobile filter sheet */}
        {showFilters && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setShowFilters(false)}>
            <Card
              className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] p-5 overflow-y-auto scroll-area rounded-l-2xl rounded-r-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Bộ lọc</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowFilters(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {renderFilterPanel()}
              <Button className="w-full mt-4" onClick={() => setShowFilters(false)}>
                Xem {tutors.length} kết quả
              </Button>
            </Card>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">
                {loading ? 'Đang tìm...' : `${tutors.length} gia sư`}
              </h2>
              {userLat != null && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Navigation className="h-3 w-3 text-blue-600" /> Đang lọc theo vị trí
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Sort */}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="text-sm border rounded-lg px-2 py-1.5 bg-background"
              >
                <option value="rating">Đánh giá cao</option>
                <option value="price_asc">Giá thấp → cao</option>
                <option value="price_desc">Giá cao → thấp</option>
                {userLat && <option value="distance">Gần nhất</option>}
              </select>

              {/* View mode */}
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                <TabsList className="h-9">
                  <TabsTrigger value="grid" className="px-2"><LayoutGrid className="h-4 w-4" /></TabsTrigger>
                  <TabsTrigger value="map" className="px-2"><MapIcon className="h-4 w-4" /></TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {viewMode === 'grid' ? (
            <>
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
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
              ) : tutors.length === 0 ? (
                <Card className="p-12 text-center">
                  <Search className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-1">Không tìm thấy gia sư phù hợp</h3>
                  <p className="text-sm text-muted-foreground mb-4">Thử bỏ bớt bộ lọc hoặc thay đổi từ khóa</p>
                  <Button variant="outline" onClick={clearFilters}>Xóa bộ lọc</Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {tutors.map(t => (
                    <TutorCard key={t.id} tutor={t} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="grid lg:grid-cols-2 gap-4 h-[calc(100vh-220px)]">
              {/* List */}
              <div className="overflow-y-auto scroll-area pr-2 space-y-3">
                {tutors.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left transition-all ${selectedId === t.id ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`}
                  >
                    <Card className={`p-3 cursor-pointer transition-all ${selectedId === t.id ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}>
                      <div className="flex gap-3 items-center">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                          {t.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <h4 className="font-semibold text-sm truncate">{t.name}</h4>
                            {t.distanceKm != null && (
                              <Badge variant="outline" className="text-[10px] py-0">{t.distanceKm}km</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{t.profession}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              <span className="text-xs font-semibold">{t.avgRating.toFixed(1)}</span>
                              <span className="text-[10px] text-muted-foreground">({t.reviewCount})</span>
                            </div>
                            <span className="text-xs font-bold text-primary">{formatVnd(t.minPrice)}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </button>
                ))}
              </div>

              {/* Map */}
              <div className={`rounded-2xl overflow-hidden border h-full min-h-[400px] sticky top-20 bg-muted relative ${pickMode ? 'ring-4 ring-primary/30' : ''}`}>
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
