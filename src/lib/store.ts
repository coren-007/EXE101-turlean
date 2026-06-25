import { create } from 'zustand'

export type View =
  | { name: 'home' }
  | { name: 'search'; subject?: string; mode?: string; lat?: number; lng?: number; district?: string }
  | { name: 'tutor'; id: string }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'dashboard' }
  | { name: 'profile-edit' }
  | { name: 'onboarding' }
  | { name: 'manage-subjects' }
  | { name: 'manage-availability' }
  | { name: 'my-profile' }

interface AppState {
  view: View
  user: {
    id: string
    email: string
    name: string
    role: 'TUTOR' | 'STUDENT'
    avatar?: string | null
    phone?: string | null
    district?: string | null
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
      subject: params.get('subject') || undefined,
      mode: params.get('mode') || undefined,
      district: params.get('district') || undefined,
      lat: params.get('lat') ? Number(params.get('lat')) : undefined,
      lng: params.get('lng') ? Number(params.get('lng')) : undefined,
    }
  }
  if (v === 'tutor' && params.get('id')) return { name: 'tutor', id: params.get('id')! }
  if (v === 'login') return { name: 'login' }
  if (v === 'register') return { name: 'register' }
  if (v === 'dashboard') return { name: 'dashboard' }
  if (v === 'profile-edit') return { name: 'profile-edit' }
  if (v === 'onboarding') return { name: 'onboarding' }
  if (v === 'manage-subjects') return { name: 'manage-subjects' }
  if (v === 'manage-availability') return { name: 'manage-availability' }
  if (v === 'my-profile') return { name: 'my-profile' }
  return { name: 'home' }
}

function updateUrl(view: View) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams()
  if (view.name === 'search') {
    params.set('view', 'search')
    if (view.subject) params.set('subject', view.subject)
    if (view.mode) params.set('mode', view.mode)
    if (view.district) params.set('district', view.district)
    if (view.lat) params.set('lat', String(view.lat))
    if (view.lng) params.set('lng', String(view.lng))
  } else if (view.name === 'tutor') {
    params.set('view', 'tutor')
    params.set('id', view.id)
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
