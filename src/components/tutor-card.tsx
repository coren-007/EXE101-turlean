'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MapPin, Home, School, Star, BadgeCheck, ShieldCheck, Video, Sparkles } from 'lucide-react'
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
  // Độ tin cậy từ API search
  reliability?: {
    score: number
    tier: string
    tierLabel: string
    violations: number
  }
}

// Gradient phủ bìa — cố định theo tên để mỗi gia sư có màu riêng ổn định
const COVER_GRADIENTS = [
  'from-rose-100 via-orange-50 to-amber-50',
  'from-emerald-100 via-teal-50 to-cyan-50',
  'from-violet-100 via-purple-50 to-fuchsia-50',
  'from-sky-100 via-blue-50 to-indigo-50',
  'from-amber-100 via-yellow-50 to-lime-50',
]
function coverGradient(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length]
}

export function TutorCard({ tutor, compact }: { tutor: Tutor; compact?: boolean }) {
  const { navigate } = useApp()

  return (
    <Card
      className="overflow-hidden cursor-pointer border border-border/80 card-lift group p-0 bg-card"
      onClick={() => navigate({ name: 'tutor', id: tutor.id })}
    >
      {/* Cover — phong cách listing Airbnb */}
      <div className={`relative aspect-[4/3] bg-gradient-to-br ${coverGradient(tutor.name)} overflow-hidden`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar className={`rounded-full border-4 border-white shadow-e2 ${compact ? 'h-16 w-16' : 'h-24 w-24'}`}>
            <AvatarImage src={tutor.avatar || undefined} alt={tutor.name} />
            <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-extrabold">
              {tutor.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Badge trên */}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {tutor.isVerified && (
            <span className="bg-white/95 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1 shadow-e1">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-bold">Đã xác minh</span>
            </span>
          )}
          {tutor.reviewCount === 0 && (
            <span className="bg-white/95 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1 shadow-e1">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-bold">Gia sư mới</span>
            </span>
          )}
        </div>

        {/* Độ tin cậy góc phải */}
        {tutor.reliability && (
          <span
            className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full px-2 py-1 shadow-e1 text-[10px] font-bold ${
              tutor.reliability.score >= 90
                ? 'bg-emerald-600 text-white'
                : tutor.reliability.score >= 70
                  ? 'bg-blue-600 text-white'
                  : tutor.reliability.score >= 50
                    ? 'bg-amber-500 text-white'
                    : 'bg-rose-600 text-white'
            }`}
            title={`Độ tin cậy ${tutor.reliability.score}/100 · ${tutor.reliability.tierLabel}`}
          >
            <ShieldCheck className="h-3 w-3" />
            {tutor.reliability.score}
          </span>
        )}

        {/* Giá — overlay dưới */}
        <div className="absolute bottom-2.5 right-2.5 bg-white/95 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-e1">
          <span className="text-sm font-extrabold text-foreground">{formatVnd(tutor.minPrice)}</span>
          <span className="text-[10px] text-muted-foreground font-medium">/giờ</span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base truncate group-hover:text-primary transition-colors">
              {tutor.name}
            </h3>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{tutor.profession}</p>
          </div>
          {tutor.reviewCount > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="text-sm font-bold">{tutor.avgRating.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">({tutor.reviewCount})</span>
            </div>
          )}
        </div>

        {/* Subjects */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {tutor.subjects.slice(0, compact ? 2 : 3).map((s) => (
            <Badge key={s.id} variant="secondary" className="text-[11px] font-semibold rounded-full">
              {s.name}
            </Badge>
          ))}
          {tutor.subjects.length > (compact ? 2 : 3) && (
            <Badge variant="outline" className="text-[11px] rounded-full">
              +{tutor.subjects.length - (compact ? 2 : 3)}
            </Badge>
          )}
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
            {tutor.teachesOnline && (
              <span title="Dạy trực tuyến" className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                <Video className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
