import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, createSession, setSessionCookie } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['TUTOR', 'STUDENT']),
  phone: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

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
      role: user.role
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Đăng ký thất bại' }, { status: 400 })
  }
}
