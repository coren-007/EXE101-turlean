// PATCH /api/classes/[id]/enrollments/[enrollmentId] — đổi trạng thái một đăng ký:
//  - GIA SƯ (chủ lớp): PENDING → APPROVED (duyệt vào lớp, chặn khi đủ sĩ số)
//                      PENDING → REJECTED (từ chối)
//                      APPROVED → CANCELLED (mời học sinh rời lớp)
//  - PHỤ HUYNH/HỌC SINH (chủ đăng ký): PENDING/APPROVED → CANCELLED (rút đăng ký)
// Bên còn lại nhận thông báo hệ thống trong hộp tin nhắn.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import {
  notifyStudentEnrollmentApproved,
  notifyStudentEnrollmentRejected,
  notifyTutorEnrollmentCancelled,
} from '@/lib/notify'
import { formatClassSchedule } from '@/lib/format'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; enrollmentId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id, enrollmentId } = await params
  const body = await req.json().catch(() => ({}))
  const status = body?.status
  if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
    return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
  }

  const enrollment = await db.classEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      class: {
        include: {
          schedule: true,
          tutor: { select: { id: true, name: true } },
        },
      },
      studentParent: { select: { id: true, name: true } },
    },
  })
  if (!enrollment || enrollment.classId !== id) {
    return NextResponse.json({ error: 'Không tìm thấy đăng ký' }, { status: 404 })
  }

  const cls = enrollment.class
  const isTutorOwner = cls.tutorId === user.id
  const isEnrollmentOwner = enrollment.studentParentId === user.id
  if (!isTutorOwner && !isEnrollmentOwner) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
  }

  // ---- Phân quyền chuyển trạng thái ----
  if (isTutorOwner) {
    const ok =
      (enrollment.status === 'PENDING' && (status === 'APPROVED' || status === 'REJECTED')) ||
      (enrollment.status === 'APPROVED' && status === 'CANCELLED')
    if (!ok) {
      return NextResponse.json(
        { error: `Không thể chuyển đăng ký từ ${enrollment.status} sang ${status}` },
        { status: 400 },
      )
    }
  } else {
    // Phụ huynh/học sinh: chỉ được rút đăng ký của chính mình
    if (status !== 'CANCELLED' || !['PENDING', 'APPROVED'].includes(enrollment.status)) {
      return NextResponse.json(
        { error: 'Bạn chỉ thể rút đăng ký đang chờ duyệt hoặc đang theo học' },
        { status: 403 },
      )
    }
  }

  // Duyệt vào lớp: sĩ số đã duyệt (không tính mình) phải còn chỗ
  if (status === 'APPROVED') {
    const others = await db.classEnrollment.findMany({
      where: { classId: id, status: 'APPROVED' },
      select: { id: true },
    })
    if (others.length >= cls.capacity) {
      return NextResponse.json(
        { error: `Lớp đã đủ sĩ số (${cls.capacity}/${cls.capacity}) — không thể duyệt thêm` },
        { status: 400 },
      )
    }
  }

  const updated = await db.classEnrollment.update({
    where: { id: enrollmentId },
    data: { status, updatedAt: new Date() },
  })

  // ---- Thông báo cho bên kia (best-effort) ----
  const studentName = enrollment.studentName ?? enrollment.studentParent.name
  const schedule = formatClassSchedule(cls.schedule)
  if (status === 'APPROVED') {
    await notifyStudentEnrollmentApproved({
      tutorId: cls.tutorId,
      studentId: enrollment.studentParentId,
      tutorName: cls.tutor.name,
      studentName,
      classTitle: cls.title,
      schedule,
      address: cls.address,
      monthlyFee: cls.monthlyFee,
    })
  } else if (status === 'REJECTED') {
    await notifyStudentEnrollmentRejected({
      tutorId: cls.tutorId,
      studentId: enrollment.studentParentId,
      tutorName: cls.tutor.name,
      studentName,
      classTitle: cls.title,
    })
  } else if (status === 'CANCELLED') {
    await notifyTutorEnrollmentCancelled({
      tutorId: cls.tutorId,
      studentId: enrollment.studentParentId,
      parentName: enrollment.studentParent.name,
      studentName,
      classTitle: cls.title,
      wasApproved: enrollment.status === 'APPROVED',
    })
  }

  return NextResponse.json(updated)
}
