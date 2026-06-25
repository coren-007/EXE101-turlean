'use client'

import { Tutor } from './tutor-card'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MapPin, Home, School, Star, Clock, ChevronRight, BadgeCheck } from 'lucide-react'
import { useApp } from '@/lib/store'
import { RatingStars } from './rating-stars'
import { formatVnd } from '@/lib/format'
import { cn } from '@/lib/utils'

export function TutorCardCompact({ tutor }: { tutor: Tutor }) {
  const { navigate } = useApp()
  return (
    <Card
      className="p-4 cursor-pointer hover:shadow-md transition-all duration-200 hover:border-primary/30 group"
      onClick={() => navigate({ name: 'tutor', id: tutor.id })}
    >
      <div className="flex gap-3">
        <Avatar className="h-14 w-14 rounded-xl border shrink-0">
          <AvatarImage src={tutor.avatar || undefined} alt={tutor.name} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {tutor.name.charAt(0)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <h3 className="font-semibold text-sm truncate">{tutor.name}</h3>
                {tutor.isVerified && <BadgeCheck className="h-4 w-4 text-primary shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground truncate">{tutor.profession}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <RatingStars rating={tutor.avgRating} size={12} reviewCount={tutor.reviewCount} showNumber={false} />
            <span className="text-xs font-semibold">{tutor.avgRating.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">({tutor.reviewCount})</span>
            {tutor.distanceKm !== null && tutor.distanceKm !== undefined && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <MapPin className="h-3 w-3" /> {tutor.distanceKm}km
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-1">
              {tutor.teachesAtStudentHome && (
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 gap-0.5">
                  <Home className="h-2.5 w-2.5" /> Đến nhà
                </Badge>
              )}
              {tutor.teachesAtOwnPlace && (
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 gap-0.5">
                  <School className="h-2.5 w-2.5" /> Tại cơ sở
                </Badge>
              )}
            </div>
            <p className="text-sm font-bold text-primary">
              {formatVnd(tutor.minPrice)}
              <span className="text-xs font-normal text-muted-foreground">/giờ</span>
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
