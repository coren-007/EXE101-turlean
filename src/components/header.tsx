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
import { LogOut, Menu, GraduationCap, ChevronDown, ExternalLink, MessageSquare, LayoutDashboard, Search } from 'lucide-react'
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
  // Badge số tin nhắn chưa đọc (poll 30s)
  const [unreadCount, setUnreadCount] = useState(0)
  // Derive: chưa đăng nhập thì badge luôn là 0 (tránh setState trực tiếp trong effect)
  const unread = user ? unreadCount : 0

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!user) return
    let alive = true
    const poll = () => {
      fetch('/api/conversations')
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (alive && data?.totalUnread != null) setUnreadCount(data.totalUnread)
        })
        .catch(() => {})
    }
    poll()
    const timer = setInterval(poll, 30_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [user, view])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    clearUser()
    navigate({ name: 'home' })
  }

  const isActive = (name: string) => view.name === name

  const navItems: { label: string; view: any; show: boolean }[] = [
    { label: 'Khám phá', view: { name: 'home' }, show: true },
    { label: 'Tìm gia sư', view: { name: 'search' }, show: !user || user.role === 'STUDENT' },
    { label: 'Trang quản lý', view: { name: 'dashboard' }, show: !!user },
  ].filter(i => i.show)

  return (
    <header className={`sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 transition-shadow ${scrolled ? 'shadow-e1' : ''}`}>
      <div className="container mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <button
            onClick={() => navigate({ name: 'home' })}
            className="flex items-center gap-2 shrink-0"
            aria-label="GiaSuConnect — Trang chủ"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-e1">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-extrabold tracking-tight">
              GiaSu<span className="text-primary">Connect</span>
            </span>
          </button>

          {/* Center nav — pill tabs kiểu Airbnb */}
          <nav className="hidden md:flex items-center bg-muted/60 rounded-full p-1 gap-1">
            {navItems.map(item => (
              <button
                key={item.label}
                onClick={() => navigate(item.view)}
                className={`px-4 h-9 rounded-full text-sm font-semibold transition-all ${
                  isActive(item.view.name)
                    ? 'bg-background text-foreground shadow-e1'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Guest: CTA trở thành gia sư */}
            {!user && (
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex rounded-full font-semibold"
                onClick={() => navigate({ name: 'register' })}
              >
                Trở thành gia sư
              </Button>
            )}

            {/* Tin nhắn với badge chưa đọc */}
            {user && (
              <Button
                variant="ghost"
                size="icon"
                className="relative h-10 w-10 rounded-full"
                onClick={() => navigate({ name: 'messages' })}
                aria-label={`Tin nhắn${unread > 0 ? ` (${unread} chưa đọc)` : ''}`}
              >
                <MessageSquare className={`h-5 w-5 ${view.name === 'messages' ? 'text-primary' : ''}`} />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Button>
            )}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-1.5 h-10 rounded-full hover:bg-accent border border-transparent hover:border-border">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar || undefined} alt={user.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                        {user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm font-semibold max-w-[110px] truncate">{user.name}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-semibold truncate">{user.name}</p>
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-semibold uppercase tracking-wide">
                      {user.role === 'TUTOR' ? 'Gia sư' : 'Phụ huynh/Học sinh'}
                    </span>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ name: 'dashboard' })} className="cursor-pointer">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Trang quản lý
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate({ name: 'messages' })} className="cursor-pointer">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Tin nhắn
                    {unread > 0 && (
                      <span className="ml-auto h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </DropdownMenuItem>
                  {user.role === 'TUTOR' ? (
                    <DropdownMenuItem onClick={() => navigate({ name: 'my-profile' })} className="cursor-pointer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Hồ sơ công khai
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => navigate({ name: 'search' })} className="cursor-pointer">
                      <Search className="h-4 w-4 mr-2" />
                      Tìm gia sư
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-full font-semibold" onClick={() => navigate({ name: 'login' })}>
                  Đăng nhập
                </Button>
                <Button size="sm" className="rounded-full font-semibold" onClick={() => navigate({ name: 'register' })}>
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
                <div className="flex flex-col gap-3 mt-6">
                  {navItems.map(item => (
                    <Button
                      key={item.label}
                      variant={isActive(item.view.name) ? 'default' : 'outline'}
                      className="w-full justify-start rounded-xl"
                      onClick={() => { navigate(item.view); setMobileOpen(false) }}
                    >
                      {item.label}
                    </Button>
                  ))}
                  {!user && (
                    <>
                      <Button className="w-full rounded-xl" onClick={() => { navigate({ name: 'login' }); setMobileOpen(false) }}>
                        Đăng nhập
                      </Button>
                      <Button variant="outline" className="w-full rounded-xl" onClick={() => { navigate({ name: 'register' }); setMobileOpen(false) }}>
                        Trở thành gia sư
                      </Button>
                    </>
                  )}
                  {user && (
                    <>
                      <Button variant="outline" className="w-full rounded-xl" onClick={() => { navigate({ name: 'messages' }); setMobileOpen(false) }}>
                        <MessageSquare className="h-4 w-4 mr-1" /> Tin nhắn
                        {unread > 0 && (
                          <span className="ml-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                            {unread > 9 ? '9+' : unread}
                          </span>
                        )}
                      </Button>
                      <Button variant="outline" className="w-full rounded-xl text-destructive" onClick={handleLogout}>
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
