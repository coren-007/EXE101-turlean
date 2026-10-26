import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, createSession, setSessionCookie } from '@/lib/auth'
import { z } from 'zod'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

// SẬ-AUTH + SẬ-RL (audit CAO):
//  · Trước đây catch (e) trả thẳng e.message (kể cả lỗi Zod/Prisma thô) → lộ
//    schema validate + cấu trúc bảng DB. Giờ: lỗi validate chỉ trả thông điệp
//    tiếng Việt đã soạn sẵn; lỗi khác chỉ log server-side kèm thông điệp chung.
//  · Rate limit 20 đăng ký / giờ / IP — chặn tạo tài khoản rác hàng loạt
//    (20 thay vì 5/10 để cả chuỗi E2E regression + sec-test chạy nối tiếp
//    trong 1 giờ không vướng ngưỡng; spam thật là hàng trăm lần/giờ).

const REGISTER_LIMIT = 20
const REGISTER_WINDOW_MS = 60 * 60 * 1000
// SẸ-XFF (B4): trần toàn site — chống spam tạo rác khi kẻ tấn công fake IP
const REGISTER_GLOBAL_LIMIT = 100

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['TUTOR', 'STUDENT']),
  // S4 (GĐ3): UI đánh dấu SĐT là bắt buộc — server giờ yêu cầu tương ứng
  // để validation client/server nhất quán (trước đây server optional).
  phone: z.string().min(1, 'Vui lòng nhập số điện thoại'),
  district: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const rl = checkRateLimit(`register:${clientIp(req)}`, REGISTER_LIMIT, REGISTER_WINDOW_MS)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Bạn đã đăng ký quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(rl.retryAfterSec / 60)} phút.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }
    // SẸ-XFF (B4): bucket GLOBAL — kẻ tấn công fake x-forwarded-for mỗi request
    // thì mỗi IP ảo một bucket riêng, nhưng tổng toàn site vẫn bị kẹp 100/giờ.
    // (Đủ rộng cho traffic thật + bộ test E2E, chặn tạo tài khoản rác hàng loạt.)
    const rlGlobal = checkRateLimit('register:global', REGISTER_GLOBAL_LIMIT, REGISTER_WINDOW_MS)
    if (!rlGlobal.ok) {
      return NextResponse.json(
        { error: 'Hệ thống đang nhận quá nhiều đăng ký. Vui lòng thử lại sau ít phút.' },
        { status: 429, headers: { 'Retry-After': String(rlGlobal.retryAfterSec) } },
      )
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      // SẬ-AUTH: chỉ trả THÔNG ĐIỆP đã soạn (tiếng Việt), không trả chuỗi lỗi thô
      // (issues chứa path/schema → lộ nội bộ).
      // B-REG (GĐ3): map theo PATH của issue thay vì regex message — zod v4 đổi
      // message ("Invalid email address", "Too small: expected...") làm regex cũ
      // không khớp, mọi lỗi đều rơi fallback chung chung.
      const field = parsed.error.issues[0]?.path?.[0]
      const friendly =
        field === 'email' ? 'Email không hợp lệ'
        : field === 'name' ? 'Tên phải có ít nhất 2 ký tự'
        : field === 'password' ? 'Mật khẩu phải có ít nhất 6 ký tự'
        : field === 'phone' ? 'Vui lòng nhập số điện thoại'
        : 'Dữ liệu đăng ký không hợp lệ'
      return NextResponse.json({ error: friendly }, { status: 400 })
    }
    const data = parsed.data

    const existing = await db.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ error: 'Email đã được sử dụng' }, { status: 400 })
    }

    const passwordHash = await hashPassword(data.password)
    const user = await db.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        role: data.role,
        phone: data.phone,
        district: data.district,
        city: data.city || 'Hà Nội',
        address: data.address,
        lat: data.lat,
        lng: data.lng,
      }
    })

    const token = await createSession(user.id)
    await setSessionCookie(token)

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      city: user.city,
    })
  } catch (e) {
    // SẬ-AUTH: lỗi Prisma/hệ thống chỉ log server-side, client nhận thông điệp chung
    console.error('[auth/register] lỗi nội bộ:', e)
    return NextResponse.json({ error: 'Đăng ký thất bại. Vui lòng thử lại sau.' }, { status: 500 })
  }
}
