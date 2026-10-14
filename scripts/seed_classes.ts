// Seed LỚP HỌC CỐ ĐỊNH (nhóm) — bổ sung cho scripts/seed.ts, chạy độc lập:
//   bun run scripts/seed_classes.ts
// Idempotent: chỉ xóa 3 bảng GroupClass / ClassScheduleSlot / ClassEnrollment
// rồi tạo lại — KHÔNG đụng tới user/booking/review demo có sẵn.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Ngày YYYY-MM-DD của thứ `target` (0=CN..6=T7) trong tuần kế tiếp
function nextWeekday(target: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  let diff = (target - dow + 7) % 7
  if (diff === 0) diff = 7
  d.setDate(d.getDate() + diff + 7)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000)

async function main() {
  console.log('🌱 Seeding lớp học cố định (nhóm)...')

  await db.classEnrollment.deleteMany()
  await db.classScheduleSlot.deleteMany()
  await db.groupClass.deleteMany()

  const minhanh = await db.user.findUnique({ where: { email: 'minhanh.tutor@example.com' } })
  const hoanglong = await db.user.findUnique({ where: { email: 'hoanglong.tutor@example.com' } })
  const quocbao = await db.user.findUnique({ where: { email: 'quocbao.tutor@example.com' } })
  if (!minhanh || !hoanglong || !quocbao) {
    throw new Error('Thiếu tài khoản gia sư demo — chạy `bun run scripts/seed.ts` trước')
  }

  const toan = await db.subject.findUnique({ where: { slug: 'toan-hoc' } })
  const luyenThi = await db.subject.findUnique({ where: { slug: 'luyen-thi-thpt' } })
  const vatLy = await db.subject.findUnique({ where: { slug: 'vat-ly' } })
  const ielts = await db.subject.findUnique({ where: { slug: 'ielts' } })
  if (!toan || !luyenThi || !vatLy || !ielts) {
    throw new Error('Thiếu môn học demo — chạy `bun run scripts/seed.ts` trước')
  }

  const students = await db.user.findMany({ where: { role: 'STUDENT' } })
  const byEmail = new Map(students.map(s => [s.email, s]))
  const pick = (emails: string[]) => emails.map(e => byEmail.get(e)).filter((x): x is NonNullable<typeof x> => !!x)

  // ===== Lớp 1: Toán 10 tại nhà cô Minh Anh — 6/10 + 1 đơn chờ duyệt =====
  const lopToan10 = await db.groupClass.create({
    data: {
      tutorId: minhanh.id,
      subjectId: toan.id,
      title: 'Lớp Toán 10 — Nâng cao & Ôn tập',
      gradeLevel: 'Lớp 10',
      description:
        'Luyện nhóm tại nhà gia sư: hệ thống kiến thức căn – trung – nâng theo SGK mới, ' +
        'kiểm tra 15 phút đầu mỗi buổi, chữa đề tổng hợp mỗi cuối tháng. Phù hợp học sinh ' +
        'muốn nền tảng vững để lên lớp 11 chọn ban nâng cao.',
      meetingType: 'AT_TUTOR_HOME',
      address: 'Tầng 2, Số 45 Nguyễn Phong Sắc, Dịch Vọng, Cầu Giấy, Hà Nội',
      capacity: 10,
      monthlyFee: 1600000,
      status: 'OPEN',
      startDate: nextWeekday(2), // thứ 3 tuần tới
      schedule: {
        create: [
          { dayOfWeek: 2, startTime: '18:00', endTime: '20:30' }, // Thứ 3
          { dayOfWeek: 4, startTime: '18:00', endTime: '20:30' }, // Thứ 5
        ],
      },
    },
  })
  const toan10Approved = [
    { u: byEmail.get('hoa.parent@example.com'), studentName: 'Bảo Nam', days: 21 },
    { u: byEmail.get('trang.parent@example.com'), studentName: 'Lê Khả Vy', days: 19 },
    { u: byEmail.get('lan.parent@example.com'), studentName: 'Minh An', days: 15 },
    { u: byEmail.get('hoanganh.student@example.com'), studentName: null, days: 12 },
    { u: byEmail.get('minhtam.parent@example.com'), studentName: 'Bảo Ngọc', days: 9 },
    { u: byEmail.get('thimai.parent@example.com'), studentName: 'Hồ Gia Hân', days: 6 },
  ].filter(x => x.u)
  for (const e of toan10Approved) {
    await db.classEnrollment.create({
      data: {
        classId: lopToan10.id,
        studentParentId: e.u!.id,
        studentName: e.studentName,
        status: 'APPROVED',
        note: null,
        createdAt: daysAgo(e.days),
      },
    })
  }
  const toan10Pending = pick(['nam.parent@example.com'])
  for (const u of toan10Pending) {
    await db.classEnrollment.create({
      data: {
        classId: lopToan10.id,
        studentParentId: u.id,
        studentName: 'Trần Gia Bảo',
        status: 'PENDING',
        note: 'Bé mới chuyển trường, nền Toán trung bình khá — mong cô nhận để kịp tiến độ ạ.',
        createdAt: daysAgo(1),
      },
    })
  }

  // ===== Lớp 2: Toán 12 luyện thi THPT QG — đã đủ 8/8 chỗ =====
  const lopToan12 = await db.groupClass.create({
    data: {
      tutorId: minhanh.id,
      subjectId: luyenThi.id,
      title: 'Lớp Toán 12 — Luyện thi THPT QG',
      gradeLevel: 'Lớp 12',
      description:
        'Chuyên trị điểm 9+ THPT QG: mỗi buổi 3 giờ gồm 45 phút hệ thống dạng bài + 105 phút ' +
        'luyện đề có chấm chữa chi tiết. Cam kết lộ trình theo thang điểm mục tiêu của từng em.',
      meetingType: 'AT_TUTOR_HOME',
      address: 'Tầng 2, Số 45 Nguyễn Phong Sắc, Dịch Vọng, Cầu Giấy, Hà Nội',
      capacity: 8,
      monthlyFee: 2000000,
      status: 'OPEN',
      startDate: nextWeekday(6), // thứ 7 tuần tới
      schedule: {
        create: [
          { dayOfWeek: 6, startTime: '08:00', endTime: '11:00' }, // Thứ 7
          { dayOfWeek: 0, startTime: '14:00', endTime: '17:00' }, // Chủ nhật
        ],
      },
    },
  })
  const toan12Approved = [
    { u: byEmail.get('nam.parent@example.com'), studentName: 'Trần Đăng Khoa', days: 30 },
    { u: byEmail.get('trang.parent@example.com'), studentName: 'Lê Tuấn Kiệt', days: 28 },
    { u: byEmail.get('vanhung.parent@example.com'), studentName: 'Nguyễn Hùng Cường', days: 25 },
    { u: byEmail.get('kimtuyen.parent@example.com'), studentName: 'Trịnh Khả Ngân', days: 22 },
    { u: byEmail.get('thanhhha.parent@example.com'), studentName: 'Vũ Thanh Mai', days: 18 },
    { u: byEmail.get('quocbao.parent@example.com'), studentName: 'Đinh Quốc Phong', days: 14 },
    { u: byEmail.get('minhquan.student@example.com'), studentName: null, days: 10 },
    { u: byEmail.get('hoanganh.student@example.com'), studentName: 'Đỗ Hoàng Anh', days: 7 },
  ].filter(x => x.u)
  for (const e of toan12Approved) {
    await db.classEnrollment.create({
      data: {
        classId: lopToan12.id,
        studentParentId: e.u!.id,
        studentName: e.studentName,
        status: 'APPROVED',
        createdAt: daysAgo(e.days),
      },
    })
  }

  // ===== Lớp 3: Vật lý 11 tại nhà thầy Hoàng Long — 3/6 + 1 đơn chờ =====
  const lopVatLy = await db.groupClass.create({
    data: {
      tutorId: hoanglong.id,
      subjectId: vatLy.id,
      title: 'Lớp Vật lý 11 — Nâng cao',
      gradeLevel: 'Lớp 11',
      description:
        'Nhóm 6 em học trực tiếp tại nhà gia sư (có bảng riêng, dụng cụ thí nghiệm minh họa). ' +
        'Tập trung dạng bài cơ học – điện học, kèm phương pháp giải nhanh trắc nghiệm.',
      meetingType: 'AT_TUTOR_HOME',
      address: 'Số 128 Kim Mã, Ba Đình, Hà Nội',
      capacity: 6,
      monthlyFee: 1200000,
      status: 'OPEN',
      startDate: nextWeekday(1), // thứ 2 tuần tới
      schedule: {
        create: [
          { dayOfWeek: 1, startTime: '19:00', endTime: '21:00' }, // Thứ 2
          { dayOfWeek: 5, startTime: '19:00', endTime: '21:00' }, // Thứ 6
        ],
      },
    },
  })
  const vatLyApproved = [
    { u: byEmail.get('lan.parent@example.com'), studentName: 'Phạm Thanh Hà', days: 16 },
    { u: byEmail.get('thimai.parent@example.com'), studentName: 'Hồ Nhật Minh', days: 11 },
    { u: byEmail.get('kimtuyen.parent@example.com'), studentName: 'Trịnh Bảo Lam', days: 5 },
  ].filter(x => x.u)
  for (const e of vatLyApproved) {
    await db.classEnrollment.create({
      data: {
        classId: lopVatLy.id,
        studentParentId: e.u!.id,
        studentName: e.studentName,
        status: 'APPROVED',
        createdAt: daysAgo(e.days),
      },
    })
  }
  for (const u of pick(['minhquan.student@example.com'])) {
    await db.classEnrollment.create({
      data: {
        classId: lopVatLy.id,
        studentParentId: u.id,
        studentName: null,
        status: 'PENDING',
        note: 'Em mất gốc điện học khá nhiều, thầy có thể nhận thêm em được không ạ?',
        createdAt: daysAgo(2),
      },
    })
  }

  // ===== Lớp 4: IELTS trực tuyến — tạm dừng tuyển (demo trạng thái PAUSED) =====
  const lopIelts = await db.groupClass.create({
    data: {
      tutorId: quocbao.id,
      subjectId: ielts.id,
      title: 'Lớp IELTS Intensive — Target 6.5+',
      gradeLevel: 'Cấp 3 & người đi làm',
      description:
        'Lộ trình 3 tháng: giờ tự học có giám sát + 2 buổi nhóm trực tuyến/tuần trên Google Meet. ' +
        'Kèm kho đề nội bộ và chấm Writing chi tiết từng lỗi.',
      meetingType: 'ONLINE',
      address: null,
      capacity: 12,
      monthlyFee: 1800000,
      status: 'PAUSED',
      startDate: nextWeekday(3), // thứ 4 tuần tới
      schedule: {
        create: [
          { dayOfWeek: 3, startTime: '18:30', endTime: '20:30' }, // Thứ 4
          { dayOfWeek: 6, startTime: '09:00', endTime: '11:30' }, // Thứ 7
        ],
      },
    },
  })
  const ieltsApproved = [
    { u: byEmail.get('minhtam.parent@example.com'), studentName: 'Lý Bảo Châu', days: 20 },
    { u: byEmail.get('trang.parent@example.com'), studentName: 'Lê Hải Yến', days: 17 },
    { u: byEmail.get('hoanganh.student@example.com'), studentName: null, days: 13 },
    { u: byEmail.get('vanhung.parent@example.com'), studentName: 'Nguyễn Hùng Dũng', days: 8 },
    { u: byEmail.get('quocbao.parent@example.com'), studentName: 'Đinh Bảo Trân', days: 4 },
  ].filter(x => x.u)
  for (const e of ieltsApproved) {
    await db.classEnrollment.create({
      data: {
        classId: lopIelts.id,
        studentParentId: e.u!.id,
        studentName: e.studentName,
        status: 'APPROVED',
        createdAt: daysAgo(e.days),
      },
    })
  }

  console.log('✓ 4 lớp học cố định:')
  console.log('  1. Lớp Toán 10 (Minh Anh) — T3&T5 18:00–20:30, 6/10 + 1 chờ duyệt, tại nhà')
  console.log('  2. Lớp Toán 12 luyện thi (Minh Anh) — T7&CN, 8/8 ĐỦ chỗ, tại nhà')
  console.log('  3. Lớp Vật lý 11 (Hoàng Long) — T2&T6 19:00–21:00, 3/6 + 1 chờ duyệt, tại nhà')
  console.log('  4. Lớp IELTS Online (Quốc Bảo) — T4&T7, 5/12, TẠM DỪNG tuyển')
  console.log('✓ hoa.parent đã vào Lớp Toán 10 (APPROVED) — dashboard phụ huynh có dữ liệu')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
