'use client'

// Nút heart — lưu/bỏ lưu gia sư vào danh sách yêu thích (wishlist)
// Guest: lưu localStorage (tự merge lên DB khi login). Dùng ở TutorCard, trang hồ sơ, map list.
import { Heart } from 'lucide-react'
import { useFavorites } from '@/lib/favorites'

export function FavoriteButton({
  tutorId,
  tutorName,
  className = '',
  size = 'md',
}: {
  tutorId: string
  tutorName?: string
  className?: string
  size?: 'sm' | 'md'
}) {
  const { isFavorite, toggle } = useFavorites()
  const active = isFavorite(tutorId)
  const heartSize = size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'
  const boxSize = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'

  return (
    <button
      type="button"
      aria-label={active ? `Bỏ lưu ${tutorName || 'gia sư'}` : `Lưu ${tutorName || 'gia sư'}`}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation() // không mở card/link bao ngoài
        void toggle(tutorId, tutorName)
      }}
      className={`flex items-center justify-center rounded-full bg-white/95 backdrop-blur-sm shadow-e1 transition-all hover:scale-110 active:scale-95 ${boxSize} ${className}`}
    >
      <Heart
        className={`${heartSize} transition-colors ${active ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground hover:text-rose-500'}`}
      />
    </button>
  )
}
