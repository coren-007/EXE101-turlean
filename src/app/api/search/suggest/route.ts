// GET /api/search/suggest?q=xxx — gợi ý tìm kiếm (autocomplete)
// Trả: môn học + gia sư khớp từ khóa, KHÔNG PHÂN BIỆT HOA THƯỜNG & DẤU tiếng Việt
// ("hoa" khớp "Hóa", "toan" khớp "Toán"). q rỗng → trả môn học phổ biến nhất (theo số gia sư).
//
// Chiến lược matching: tải danh sách nhẹ (subjects + tutors cơ bản) vào bộ nhớ
// với cache TTL 60s — matching diacritics-insensitive khó làm thuần ở SQL (SQLite)
// nên match bằng JS sau khi normalize NFD-bỏ dấu. Ổn tới ~vài nghìn gia sư.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizeVi } from '@/lib/text'

interface CacheEntry {
  at: number
  subjects: { id: string; name: string; slug: string; category: string; icon: string | null; level: string | null; tutorCount: number; norm: string }[]
  tutors: {
    id: string; name: string; profession: string | null; avatar: string | null;
    city: string | null; district: string | null;
    subjects: { name: string; slug: string }[];
    avgRating: number; reviewCount: number; norm: string; normSubjects: string
  }[]
}

let cache: CacheEntry | null = null
const TTL = 60_000 // 60s

async function loadIndex(): Promise<CacheEntry> {
  if (cache && Date.now() - cache.at < TTL) return cache

  const [subjects, tutors] = await Promise.all([
    db.subject.findMany({
      select: {
        id: true, name: true, slug: true, category: true, icon: true, level: true,
        _count: { select: { tutors: { where: { tutor: { hourlyRate: { gt: 0 } } } } } },
      },
      orderBy: { name: 'asc' },
    }),
    db.user.findMany({
      where: { role: 'TUTOR', hourlyRate: { gt: 0 } },
      select: {
        id: true, name: true, profession: true, avatar: true, city: true, district: true,
        tutorSubjects: { select: { subject: { select: { name: true, slug: true } } } },
        reviewsReceived: { select: { rating: true } },
      },
    }),
  ])

  cache = {
    at: Date.now(),
    subjects: subjects.map(s => ({
      id: s.id, name: s.name, slug: s.slug, category: s.category, icon: s.icon, level: s.level,
      tutorCount: s._count.tutors,
      norm: normalizeVi(s.name),
    })),
    tutors: tutors.map(t => {
      const avg = t.reviewsReceived.length
        ? t.reviewsReceived.reduce((s, r) => s + r.rating, 0) / t.reviewsReceived.length
        : 0
      return {
        id: t.id, name: t.name, profession: t.profession, avatar: t.avatar,
        city: t.city, district: t.district,
        subjects: t.tutorSubjects.map(ts => ({ name: ts.subject.name, slug: ts.subject.slug })).slice(0, 3),
        avgRating: Math.round(avg * 10) / 10,
        reviewCount: t.reviewsReceived.length,
        norm: normalizeVi(t.name),
        normSubjects: t.tutorSubjects.map(ts => normalizeVi(ts.subject.name)).join(' | '),
      }
    }),
  }
  return cache
}

function stripNorm(s: { id: string; name: string; slug: string; category: string; icon: string | null; level: string | null; tutorCount: number; norm: string }) {
  return {
    id: s.id, name: s.name, slug: s.slug, category: s.category, icon: s.icon,
    level: s.level, tutorCount: s.tutorCount,
  }
}

export async function GET(req: NextRequest) {
  try {
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
    const norm = normalizeVi(q)
    const idx = await loadIndex()

    if (!norm) {
      // q rỗng → môn học phổ biến nhất (nhiều gia sư nhất)
      const popular = [...idx.subjects].sort((a, b) => b.tutorCount - a.tutorCount).slice(0, 8)
      return NextResponse.json({ subjects: popular.map(stripNorm), tutors: [], popular: true })
    }

    // Môn học khớp contains — ưu tiên prefix match + môn nhiều gia sư
    const subjects = idx.subjects
      .filter(s => s.norm.includes(norm))
      .sort((a, b) => (a.norm.startsWith(norm) ? 0 : 1) - (b.norm.startsWith(norm) ? 0 : 1) || b.tutorCount - a.tutorCount)
      .slice(0, 6)
      .map(stripNorm)

    // Gia sư khớp tên/nghề/môn học
    const tutors = idx.tutors
      .filter(t => t.norm.includes(norm) || t.normSubjects.includes(norm) || (t.profession ? normalizeVi(t.profession).includes(norm) : false))
      .sort((a, b) => (b.norm.startsWith(norm) ? 1 : 0) - (a.norm.startsWith(norm) ? 1 : 0) || b.avgRating - a.avgRating)
      .slice(0, 5)
      .map(t => ({
        id: t.id, name: t.name, profession: t.profession, avatar: t.avatar,
        city: t.city, district: t.district, subjects: t.subjects,
        avgRating: t.avgRating, reviewCount: t.reviewCount,
      }))

    return NextResponse.json({ subjects, tutors, popular: false })
  } catch (e) {
    console.error('[suggest] error:', e)
    return NextResponse.json({ subjects: [], tutors: [], popular: false, debug: String(e) })
  }
}
