import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Thiếu email hoặc mật khẩu' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 400 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 400 })
    }

    // P6: tài khoản bị khóa do điểm tin cậy thấp (< 30) — không cho đăng nhập,
    // hiện rõ lý do để người dùng biết phải liên hệ bộ phận hỗ trợ.
    if (user.lockedAt) {
      return NextResponse.json(
        {
          error:
            'Tài khoản đã bị khóa do điểm tin cậy xuống dưới 30/100 (hủy lịch nhiều lần sát giờ). ' +
            'Vui lòng liên hệ hỗ trợ để được xem xét mở khóa.',
          locked: true,
          lockedReason: user.lockedReason,
        },
        { status: 403 },
      )
    }

    const token = await createSession(user.id)
    await setSessionCookie(token)

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      city: user.city,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Đăng nhập thất bại' }, { status: 500 })
  }
}
