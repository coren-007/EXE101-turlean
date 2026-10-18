'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useApp } from '@/lib/store'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { HomePage } from '@/components/pages/home-page'
import { SearchPage } from '@/components/pages/search-page'
import { TutorProfilePage } from '@/components/pages/tutor-profile-page'
import { AuthPage } from '@/components/pages/auth-page'
import { DashboardPage } from '@/components/pages/dashboard-page'
import { AdminDashboardPage } from '@/components/pages/admin-dashboard-page'
import { ProfileEditPage } from '@/components/pages/profile-edit-page'
import { OnboardingPage } from '@/components/pages/onboarding-page'
import { MessagesPage } from '@/components/pages/messages-page'
import { FavoritesPage } from '@/components/pages/favorites-page'

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
