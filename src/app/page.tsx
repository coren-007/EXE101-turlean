'use client'

// OPT-1 (hiệu năng initial load): SPA có 12 view, tổng ~10.000 dòng code client.
// Trước đây page.tsx import tĩnh TOÀN BỘ view → mọi user phải tải JS của dashboard,
// admin, onboarding... ngay từ đầu dù chỉ xem trang chủ.
// Giờ chỉ HomePage (landing) giữ import tĩnh; các view còn lại lazy-load qua
// next/dynamic + skeleton — chunk riêng được tải đúng lúc cần.

import { useEffect, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { useApp } from '@/lib/store'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { HomePage } from '@/components/pages/home-page'

// Skeleton chung cho các view đang tải chunk — giữ chiều cao lớn tránh giật layout
function ViewSkeleton() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-10" aria-busy="true" aria-label="Đang tải trang">
      <div className="h-8 w-56 rounded-lg bg-muted animate-pulse mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-64 rounded-xl bg-muted/60 animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// Lazy-load: chunk chỉ được tải khi user thực sự chuyển sang view tương ứng
const SearchPage = dynamic(() => import('@/components/pages/search-page').then(m => ({ default: m.SearchPage })), { loading: () => <ViewSkeleton /> })
const TutorProfilePage = dynamic(() => import('@/components/pages/tutor-profile-page').then(m => ({ default: m.TutorProfilePage })), { loading: () => <ViewSkeleton /> })
const AuthPage = dynamic(() => import('@/components/pages/auth-page').then(m => ({ default: m.AuthPage })), { loading: () => <ViewSkeleton /> })
const DashboardPage = dynamic(() => import('@/components/pages/dashboard-page').then(m => ({ default: m.DashboardPage })), { loading: () => <ViewSkeleton /> })
const AdminDashboardPage = dynamic(() => import('@/components/pages/admin-dashboard-page').then(m => ({ default: m.AdminDashboardPage })), { loading: () => <ViewSkeleton /> })
const ProfileEditPage = dynamic(() => import('@/components/pages/profile-edit-page').then(m => ({ default: m.ProfileEditPage })), { loading: () => <ViewSkeleton /> })
const OnboardingPage = dynamic(() => import('@/components/pages/onboarding-page').then(m => ({ default: m.OnboardingPage })), { loading: () => <ViewSkeleton /> })
const MessagesPage = dynamic(() => import('@/components/pages/messages-page').then(m => ({ default: m.MessagesPage })), { loading: () => <ViewSkeleton /> })
const FavoritesPage = dynamic(() => import('@/components/pages/favorites-page').then(m => ({ default: m.FavoritesPage })), { loading: () => <ViewSkeleton /> })

export default function Home() {
  const { view, user, setUser } = useApp()

  // P5-fix: hydration an toàn — SSR luôn render view 'home', client cũng render 'home'
  // trong lần hydrate ĐẦU TIÊN (kể cả khi URL có ?view=...), chỉ chuyển sang view thật
  // sau khi mount. Tránh React #418 (hydration mismatch) khi mở trực tiếp link chia sẻ
  // dạng /?view=search, /?view=login, /?view=tutor&id=...
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const activeView = mounted ? view : ({ name: 'home' } as const)

  // Load user on mount
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            avatar: data.user.avatar,
            phone: data.user.phone,
            district: data.user.district,
            city: data.user.city,
          })
        }
      })
      .catch(() => {})
  }, [setUser])

  const renderView = () => {
    switch (activeView.name) {
      case 'home': return <HomePage />
      case 'search': return <SearchPage key={JSON.stringify(activeView)} />
      case 'tutor': return <TutorProfilePage id={activeView.id} />
      case 'login': return <AuthPage initialMode="login" />
      case 'register': return <AuthPage initialMode="register" />
      case 'dashboard': return user?.role === 'ADMIN' ? <AdminDashboardPage /> : <DashboardPage />
      case 'profile-edit': return <ProfileEditPage />
      case 'onboarding': return <OnboardingPage />
      // View cũ (tương thích URL) — dashboard tự chuyển hướng vào tab tương ứng
      case 'manage-subjects': return <DashboardPage />
      case 'manage-availability': return <DashboardPage />
      case 'messages': return <MessagesPage initialConversationId={activeView.conversationId} />
      case 'favorites': return <FavoritesPage />
      case 'my-profile': return user ? <TutorProfilePage id={user.id} /> : <HomePage />
      default: return <HomePage />
    }
  }

  // Auth pages and onboarding don't show header/footer
  const isFullPage = activeView.name === 'login' || activeView.name === 'register' || activeView.name === 'onboarding'

  if (isFullPage) {
    if (activeView.name === 'login' || activeView.name === 'register') {
      return (
        <div className="min-h-screen flex flex-col bg-muted/20">
          <AuthPage initialMode={activeView.name === 'register' ? 'register' : 'login'} />
        </div>
      )
    }
    return <OnboardingPage />
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {renderView()}
      </main>
      <Footer />
    </div>
  )
}
