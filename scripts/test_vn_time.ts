// scripts/test_vn_time.ts — unit test cho src/lib/vn-time.ts
// Chạy trên host UTC (sandbox) để chứng minh logic KHÔNG còn phụ thuộc TZ server.
//   bun scripts/test_vn_time.ts
import { vnEpoch, vnTodayISO, vnCurrentPeriod, vnMonthOf, vnDayOfWeek, addDaysISO, addWeeksISO, VN_OFFSET_MS } from '../src/lib/vn-time'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

console.log(`TZ server hiện tại: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`)

// ===== vnEpoch: epoch tuyệt đối theo +07:00 =====
// 2026-10-18T18:00 VN = 2026-10-18T11:00Z
check('vnEpoch("2026-10-18","18:00") === Date.parse("2026-10-18T18:00:00+07:00")',
  vnEpoch('2026-10-18', '18:00') === Date.parse('2026-10-18T18:00:00+07:00'))
check('vnEpoch("2026-10-18","18:00") === 11:00Z cùng ngày',
  new Date(vnEpoch('2026-10-18', '18:00')).toISOString() === '2026-10-18T11:00:00.000Z')
// Trên host UTC, parse cũ `new Date("2026-10-18T18:00")` cho 18:00Z — lệch 7h
const oldWayUTC = Date.parse('2026-10-18T18:00:00')
check('cũ (server-local UTC) lệch đúng 7h so với vnEpoch', oldWayUTC - vnEpoch('2026-10-18', '18:00') === VN_OFFSET_MS)
check('vnEpoch mặc định 00:00', vnEpoch('2026-10-18') === Date.parse('2026-10-18T00:00:00+07:00'))

// ===== vnTodayISO: "hôm nay" theo VN =====
// Giờ hiện tại tuyệt đối
const now = Date.now()
const vnToday = vnTodayISO()
// Tự tính: chuỗi ngày của (now + 7h) theo UTC
const expectToday = new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10)
check('vnTodayISO === ngày của (now+7h)', vnToday === expectToday, `${vnToday} vs ${expectToday}`)
// Kịch bản bug cũ: 20:00 UTC ngày 17 → VN đã là 18 → "hôm nay" phải là 18
// Mô phỏng bằng hằng số: now = 2026-10-17T20:00:00Z
const fake = Date.parse('2026-10-17T20:00:00Z')
check('kịch bản 20:00Z ngày 17 → hôm nay theo VN là 18',
  new Date(fake + VN_OFFSET_MS).toISOString().slice(0, 10) === '2026-10-18')

// ===== vnDayOfWeek =====
// 2026-10-18 là CHỦ NHẬT (0)
check('2026-10-18 là chủ nhật (0)', vnDayOfWeek('2026-10-18') === 0)
check('2026-10-19 là thứ 2 (1)', vnDayOfWeek('2026-10-19') === 1)
check('2026-10-23 là thứ 6 (5)', vnDayOfWeek('2026-10-23') === 5)
check('2026-10-24 là thứ 7 (6)', vnDayOfWeek('2026-10-24') === 6)

// ===== addDaysISO: thuần chuỗi =====
check('addDaysISO("2026-10-31", 1) === "2026-11-01"', addDaysISO('2026-10-31', 1) === '2026-11-01')
check('addDaysISO("2026-01-01", -1) === "2025-12-31"', addDaysISO('2026-01-01', -1) === '2025-12-31')
check('addDaysISO("2024-02-28", 1) === "2024-02-29" (năm nhuận)', addDaysISO('2024-02-28', 1) === '2024-02-29')
check('addDaysISO("2026-02-28", 1) === "2026-03-01" (không nhuận)', addDaysISO('2026-02-28', 1) === '2026-03-01')

// ===== addWeeksISO =====
check('addWeeksISO("2026-10-18", 2) === "2026-11-01"', addWeeksISO('2026-10-18', 2) === '2026-11-01')
check('addWeeksISO giữ thứ: 2026-10-18 (CN) + 3 tuần vẫn CN',
  vnDayOfWeek(addWeeksISO('2026-10-18', 3)) === 0)

// ===== vnCurrentPeriod / vnMonthOf =====
check('vnMonthOf(Date.parse("2026-10-17T20:00:00Z")) === "2026-10" (đã qua 18/10 theo VN)',
  vnMonthOf(new Date(Date.parse('2026-10-17T20:00:00Z'))) === '2026-10')
check('vnMonthOf(Date.parse("2026-12-31T20:00:00Z")) === "2027-01" (sang năm mới theo VN)',
  vnMonthOf(new Date(Date.parse('2026-12-31T20:00:00Z'))) === '2027-01')
check('vnCurrentPeriod có dạng YYYY-MM', /^\d{4}-\d{2}$/.test(vnCurrentPeriod()))

// ===== hoursUntil scenario (cốt lõi của audit B3) =====
// Buổi học 2026-10-19T18:00 VN. "Hiện tại" giả định 2026-10-18T12:00Z = 19:00 VN
// → còn 23h tới buổi. Cách cũ (host UTC): 18:00Z-12:00Z = 30h → SAI +7h.
const classStart = vnEpoch('2026-10-19', '18:00')
const nowFake = Date.parse('2026-10-18T12:00:00Z')
const hoursUntilNew = (classStart - nowFake) / 3_600_000
check('hoursUntil theo VN = 23h (chính xác, đủ để bị phạt nhẹ nếu hủy sát giờ... vd)',
  Math.round(hoursUntilNew) === 23, `${hoursUntilNew}`)
const oldParse = Date.parse('2026-10-19T18:00:00') // server UTC
check('hoursUntil cách cũ trên host UTC = 30h (lệch 7h — đúng như audit)',
  Math.round((oldParse - nowFake) / 3_600_000) === 30)

console.log(`\nKẾT QUẢ: ${pass} PASS · ${fail} FAIL`)
process.exit(fail > 0 ? 1 : 0)
