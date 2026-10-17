import { create } from 'zustand'

export type View =
  | { name: 'home' }
  | {
      name: 'search'
      // Filter tìm kiếm — đồng bộ đầy đủ vào URL để chia sẻ được link kết quả
      q?: string
      subject?: string
      city?: string
      mode?: string
      district?: string
      level?: string
      maxPrice?: number
      minRating?: number
      sort?: string
      lat?: number
      lng?: number
      // P5: lọc khung giờ dạy + gia sư đã xác minh + số trang
      availDay?: number
      availSlot?: string
      verified?: boolean
      page?: number
      radius?: number
    }
  | { name: 'tutor'; id: string; classId?: string }
  | { name: 'favorites' }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'dashboard'; tab?: 'overview' | 'subjects' | 'schedule' | 'classes' | 'verification' }
  | { name: 'profile-edit' }
  | { name: 'onboarding' }
  | { name: 'manage-subjects' }
  | { name: 'manage-availability' }
  | { name: 'my-profile' }
  | { name: 'messages'; conversationId?: string }

interface AppState {
  view: View
  user: {
    id: string
    email: string
    name: string
    role: 'TUTOR' | 'STUDENT' | 'ADMIN'
    avatar?: string | null
    phone?: string | null
    district?: string | null
    city?: string | null
  } | null
  navigate: (view: View) => void
  setUser: (user: AppState['user']) => void
  clearUser: () => void
}

// Parse initial view from URL query
function parseInitialView(): View {
  if (typeof window === 'undefined') return { name: 'home' }
  const params = new URLSearchParams(window.location.search)
  const v = params.get('view')
  if (v === 'search') {
    return {
      name: 'search',
      q: params.get('q') || undefined,
      subject: params.get('subject') || undefined,
      city: params.get('city') || undefined,
      mode: params.get('mode') || undefined,
      district: params.get('district') || undefined,
      level: params.get('level') || undefined,
      maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined,
      minRating: params.get('minRating') ? Number(params.get('minRating')) : undefined,
      sort: params.get('sort') || undefined,
      lat: params.get('lat') ? Number(params.get('lat')) : undefined,
      lng: params.get('lng') ? Number(params.get('lng')) : undefined,
      availDay: params.get('availDay') !== null && !Number.isNaN(Number(params.get('availDay'))) ? Number(params.get('availDay')) : undefined,
      availSlot: params.get('availSlot') || undefined,
      verified: params.get('verified') === 'true' || undefined,
      page: params.get('page') && !Number.isNaN(Number(params.get('page'))) ? Number(params.get('page')) : undefined,
      radius: params.get('radius') && !Number.isNaN(Number(params.get('radius'))) ? Number(params.get('radius')) : undefined,
    }
  }
  if (v === 'tutor' && params.get('id')) {
    return { name: 'tutor', id: params.get('id')!, classId: params.get('class') || undefined }
  }
  if (v === 'favorites') return { name: 'favorites' }
  if (v === 'login') return { name: 'login' }
  if (v === 'register') return { name: 'register' }
  if (v === 'dashboard') {
    const t = params.get('tab')
    const valid = ['overview', 'subjects', 'schedule', 'classes', 'verification']
    return { name: 'dashboard', tab: valid.includes(t || '') ? (t as any) : undefined }
  }
  if (v === 'profile-edit') return { name: 'profile-edit' }
  if (v === 'onboarding') return { name: 'onboarding' }
  if (v === 'manage-subjects') return { name: 'manage-subjects' }
  if (v === 'manage-availability') return { name: 'manage-availability' }
  if (v === 'my-profile') return { name: 'my-profile' }
  if (v === 'messages') return { name: 'messages', conversationId: params.get('c') || undefined }
  return { name: 'home' }
}

function updateUrl(view: View) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams()
  if (view.name === 'search') {
    params.set('view', 'search')
    if (view.q) params.set('q', view.q)
    if (view.subject) params.set('subject', view.subject)
    if (view.city) params.set('city', view.city)
    if (view.mode) params.set('mode', view.mode)
    if (view.district) params.set('district', view.district)
    if (view.level) params.set('level', view.level)
    if (view.maxPrice != null) params.set('maxPrice', String(view.maxPrice))
    if (view.minRating != null) params.set('minRating', String(view.minRating))
    if (view.sort) params.set('sort', view.sort)
    if (view.lat) params.set('lat', String(view.lat))
    if (view.lng) params.set('lng', String(view.lng))
    if (view.availDay != null) params.set('availDay', String(view.availDay))
    if (view.availSlot) params.set('availSlot', view.availSlot)
    if (view.verified) params.set('verified', 'true')
    if (view.page && view.page > 1) params.set('page', String(view.page))
    if (view.radius != null && view.radius !== 15) params.set('radius', String(view.radius))
  } else if (view.name === 'favorites') {
    params.set('view', 'favorites')
  } else if (view.name === 'tutor') {
    params.set('view', 'tutor')
    params.set('id', view.id)
    if (view.classId) params.set('class', view.classId)
  } else if (view.name === 'dashboard') {
    params.set('view', 'dashboard')
    if (view.tab && view.tab !== 'overview') params.set('tab', view.tab)
  } else if (view.name === 'messages') {
    params.set('view', 'messages')
    if (view.conversationId) params.set('c', view.conversationId)
  } else if (view.name !== 'home') {
    params.set('view', view.name)
  }
  const qs = params.toString()
  const newUrl = qs ? `/?${qs}` : '/'
  window.history.pushState({}, '', newUrl)
}

export const useApp = create<AppState>((set) => ({
  view: typeof window !== 'undefined' ? parseInitialView() : { name: 'home' },
  user: null,
  navigate: (view) => {
    updateUrl(view)
    set({ view })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  },
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}))

// Listen for popstate (back/forward)
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    useApp.setState({ view: parseInitialView() })
  })
}
