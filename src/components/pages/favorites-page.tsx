'use client'

// Trang "Gia sư đã lưu" (wishlist) — lưới TutorCard những gia sư user đã heart
// Guest: đọc localStorage (tự merge lên DB khi đăng nhập); đã login: đọc DB.
// P5: kèm dải "Đã xem gần đây" — quay lại hồ sơ vừa mở nhanh hơn (localStorage, không cần login).
import { useEffect, useState } from 'react'
import { Heart, Search, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TutorCard, Tutor } from '@/components/tutor-card'
import { useApp } from '@/lib/store'
import { useFavorites } from '@/lib/favorites'
import { getRecentlyViewed } from '@/lib/recently-viewed'

export function FavoritesPage() {
  const { user, navigate } = useApp()
  const { ids, load } = useFavorites()
  const [tutors, setTutors] = useState<Tutor[] | null>(null)

  // P5: "Đã xem gần đây"
  const [recent, setRecent] = useState<Tutor[]>([])
  useEffect(() => {
    const viewed = getRecentlyViewed()
    if (viewed.length === 0) return
    fetch(`/api/tutors?ids=${viewed.join(',')}`)
      .then(r => r.ok ? r.json() : { tutors: [] })
      .then(data => {
        // Bỏ những ai đã nằm trong wishlist (tránh trùng lặp 2 khối)
        const savedSet = new Set(ids)
        setRecent((data.tutors || []).filter(t => !savedSet.has(t.id)).slice(0, 6))
      })
      .catch(() => {})
  }, [ids.join(',')])

  // Load wishlist store theo role (guest → localStorage, login → DB)
  useEffect(() => {
    void load(user ? { id: user.id } : null)
  }, [user?.id, load])

  // Lấy hồ sơ đầy đủ các gia sư đã lưu:
  // * Đã login → GET /api/favorites trả đúng danh sách theo thứ tự lưu gần nhất
  // * Guest → lọc từ danh sách gia sư công khai theo id trong localStorage
  useEffect(() => {
    if (ids.length === 0) return
    let cancelled = false
    ;(user
      ? fetch('/api/favorites').then(r => r.ok ? r.json() : { tutors: [] })
      : fetch('/api/tutors?pageSize=50&sort=rating').then(r => r.json()).then(data => {
          const idSet = new Set(ids)
          return { tutors: (data.tutors || []).filter((t: Tutor) => idSet.has(t.id)) }
        })
    )
      .then(data => {
        if (!cancelled) setTutors(data.tutors || [])
      })
      .catch(() => { if (!cancelled) setTutors([]) })
    return () => { cancelled = true }

  }, [ids.join(','), user?.id])

  // ids rỗng → chắc chắn danh sách trống (không cần chờ fetch)
  const isEmpty = ids.length === 0 || (tutors !== null && tutors.length === 0)

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <Heart className="h-6 w-6 fill-rose-500 text-rose-500" />
              Gia sư đã lưu
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tutors === null ? 'Đang tải danh sách...' : `${tutors.length} gia sư trong danh sách yêu thích`}
              {!user && !isEmpty && (
                <span className="text-amber-600"> · Đăng nhập để đồng bộ lâu dài giữa các thiết bị</span>
              )}
            </p>
          </div>
          <Button variant="outline" className="rounded-full font-semibold" onClick={() => navigate({ name: 'search' })}>
            <Search className="h-4 w-4 mr-1.5" /> Tìm thêm gia sư
          </Button>
        </div>

        {/* Lưới kết quả */}
        {tutors === null && !isEmpty ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 border border-rose-100">
              <Heart className="h-7 w-7 text-rose-300" />
            </div>
            <h2 className="text-lg font-bold">Chưa lưu gia sư nào</h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Khi tìm kiếm, bấm vào biểu tượng <Heart className="inline h-3.5 w-3.5 text-rose-400" /> trên thẻ gia sư
              để lưu vào đây — sẽ theo dõi được giá, lịch và đặt lớp nhanh hơn.
            </p>
            <Button className="mt-5 rounded-full font-semibold" onClick={() => navigate({ name: 'search' })}>
              <Search className="h-4 w-4 mr-1.5" /> Bắt đầu tìm gia sư
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {(tutors || []).map(t => <TutorCard key={t.id} tutor={t} />)}
          </div>
        )}

        {/* P5: dải "Đã xem gần đây" */}
        {recent.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center gap-2 mb-4">
              <History className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-extrabold tracking-tight">Đã xem gần đây</h2>
              <span className="text-xs text-muted-foreground">— những hồ sơ bạn vừa mở</span>
            </div>
            <div className="row-scroll">
              {recent.map(t => (
                <div key={t.id} className="w-[270px] sm:w-[290px]">
                  <TutorCard tutor={t} compact />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
