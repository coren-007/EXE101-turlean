// PATCH /api/classes/[id]/enrollments/[enrollmentId] — đổi trạng thái một đăng ký:
//  - GIA SƯ (chủ lớp): PENDING → APPROVED (duyệt vào lớp, chặn khi đủ sĩ số)
//                      PENDING → REJECTED (từ chối)
//                      WAITLIST → APPROVED (chuyển học sinh chờ vào lớp)
//                      WAITLIST → REJECTED (gỡ khỏi danh sách chờ)
//                      APPROVED → CANCELLED (mời học sinh rời lớp)
//  - PHỤ HUYNH/HỌC SINH (chủ đăng ký): PENDING/APPROVED/WAITLIST → CANCELLED
//    (rút đăng ký / rời lớp / rút khỏi danh sách chờ)
// Khi một học sinh APPROVED rời lớp → hệ thống TỰ ĐỘNG chuyển học sinh đầu tiên
// trong danh sách chờ vào lớp và gửi thông báo cho cả hai bên.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { promoteWaitlist } from '@/lib/class-sessions'
import {
  notifyStudentEnrollmentApproved,
  notifyStudentEnrollmentRejected,
  notifyTutorEnrollmentCancelled,
  notifyStudentWaitlistPromoted,
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
      (enrollment.status === 'WAITLIST' && (status === 'APPROVED' || status === 'REJECTED')) ||
      (enrollment.status === 'APPROVED' && status === 'CANCELLED')
    if (!ok) {
      return NextResponse.json(
        { error: `Không thể chuyển đăng ký từ ${enrollment.status} sang ${status}` },
        { status: 400 },
      )
    }
  } else {
    // Phụ huynh/học sinh: chỉ được rút đăng ký của chính mình (chờ duyệt / trong lớp / trong danh sách chờ)
    if (status !== 'CANCELLED' || !['PENDING', 'APPROVED', 'WAITLIST'].includes(enrollment.status)) {
      return NextResponse.json(
        { error: 'Bạn chỉ thể rút đăng ký đang chờ duyệt, đang theo học hoặc đang trong danh sách chờ' },
        { status: 403 },
      )
    }
  }

  // SẬ-ENR (audit CAO — race condition sĩ số): trước đây việc ĐẾM sĩ số chạy TÁCH RỜI
  // với UPDATE → 2 request duyệt song song cùng thấy "còn chỗ" rồi cùng chuyển
  // APPROVED → vượt capacity. Giờ: đếm + update + promote waitlist cùng chạy trong
  // 1 interactive transaction (đếm-đổi đồng bộ). Thông báo nằm NGOÀI transaction
  // để không giữ khóa DB trong lúc ghi Notification.
  const result = await db.$transaction(async (tx) => {
    // Duyệt vào lớp: sĩ số đã duyệt (không tính mình) phải còn chỗ
    if (status === 'APPROVED') {
      const others = await tx.classEnrollment.findMany({
        where: { classId: id, status: 'APPROVED' },
        select: { id: true },
      })
      if (others.length >= cls.capacity) {
        return {
          ok: false as const,
          error: `Lớp đã đủ sĩ số (${cls.capacity}/${cls.capacity}) — không thể duyệt thêm`,
        }
      }
    }

    const updated = await tx.classEnrollment.update({
      where: { id: enrollmentId },
      data: { status, updatedAt: new Date() },
    })

    // ---- Học sinh APPROVED rời lớp → TỰ ĐỘNG chuyển người chờ đầu tiên vào lớp ----
    let plist: Awaited<ReturnType<typeof promoteWaitlist>>['promoted'] = []
    if (status === 'CANCELLED' && enrollment.status === 'APPROVED') {
      const r = await promoteWaitlist(id, tx)
      plist = r.promoted
    }
    return { ok: true as const, updated, plist }
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  const { updated, plist } = result

  // ---- Thông báo cho bên kia (best-effort) ----
  const studentName = enrollment.studentName ?? enrollment.studentParent.name
  const schedule = formatClassSchedule(cls.schedule)
  const wasWaitlist = enrollment.status === 'WAITLIST'
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

  // ---- Học sinh APPROVED rời lớp → thông báo cho người được thăng cấp từ danh sách chờ ----
  // (promote đã chạy bên trong transaction ở trên — đây chỉ là phần thông báo)
  if (plist.length > 0) {
    for (const p of plist) {
      await notifyStudentWaitlistPromoted({
        tutorId: cls.tutorId,
        studentId: p.studentParent.id,
        tutorName: cls.tutor.name,
        studentName: p.studentName ?? p.studentParent.name,
        classTitle: cls.title,
        schedule,
        address: cls.address,
        monthlyFee: cls.monthlyFee,
      }).catch(() => {})
    }
  }
  const promoted = plist.map(p => ({
    id: p.studentParent.id,
    name: p.studentName ?? p.studentParent.name,
  }))

  return NextResponse.json({
    ...updated,
    wasWaitlist,
    promotedFromWaitlist: promoted,
  })
}
