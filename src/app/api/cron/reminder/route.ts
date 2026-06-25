// GET /api/cron/reminder
// Cron job chạy hàng ngày lúc 1:00 sáng (vercel.json config)
// Gửi nhắc nhở buổi học sắp tới (24h + 2h trước)
// Vercel cron: free, chạy 1 lần/ngày

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  // Verify cron secret (Vercel automatically sends this header)
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

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

    // TODO: Gửi email/notification khi email service được tích hợp
    // Hiện tại chỉ log
    console.log(`[CRON] Found ${upcomingBookings.length} bookings for ${tomorrowStr}`)

    return NextResponse.json({
      ok: true,
      checkedAt: now.toISOString(),
      bookingsFound: upcomingBookings.length,
      date: tomorrowStr,
    })
  } catch (error) {
    console.error('[CRON] Error:', error)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
