import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const level = searchParams.get('level') // PRIMARY | SECONDARY | HIGH | ALL
  const category = searchParams.get('category')

  const where: any = {}
  if (level) {
    where.level = { in: [level, 'ALL'] }
  }
  if (category) {
    where.category = category
  }

  const subjects = await db.subject.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }]
  })
  return NextResponse.json(subjects)
}
