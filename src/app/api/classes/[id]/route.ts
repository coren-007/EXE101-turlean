// PATCH  /api/classes/[id] — gia sư (chủ lớp) cập nhật lớp học cố định:
//        thông tin, sức chứa, trạng thái (OPEN/PAUSED/CLOSED), thay lịch học tuần.
// DELETE /api/classes/[id] — xóa hẳn lớp (kèm lịch + đăng ký, cascade).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const patchSchema = z.object({
  title: z.string().trim().min(3, 'Tên lớp tối thiểu 3 ký tự').max(120).optional(),
  subjectId: z.string().min(1).optional(),
  gradeLevel: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  meetingType: z.enum(['AT_TUTOR_HOME', 'ONLINE']).optional(),
  address: z.string().trim().max(300).optional().nullable(),
  capacity: z.number().int().min(1, 'Sĩ số tối thiểu 1').max(50, 'Sĩ số tối đa 50').optional(),
  monthlyFee: z.number().int().min(0).max(100_000_000).optional().nullable(),
  startDate: z.string().regex(DATE_RE, 'Ngày khai giảng không hợp lệ').optional().nullable(),
  status: z.enum(['OPEN', 'PAUSED', 'CLOSED']).optional(),
  schedule: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ (HH:MM)'),
        endTime: z.string().regex(TIME_RE, 'Giờ không hợp lệ (HH:MM)'),
      }),
    )
    .min(1, 'Lớp cần ít nhất 1 buổi học cố định trong tuần')
    .max(10)
    .optional(),
})

async function getOwnedClass(id: string, userId: string) {
  const cls = await db.groupClass.findUnique({
    where: { id },
    include: {
      schedule: true,
      enrollments: { select: { status: true } },
      subject: { select: { id: true, name: true } },
    },
  })
  if (!cls) return { error: 'Không tìm thấy lớp học', status: 404 as const, cls: null }
  if (cls.tutorId !== userId) {
    return { error: 'Bạn không phải chủ lớp này', status: 403 as const, cls: null }
  }
  return { error: null, status: 200 as const, cls }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được sửa lớp học' }, { status: 403 })
  }

  const { id } = await params
  const found = await getOwnedClass(id, user.id)
  if (!found.cls) {
    return NextResponse.json({ error: found.error }, { status: found.status })
  }
  const cls = found.cls

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }
  const body = parsed.data

  // Không giảm sĩ số xuống thấp hơn số học sinh đã vào lớp
  if (typeof body.capacity === 'number') {
    const approved = cls.enrollments.filter(e => e.status === 'APPROVED').length
    if (body.capacity < approved) {
      return NextResponse.json(
        {
          error: `Không thể giảm sĩ số xuống ${body.capacity} — lớp đang có ${approved} học sinh đã duyệt`,
        },
        { status: 400 },
      )
    }
  }

  // Đổi môn: môn mới phải thuộc danh sách môn dạy của gia sư
  if (body.subjectId && body.subjectId !== cls.subject.id) {
    const ts = await db.tutorSubject.findUnique({
      where: { tutorId_subjectId: { tutorId: user.id, subjectId: body.subjectId } },
    })
    if (!ts) {
      return NextResponse.json(
        { error: 'Bạn chưa đăng ký dạy môn này — thêm môn trong tab "Môn & giá" trước' },
        { status: 400 },
      )
    }
  }

  // Lịch mới: giờ hợp lệ + không chồng lấn
  if (body.schedule) {
    for (const s of body.schedule) {
      if (s.startTime >= s.endTime) {
        return NextResponse.json(
          { error: 'Giờ bắt đầu phải trước giờ kết thúc' },
          { status: 400 },
        )
      }
    }
    for (let i = 0; i < body.schedule.length; i++) {
      for (let j = i + 1; j < body.schedule.length; j++) {
        const a = body.schedule[i], b = body.schedule[j]
        if (a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime) {
          return NextResponse.json(
            { error: 'Hai buổi học trong tuần chồng lấn giờ — vui lòng sửa lịch' },
            { status: 400 },
          )
        }
      }
    }
  }

  const data: Record<string, unknown> = {}
  for (const key of [
    'title', 'subjectId', 'gradeLevel', 'description', 'meetingType',
    'address', 'capacity', 'monthlyFee', 'startDate', 'status',
  ] as const) {
    if (body[key] !== undefined) data[key] = body[key]
  }

  const updated = await db.$transaction(async tx => {
    if (body.schedule) {
      await tx.classScheduleSlot.deleteMany({ where: { classId: id } })
      await tx.classScheduleSlot.createMany({
        data: body.schedule.map(s => ({
          classId: id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      })
    }
    return tx.groupClass.update({
      where: { id },
      data,
      include: {
        schedule: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        subject: { select: { id: true, name: true } },
      },
    })
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được xóa lớp học' }, { status: 403 })
  }

  const { id } = await params
  const found = await getOwnedClass(id, user.id)
  if (!found.cls) {
    return NextResponse.json({ error: found.error }, { status: found.status })
  }

  await db.groupClass.delete({ where: { id } })
  return NextResponse.json({ message: `Đã xóa lớp "${found.cls.title}"` })
}
