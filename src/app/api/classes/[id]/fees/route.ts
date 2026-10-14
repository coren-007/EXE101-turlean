// /api/classes/[id]/fees — SỔ HỌC PHÍ lớp nhóm (gia sư chủ lớp):
//  GET  → ma trận tháng × học sinh + các dòng đã thu + tổng kết tháng hiện tại
//  POST → ghi nhận 1 lần đóng tiền (upsert theo (classId, enrollmentId, period))
//         kèm thông báo gửi phụ huynh. amount cho phép khác monthlyFee (miễn giảm).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { notifyStudentFeeRecorded } from '@/lib/notify'

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const postSchema = z.object({
  enrollmentId: z.string().min(1),
  period: z.string().regex(PERIOD_RE, 'Tháng không hợp lệ (YYYY-MM)'),
  amount: z.number().int().min(0).max(500_000_000),
  method: z.enum(['CASH', 'BANK', 'MOMO', 'OTHER']).default('CASH'),
  note: z.string().trim().max(200).optional().nullable(),
})

async function loadOwnedClass(id: string, tutorId: string) {
  const cls = await db.groupClass.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: { studentParent: { select: { id: true, name: true, avatar: true, phone: true } } },
        orderBy: { createdAt: 'asc' },
      },
      sessions: { select: { date: true }, orderBy: { date: 'asc' } },
      feePayments: { orderBy: [{ period: 'asc' }, { paidAt: 'asc' }] },
      tutor: { select: { id: true, name: true } },
    },
  })
  if (!cls) return { error: NextResponse.json({ error: 'Không tìm thấy lớp học' }, { status: 404 }) }
  if (cls.tutorId !== tutorId) {
    return { error: NextResponse.json({ error: 'Bạn không phải chủ lớp này' }, { status: 403 }) }
  }
  return { cls }
}

// Tháng "YYYY-MM" hiện tại (local)
function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Danh sách tháng tính học phí: từ tháng bắt đầu (muộn nhất giữa khai giảng,
// buổi đầu tiên, học sinh đầu vào lớp) đến tháng hiện tại.
function feeMonths(cls: {
  startDate: string | null
  sessions: { date: string }[]
  enrollments: { createdAt: Date; status: string }[]
}): string[] {
  const candidates: string[] = []
  if (cls.startDate) candidates.push(cls.startDate.slice(0, 7))
  if (cls.sessions[0]?.date) candidates.push(cls.sessions[0].date.slice(0, 7))
  const firstApproved = cls.enrollments
    .filter(e => e.status === 'APPROVED')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
  if (firstApproved) {
    candidates.push(
      `${firstApproved.createdAt.getFullYear()}-${String(firstApproved.createdAt.getMonth() + 1).padStart(2, '0')}`,
    )
  }
  if (candidates.length === 0) return []
  const start = candidates.reduce((a, b) => (a > b ? a : b)) // muộn nhất
  const now = currentPeriod()
  if (start > now) return []
  const months: string[] = []
  let [y, m] = start.split('-').map(Number)
  const [ny, nm] = now.split('-').map(Number)
  while (y < ny || (y === ny && m <= nm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { cls, error } = await loadOwnedClass(id, user.id)
  if (error || !cls) return error

  const approved = cls.enrollments.filter(e => e.status === 'APPROVED')
  const months = feeMonths(cls)
  const now = currentPeriod()
  const paidThisMonth = cls.feePayments.filter(p => p.period === now)
  const paidIds = new Set(paidThisMonth.map(p => p.enrollmentId))

  return NextResponse.json({
    classId: cls.id,
    monthlyFee: cls.monthlyFee,
    months,
    currentPeriod: now,
    students: approved.map(e => ({
      enrollmentId: e.id,
      studentParentId: e.studentParent.id,
      name: e.studentName ?? e.studentParent.name,
      parentName: e.studentParent.name,
      avatar: e.studentParent.avatar,
      phone: e.studentParent.phone,
      joinedAt: e.createdAt,
    })),
    payments: cls.feePayments.map(p => ({
      id: p.id,
      enrollmentId: p.enrollmentId,
      studentParentId: p.studentParentId,
      period: p.period,
      amount: p.amount,
      method: p.method,
      note: p.note,
      paidAt: p.paidAt,
    })),
    summary: {
      paidCount: paidThisMonth.length,
      unpaidCount: approved.length - paidIds.size,
      // Tổng tiền đã thu toàn bộ (mọi tháng)
      totalCollected: cls.feePayments.reduce((s, p) => s + p.amount, 0),
      totalCollectedThisMonth: paidThisMonth.reduce((s, p) => s + p.amount, 0),
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được ghi nhận học phí' }, { status: 403 })
  }

  const { id } = await params
  const raw = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const body = parsed.data

  const { cls, error } = await loadOwnedClass(id, user.id)
  if (error || !cls) return error

  const enrollment = cls.enrollments.find(e => e.id === body.enrollmentId)
  if (!enrollment || enrollment.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'Học sinh không nằm trong lớp (hoặc chưa được duyệt)' },
      { status: 400 },
    )
  }
  // Tháng tương lai quá 1 tháng → chặn (không thu trước quá xa)
  const now = currentPeriod()
  const [y, m] = body.period.split('-').map(Number)
  const [ny, nm] = now.split('-').map(Number)
  const diff = (y - ny) * 12 + (m - nm)
  if (diff > 1) {
    return NextResponse.json(
      { error: 'Chỉ ghi nhận được học phí tháng hiện tại hoặc các tháng trước' },
      { status: 400 },
    )
  }

  const payment = await db.classFeePayment.upsert({
    where: {
      classId_enrollmentId_period: {
        classId: cls.id,
        enrollmentId: body.enrollmentId,
        period: body.period,
      },
    },
    create: {
      classId: cls.id,
      enrollmentId: body.enrollmentId,
      studentParentId: enrollment.studentParentId,
      period: body.period,
      amount: body.amount,
      method: body.method,
      note: body.note ?? null,
    },
    update: {
      amount: body.amount,
      method: body.method,
      note: body.note ?? null,
      paidAt: new Date(),
    },
  })

  await notifyStudentFeeRecorded({
    tutorId: cls.tutorId,
    tutorName: cls.tutor.name,
    studentId: enrollment.studentParentId,
    studentName: enrollment.studentName ?? enrollment.studentParent.name,
    classTitle: cls.title,
    period: body.period,
    amount: body.amount,
    method: body.method,
    note: body.note ?? null,
  }).catch(() => {})

  return NextResponse.json({
    payment,
    message: `Đã ghi nhận học phí tháng ${m}/${y} của ${enrollment.studentName ?? enrollment.studentParent.name}`,
  })
}
