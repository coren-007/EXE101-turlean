import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie } from '@/lib/auth'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

// SẬ-AUTH + SẬ-RL (audit CAO):
//  · Trước đây catch (e) trả thẳng e.message → lộ cấu trúc DB/lỗi nội bộ ra client.
//    Giờ: lỗi nội bộ chỉ log server-side, client nhận thông điệp chung.
//  · Rate limit 10 lần / 5 phút / (IP + email) — chặn dò mật khẩu brute-force.

const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 5 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Thiếu email hoặc mật khẩu' }, { status: 400 })
    }

    // Rate limit theo IP + email (khóa theo cả 2 để kẻ tấn công không đổi
    // email để dọp từng tài khoản — và tài khoản thật không bị khóa do IP khác spam)
    const rl = checkRateLimit(`login:${clientIp(req)}:${String(email).toLowerCase()}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${rl.retryAfterSec} giây.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
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
  } catch (e) {
    // SẬ-AUTH: không trả e.message ra client (tránh lộ cấu trúc DB/lỗi nội bộ)
    console.error('[auth/login] lỗi nội bộ:', e)
    return NextResponse.json({ error: 'Đăng nhập thất bại. Vui lòng thử lại sau.' }, { status: 500 })
  }
}
