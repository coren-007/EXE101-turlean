'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export function RatingStars({
  rating,
  size = 14,
  className,
  showNumber = true,
  reviewCount,
}: {
  rating: number
  size?: number
  className?: string
  showNumber?: boolean
  reviewCount?: number
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, rating - (i - 1)))
          return (
            <div key={i} className="relative" style={{ width: size, height: size }}>
              <Star className="absolute inset-0 text-muted-foreground/30" style={{ width: size, height: size }} />
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="text-amber-400 fill-amber-400" style={{ width: size, height: size }} />
              </div>
            </div>
          )
        })}
      </div>
      {showNumber && (
        <span className="text-sm font-semibold">{rating.toFixed(1)}</span>
      )}
      {reviewCount !== undefined && (
        <span className="text-xs text-muted-foreground">({reviewCount})</span>
      )}
    </div>
  )
}
