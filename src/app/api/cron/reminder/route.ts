// GET /api/cron/reminder
// Cron job chạy hàng ngày lúc 1:00 sáng theo giờ UTC (vercel.json config)
// = 8:00 sáng giờ Việt Nam (UTC+7)
// P1-12: chuẩn timezone Asia/Ho_Chi_Minh khi tính "ngày mai" — trước đây
// dùng UTC khiến nhắc nhở lệch ngày; tích hợp gửi email qua Resend nếu có
// RESEND_API_KEY (free 3.000 email/tháng), không có thì chỉ log có cấu trúc.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notifyStudentsClassSessionReminder } from '@/lib/notify'

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000 // Asia/Ho_Chi_Minh (UTC+7)

// "Ngày mai" theo giờ Việt Nam
function tomorrowVN(): string {
  const nowVN = new Date(Date.now() + TZ_OFFSET_MS)
  const tomorrow = new Date(nowVN.getTime() + 24 * 60 * 60 * 1000)
  return tomorrow.toISOString().split('T')[0]
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'GiaSuConnect <onboarding@resend.dev>'
  if (!apiKey) return false // chưa cấu hình email service — bỏ qua

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  // Require a configured secret and verify Vercel's authorization header.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tomorrowStr = tomorrowVN()

    // Find confirmed bookings for tomorrow
    const upcomingBookings = await db.booking.findMany({
      where: {
        status: 'CONFIRMED',
        date: tomorrowStr,
      },
      include: {
        tutor: { select: { name: true, email: true } },
        student: { select: { name: true, email: true } },
        subject: { select: { name: true } },
      },
    })

    let emailsSent = 0
    let emailsSkipped = 0

    for (const b of upcomingBookings) {
      const subject = `[GiaSuConnect] Nhắc lịch học mai: ${b.subject.name} — ${b.startTime}`
      const text =
        `Xin chào,\n\n` +
        `Bạn có buổi học vào ngày mai (${tomorrowStr}) lúc ${b.startTime} - ${b.endTime}.\n` +
        `Môn: ${b.subject.name}\n` +
        `Hình thức: ${b.mode === 'ONLINE' ? 'Trực tuyến' : b.mode === 'TUTOR_TO_STUDENT' ? 'Gia sư đến nhà' : 'Tại cơ sở'}\n` +
        `\nVui lòng đến đúng giờ. Hẹn gặp bạn!`

      const [tutorOk, studentOk] = await Promise.all([
        sendEmail(b.tutor.email, subject, `Chào ${b.tutor.name},\n\n${text.replace('Bạn có', 'Bạn có buổi dạy')}`),
        sendEmail(b.student.email, subject, `Chào ${b.student.name},\n\n${text.replace('Bạn có', 'Con/em bạn có')}`),
      ])
      if (tutorOk) emailsSent++; else emailsSkipped++
      if (studentOk) emailsSent++; else emailsSkipped++
    }

    // ===== Lớp học cố định (nhóm): nhắc buổi học mai cho gia sư + học sinh trong lớp =====
    const tomorrowSessions = await db.classSession.findMany({
      where: { status: 'SCHEDULED', date: tomorrowStr },
      include: {
        class: {
          include: {
            tutor: { select: { name: true, email: true } },
            subject: { select: { name: true } },
            enrollments: {
              where: { status: 'APPROVED' },
              include: { studentParent: { select: { name: true, email: true } } },
            },
          },
        },
      },
    })

    for (const s of tomorrowSessions) {
      const subject = `[GiaSuConnect] Nhắc lớp học mai: ${s.class.title} — ${s.startTime}`
      const text =
        `Xin chào,\n\n` +
        `Lớp "${s.class.title}" có buổi học vào ngày mai (${tomorrowStr}) lúc ${s.startTime} - ${s.endTime}.\n` +
        `Môn: ${s.class.subject.name}\n` +
        `Địa điểm: ${s.class.meetingType === 'ONLINE' ? 'Trực tuyến' : s.class.address ?? 'Tại nhà gia sư'}\n` +
        `\nVui lòng đến đúng giờ. Hẹn gặp bạn!`

      const tutorOk = await sendEmail(
        s.class.tutor.email,
        subject,
        `Chào ${s.class.tutor.name},\n\n${text}`,
      )
      if (tutorOk) emailsSent++; else emailsSkipped++

      for (const e of s.class.enrollments) {
        const ok = await sendEmail(
          e.studentParent.email,
          subject,
          `Chào ${e.studentParent.name},\n\n${text.replace('Lớp', `Lớp (${e.studentName ?? e.studentParent.name})`)}`,
        )
        if (ok) emailsSent++; else emailsSkipped++
      }

      // Nhắc IN-APP (SYSTEM message vào hội thoại tutor↔student) — luôn gửi
      // bất kể đã cấu hình email hay chưa, để phụ huynh thấy trong hộp tin nhắn
      await notifyStudentsClassSessionReminder({
        tutorId: s.class.tutorId,
        tutorName: s.class.tutor.name,
        classTitle: s.class.title,
        subjectName: s.class.subject.name,
        date: tomorrowStr,
        time: s.startTime,
        endTime: s.endTime,
        address: s.class.meetingType === 'ONLINE' ? 'Học trực tuyến' : s.class.address,
        students: s.class.enrollments.map(e => ({
          id: e.studentParentId,
          name: e.studentName ?? e.studentParent.name,
        })),
      }).catch(() => { /* best-effort */ })
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      timezone: 'Asia/Ho_Chi_Minh',
      date: tomorrowStr,
      bookingsFound: upcomingBookings.length,
      classSessionsFound: tomorrowSessions.length,
      emailsSent,
      emailsSkipped, // bỏ qua khi chưa cấu hình RESEND_API_KEY
    })
  } catch (error) {
    console.error('[CRON] Error:', error)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
