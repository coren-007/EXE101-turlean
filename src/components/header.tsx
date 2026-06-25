'use client'

import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BookOpen, LayoutDashboard, LogOut, Menu, User, GraduationCap, Heart, ChevronDown, CalendarCheck, BookOpenCheck, ExternalLink } from 'lucide-react'
import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'

export function Header() {
  const { user, navigate, clearUser, view } = useApp()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    clearUser()
    navigate({ name: 'home' })
  }

  const isActive = (name: string) => view.name === name

  const renderNavLinks = () => (
    <>
      <button
        onClick={() => { navigate({ name: 'home' }); setMobileOpen(false) }}
        className={`text-sm font-medium transition-colors hover:text-primary ${isActive('home') ? 'text-primary' : 'text-foreground'}`}
      >
        Trang chủ
      </button>
      {/* Student/guest: see "Tìm gia sư" */}
      {(!user || user.role === 'STUDENT') && (
        <button
          onClick={() => { navigate({ name: 'search' }); setMobileOpen(false) }}
          className={`text-sm font-medium transition-colors hover:text-primary ${isActive('search') ? 'text-primary' : 'text-foreground'}`}
        >
          Tìm gia sư
        </button>
      )}
      {/* Tutor: see "Lịch trống" shortcut */}
      {user?.role === 'TUTOR' && (
        <button
          onClick={() => { navigate({ name: 'manage-availability' }); setMobileOpen(false) }}
          className={`text-sm font-medium transition-colors hover:text-primary ${isActive('manage-availability') ? 'text-primary' : 'text-foreground'}`}
        >
          Lịch trống
        </button>
      )}
      {/* Guest only: "Trở thành gia sư" */}
      {!user && (
        <button
          onClick={() => { navigate({ name: 'register' }); setMobileOpen(false) }}
          className="text-sm font-medium transition-colors hover:text-primary text-foreground"
        >
          Trở thành gia sư
        </button>
      )}
    </>
  )

  return (
    <header className={`sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 transition-shadow ${scrolled ? 'shadow-sm' : ''}`}>
      <div className="container mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <button
            onClick={() => navigate({ name: 'home' })}
            className="flex items-center gap-2 shrink-0"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              GiaSu<span className="text-primary">Connect</span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {renderNavLinks()}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-2 hover:bg-accent">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar || undefined} alt={user.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">{user.name}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-semibold truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-semibold uppercase tracking-wide">
                      {user.role === 'TUTOR' ? 'Gia sư' : 'Phụ huynh/Học sinh'}
                    </span>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ name: 'dashboard' })} className="cursor-pointer">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Bảng điều khiển
                  </DropdownMenuItem>
                  {user.role === 'TUTOR' && (
                    <>
                      <DropdownMenuItem onClick={() => navigate({ name: 'manage-subjects' })} className="cursor-pointer">
                        <BookOpenCheck className="h-4 w-4 mr-2" />
                        Quản lý môn dạy
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate({ name: 'manage-availability' })} className="cursor-pointer">
                        <CalendarCheck className="h-4 w-4 mr-2" />
                        Lịch trống
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate({ name: 'my-profile' })} className="cursor-pointer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Hồ sơ công khai
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem onClick={() => navigate({ name: 'profile-edit' })} className="cursor-pointer">
                    <User className="h-4 w-4 mr-2" />
                    Chỉnh sửa hồ sơ
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate({ name: 'search' })} className="cursor-pointer">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Tìm gia sư
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'login' })}>
                  Đăng nhập
                </Button>
                <Button size="sm" onClick={() => navigate({ name: 'register' })}>
                  Đăng ký
                </Button>
              </div>
            )}

            {/* Mobile menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px]">
                <SheetTitle className="text-left">Menu</SheetTitle>
                <div className="flex flex-col gap-4 mt-6">
                  {renderNavLinks()}
                  {!user && (
                    <>
                      <Button onClick={() => { navigate({ name: 'login' }); setMobileOpen(false) }} className="w-full">
                        Đăng nhập
                      </Button>
                      <Button variant="outline" onClick={() => { navigate({ name: 'register' }); setMobileOpen(false) }} className="w-full">
                        Đăng ký
                      </Button>
                    </>
                  )}
                  {user && (
                    <>
                      <Button onClick={() => { navigate({ name: 'dashboard' }); setMobileOpen(false) }} className="w-full">
                        Bảng điều khiển
                      </Button>
                      <Button variant="outline" onClick={handleLogout} className="w-full">
                        Đăng xuất
                      </Button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}
