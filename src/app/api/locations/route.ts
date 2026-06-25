import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  // Get distinct cities with tutor counts
  const tutors = await db.user.findMany({
    where: { role: 'TUTOR', hourlyRate: { gt: 0 }, tutorSubjects: { some: {} } },
    select: { city: true, district: true },
  })

  const cityMap = new Map<string, Map<string, number>>()
  for (const t of tutors) {
    if (!t.city) continue
    if (!cityMap.has(t.city)) cityMap.set(t.city, new Map())
    const districts = cityMap.get(t.city)!
    districts.set(t.district || 'Khác', (districts.get(t.district || 'Khác') || 0) + 1)
  }

  const result = Array.from(cityMap.entries()).map(([city, districts]) => ({
    city,
    tutorCount: Array.from(districts.values()).reduce((a, b) => a + b, 0),
    districts: Array.from(districts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  })).sort((a, b) => b.tutorCount - a.tutorCount)

  return NextResponse.json({ locations: result })
}
