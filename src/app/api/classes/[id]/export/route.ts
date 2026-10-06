// GET /api/classes/[id]/export — xuất SỔ ĐIỂM DANH lớp học dạng CSV (cho Excel/Sheets).
// Ma trận: mỗi dòng 1 học sinh, mỗi cột 1 buổi (P = có mặt, A = vắng, '-' = chưa học),
// cột cuối tổng kết có mặt / vắng. UTF-8 BOM để tiếng Việt hiển thị đúng trên Excel.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

function csvEscape(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (user.role !== 'TUTOR') {
    return NextResponse.json({ error: 'Chỉ gia sư mới được xuất sổ điểm danh' }, { status: 403 })
  }

  const { id } = await params
  const cls = await db.groupClass.findUnique({
    where: { id },
    include: {
      subject: { select: { name: true } },
      enrollments: {
        where: { status: 'APPROVED' },
        include: { studentParent: { select: { name: true, phone: true } } },
      },
      sessions: {
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        include: { attendance: true },
      },
    },
  })
  if (!cls) return NextResponse.json({ error: 'Không tìm thấy lớp học' }, { status: 404 })
  if (cls.tutorId !== user.id) {
    return NextResponse.json({ error: 'Bạn không phải chủ lớp này' }, { status: 403 })
  }

  const sessions = cls.sessions.filter(s => s.status !== 'SCHEDULED' || s.date <= new Date().toISOString().split('T')[0])
  const attended = sessions.filter(s => s.status !== 'SCHEDULED')

  // Header: Học sinh, SĐT, [từng buổi], Tổng có mặt, Tổng vắng
  const header = [
    'Học sinh', 'SĐT phụ huynh',
    ...attended.map(s => {
      const [y, m, d] = s.date.split('-')
      return `${d}/${m} ${s.startTime}`
    }),
    'Tổng có mặt', 'Tổng vắng',
  ]

  const rows = cls.enrollments.map(e => {
    const attBySession = new Map(
      attended.flatMap(s => {
        const a = s.attendance.find(x => x.studentParentId === e.studentParentId)
        return a ? [[s.id, a.status]] : []
      }),
    )
    const marks = attended.map(s => {
      const st = attBySession.get(s.id)
      return st === 'PRESENT' ? 'P' : st === 'ABSENT' ? 'A' : '-'
    })
    const present = marks.filter(m => m === 'P').length
    const absent = marks.filter(m => m === 'A').length
    return [
      e.studentName ?? e.studentParent.name,
      e.studentParent.phone ?? '',
      ...marks,
      String(present),
      String(absent),
    ]
  })

  // Ghi chú trạng thái buổi (buổi hủy hiển thị riêng ở dòng cuối)
  const cancelNotes = attended
    .filter(s => s.status === 'CANCELLED')
    .map(s => `${s.date} ${s.startTime} — nghỉ: ${s.note ?? ''}`)

  const lines = [
    [`Sổ điểm danh lớp: ${cls.title}`],
    [`Môn: ${cls.subject.name} · Sĩ số duyệt: ${cls.enrollments.length}/${cls.capacity}`],
    [`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`],
    [],
    header,
    ...rows,
    ...(cancelNotes.length ? [[], ['Buổi đã nghỉ (không tính điểm danh):'], ...cancelNotes.map(n => [n])] : []),
    [],
    ['Chú thích: P = có mặt · A = vắng mặt · - = chưa điểm danh'],
  ]

  const csv = '\uFEFF' + lines.map(l => l.map(csvEscape).join(',')).join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="so-diem-danh-${cls.id}.csv"`,
    },
  })
}
