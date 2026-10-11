import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/subjects — danh sách môn học
// P4: kèm tutorCount (số gia sư đang dạy môn đó) để render chip môn kèm số lượng
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const level = searchParams.get('level') // PRIMARY | SECONDARY | HIGH | ALL
  const category = searchParams.get('category')
  const withCount = searchParams.get('count') !== '0' // mặc định có count

  const where: any = {}
  if (level) {
    where.level = { in: [level, 'ALL'] }
  }
  if (category) {
    where.category = category
  }

  if (!withCount) {
    const subjects = await db.subject.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] })
    return NextResponse.json(subjects)
  }

  const subjects = await db.subject.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, slug: true, category: true, icon: true, level: true,
      _count: { select: { tutors: { where: { tutor: { hourlyRate: { gt: 0 } } } } } },
    },
  })
  return NextResponse.json(
    subjects.map(s => ({ ...s, tutorCount: s._count.tutors, _count: undefined }))
  )
}
