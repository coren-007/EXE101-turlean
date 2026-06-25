'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MapPin, Home, School, Star, Clock, BadgeCheck } from 'lucide-react'
import { useApp } from '@/lib/store'
import { RatingStars } from './rating-stars'
import { formatVnd } from '@/lib/format'

export interface Tutor {
  id: string
  name: string
  avatar?: string | null
  bio?: string | null
  profession?: string | null
  district?: string | null
  city?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  hourlyRate?: number | null
  minPrice: number
  experienceYears?: number | null
  isVerified?: boolean
  teachesAtStudentHome: boolean
  teachesAtOwnPlace: boolean
  teachesOnline: boolean
  travelRadiusKm?: number | null
  subjects: {
    id: string
    name: string
    slug: string
    category: string
    icon?: string | null
    level?: string | null
    pricePerHour: number
  }[]
  avgRating: number
  reviewCount: number
  distanceKm?: number | null
}

export function TutorCard({ tutor }: { tutor: Tutor }) {
  const { navigate } = useApp()

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 group p-0"
      onClick={() => navigate({ name: 'tutor', id: tutor.id })}
    >
      {/* Cover / Image area - using gradient placeholder for now */}
      <div className="relative aspect-[4/3] bg-gradient-to-br from-accent via-accent/50 to-muted overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar className="h-20 w-20 rounded-full border-4 border-background shadow-lg">
            <AvatarImage src={tutor.avatar || undefined} alt={tutor.name} />
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
              {tutor.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
        </div>
        {tutor.isVerified && (
          <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1 shadow-sm">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold">Đã xác minh</span>
          </div>
        )}
        <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm">
          <span className="text-xs font-bold text-primary">{formatVnd(tutor.minPrice)}</span>
          <span className="text-[10px] text-muted-foreground">/giờ</span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
              {tutor.name}
            </h3>
            <p className="text-xs text-muted-foreground truncate">{tutor.profession}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <RatingStars rating={tutor.avgRating} size={13} showNumber={false} />
          <span className="text-sm font-semibold">{tutor.avgRating.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">({tutor.reviewCount} đánh giá)</span>
        </div>

        {/* Subjects */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tutor.subjects.slice(0, 3).map((s) => (
            <Badge key={s.id} variant="secondary" className="text-[11px] gap-1">
              {s.name}
            </Badge>
          ))}
        </div>

        {/* Location + modes */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">
              {tutor.district}{tutor.city ? `, ${tutor.city}` : ''}{tutor.distanceKm !== null && tutor.distanceKm !== undefined && ` · ${tutor.distanceKm}km`}
            </span>
          </div>
          <div className="flex gap-1 shrink-0">
            {tutor.teachesAtStudentHome && (
              <span title="Gia sư đến nhà" className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Home className="h-3 w-3" />
              </span>
            )}
            {tutor.teachesAtOwnPlace && (
              <span title="Học tại cơ sở" className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <School className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
