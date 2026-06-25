'use client'

import { useEffect } from 'react'
import { useApp } from '@/lib/store'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { HomePage } from '@/components/pages/home-page'
import { SearchPage } from '@/components/pages/search-page'
import { TutorProfilePage } from '@/components/pages/tutor-profile-page'
import { AuthPage } from '@/components/pages/auth-page'
import { DashboardPage } from '@/components/pages/dashboard-page'
import { ProfileEditPage } from '@/components/pages/profile-edit-page'
import { OnboardingPage } from '@/components/pages/onboarding-page'
import { ManageSubjectsPage } from '@/components/pages/manage-subjects-page'
import { ManageAvailabilityPage } from '@/components/pages/manage-availability-page'

export default function Home() {
  const { view, user, setUser, navigate } = useApp()

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
          })
        }
      })
      .catch(() => {})
  }, [setUser])

  const renderView = () => {
    switch (view.name) {
      case 'home': return <HomePage />
      case 'search': return <SearchPage />
      case 'tutor': return <TutorProfilePage id={view.id} />
      case 'login': return <AuthPage initialMode="login" />
      case 'register': return <AuthPage initialMode="register" />
      case 'dashboard': return <DashboardPage />
      case 'profile-edit': return <ProfileEditPage />
      case 'onboarding': return <OnboardingPage />
      case 'manage-subjects': return <ManageSubjectsPage />
      case 'manage-availability': return <ManageAvailabilityPage />
      case 'my-profile': return user ? <TutorProfilePage id={user.id} /> : <HomePage />
      default: return <HomePage />
    }
  }

  // Auth pages and onboarding don't show header/footer
  const isFullPage = view.name === 'login' || view.name === 'register' || view.name === 'onboarding'

  if (isFullPage) {
    if (view.name === 'login' || view.name === 'register') {
      return (
        <div className="min-h-screen flex flex-col bg-muted/20">
          <AuthPage initialMode={view.name === 'register' ? 'register' : 'login'} />
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
