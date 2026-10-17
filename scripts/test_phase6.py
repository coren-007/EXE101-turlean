#!/usr/bin/env python3
"""Test end-to-end PHASE 6 — Trust & Admin (xác minh bằng cấp + tự khóa tài khoản):
  A. Phân quyền: admin login, guest 401, tutor/student 403 trên API admin
  B. Upload xác minh (gia sư): multipart, metadata-only, chặn trùng PENDING, 5MB, mime
  C. Admin duyệt: xem file (bytes khớp), từ chối thiếu lý do 400, REJECTED → gửi lại
     được, APPROVED ⇒ isVerified bật thật, duyệt 2 lần 400
  D. Tự khóa: 5 vi phạm -15đ (insert trực tiếp DB) ⇒ điểm 25, hủy buổi thứ 6 qua API
     ⇒ autoLocked, login 403, session cũ chết, admin unlock ⇒ login lại được
  E. Dọn dẹp throwaway
"""
import json
import subprocess
import sys
import urllib.request
import urllib.error
import uuid
from datetime import date, timedelta, datetime

BASE = 'http://localhost:3000'
SESSIONS = {}


def req(method, path, body=None, role=None):
    r = urllib.request.Request(BASE + path, method=method)
    r.add_header('Content-Type', 'application/json')
    if role and SESSIONS.get(role):
        r.add_header('Cookie', f"tc_session={SESSIONS[role]}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        resp = urllib.request.urlopen(r, data=data)
        out = json.loads(resp.read().decode())
        _grab_session(resp, role)
        return resp.status, out
    except urllib.error.HTTPError as e:
        try:
            out = json.loads(e.read().decode())
        except Exception:
            out = {'error': f'non-json response: {e.reason}'}
        return e.code, out


def req_multipart(method, path, fields, filename, filebytes, mime, role=None):
    """Gửi multipart/form-data (fields + 1 file). Trả (status, json)."""
    b = uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(
            f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
        )
    parts.append(
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f'Content-Type: {mime}\r\n\r\n'.encode()
    )
    parts.append(filebytes)
    parts.append(f'\r\n--{b}--\r\n'.encode())
    body = b''.join(parts)

    r = urllib.request.Request(BASE + path, method=method, data=body)
    r.add_header('Content-Type', f'multipart/form-data; boundary={b}')
    if role and SESSIONS.get(role):
        r.add_header('Cookie', f"tc_session={SESSIONS[role]}")
    try:
        resp = urllib.request.urlopen(r)
        raw = resp.read()
        _grab_session(resp, role)
        try:
            return resp.status, json.loads(raw.decode())
        except Exception:
            return resp.status, {'_raw': raw[:200]}
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception as e2:
            return e.code, {'error': f'non-json: {e2}'}


def _header(headers, name):
    """Header lookup case-insensitive (Next.js trả về chữ thường)."""
    for k, v in headers.items():
        if k.lower() == name.lower():
            return v
    return ''


def req_file(path, role=None):
    """GET trả về binary — trả (status, bytes, headers)."""
    r = urllib.request.Request(BASE + path)
    if role and SESSIONS.get(role):
        r.add_header('Cookie', f"tc_session={SESSIONS[role]}")
    try:
        resp = urllib.request.urlopen(r)
        return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read(), dict(e.headers)
        except Exception:
            return e.code, b'', {}


def _grab_session(resp, role):
    if not role:
        return
    for c in (resp.headers.get('set-cookie') or '').split(','):
        if 'tc_session=' in c:
            SESSIONS[role] = c.split('tc_session=')[1].split(';')[0]


ok, fail = 0, 0
def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'  ✓ {name}')
    else:
        fail += 1
        print(f'  ✗ {name} {extra}')


today = date.today()
PNG_FAKE = b'\x89PNG\r\n\x1a\n' + bytes(range(256)) * 40  # ~10KB, server kiểm mime+size

# Tutors: minhanh (ĐÃ verified, dạy online — dùng cho auto-lock)
# Tutor cho luồng xác minh: chọn ĐỘNG tutor chưa verified (tránh tutor đã được
# test duyệt ở lần chạy trước — test phải idempotent)
ADMIN_EMAIL = 'admin@turlean.vn'
TUTOR_BOOK = 'minhanh.tutor@example.com'

# Bun script thao tác DB trực tiếp (insert Cancellation + dọn dẹp)
BUN_SCRIPT = r'''
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
// LƯU Ý: `bun -e <script> a b` ⇒ process.argv = [bun, a, b] — argv[1] là tham số ĐẦU
const mode = process.argv[2 - 1];
(async () => {
  if (mode === 'seed-violations') {
    const studentId = process.argv[3 - 1];
    const tutorId = process.argv[4 - 1];
    const bookings = await db.booking.findMany({
      where: { studentId, tutorId, status: 'PENDING' },
      orderBy: { date: 'asc' },
    });
    if (bookings.length < 6) { console.error('CANdoi: ' + bookings.length); process.exit(2); }
    const first5 = bookings.slice(0, 5);
    for (const b of first5) {
      await db.cancellation.create({
        data: {
          bookingId: b.id, cancelledBy: 'STUDENT',
          reason: 'Test vi phạm liên tiếp', bookingStatus: 'CONFIRMED',
          hoursBefore: 1.0, severity: 'VIOLATION', points: 15,
        },
      });
      await db.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
    }
    console.log('OK:' + first5.length + ':' + bookings[5].id);
  } else if (mode === 'reset-verification') {
    // Trạng thái ban đầu deterministic cho test: xóa hết yêu cầu + tắt isVerified
    const tutorId = process.argv[3 - 1];
    await db.verificationRequest.deleteMany({ where: { tutorId } });
    await db.user.update({ where: { id: tutorId }, data: { isVerified: false } });
    console.log('RESET');
  } else if (mode === 'cleanup') {
    const studentId = process.argv[3 - 1];
    await db.cancellation.deleteMany({ where: { booking: { studentId } } });
    await db.booking.deleteMany({ where: { studentId } });
    await db.session.deleteMany({ where: { userId: studentId } });
    await db.conversation.deleteMany({ where: { studentId } });
    await db.user.delete({ where: { id: studentId } });
    console.log('CLEANED');
  }
  await db.$disconnect();
})().catch(e => { console.error(String(e && e.message || e)); process.exit(1); });
'''


def bun(*args):
    p = subprocess.run(['bun', '-e', BUN_SCRIPT, *args], capture_output=True, text=True, timeout=60)
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def to_min(t):
    h, m = t.split(':')
    return int(h) * 60 + int(m)


def hm(m):
    return f'{m // 60:02d}:{m % 60:02d}'


def dow_sys(d):
    return (d.weekday() + 1) % 7  # Python Mon=0 → hệ thống CN=0


print('════════════ PHASE 6 — TRUST & ADMIN ════════════')

# ===== A. Phân quyền & đăng nhập =====
print('=== A. Phân quyền & đăng nhập ===')
st, out = req('POST', '/api/auth/login', {'email': ADMIN_EMAIL, 'password': '123456'}, role='admin')
check('login admin (admin@turlean.vn)', st == 200 and out.get('role') == 'ADMIN', str(out.get('error', '')))

st, out = req('POST', '/api/auth/login', {'email': 'ductri.tutor@example.com', 'password': '123456'}, role='tutor')
if st != 200:
    st, out = req('POST', '/api/auth/login', {'email': 'thilan.tutor@example.com', 'password': '123456'}, role='tutor')
check('login gia sư (chưa xác minh)', st == 200 and out.get('role') == 'TUTOR', str(out.get('error', '')))
TUTOR_ID = out.get('id', '')

# Reset trạng thái xác minh của tutor này (xóa yêu cầu cũ + tắt isVerified)
# ⇒ test idempotent bất chấp lần chạy trước đã duyệt/từ chối
rc0, so0, se0 = bun('reset-verification', TUTOR_ID)
check('reset trạng thái xác minh cho test (idempotent)', rc0 == 0 and so0 == 'RESET', so0 + se0)

st, out = req('POST', '/api/auth/login', {'email': 'hoa.parent@example.com', 'password': '123456'}, role='student')
check('login phụ huynh', st == 200)

st, out = req('GET', '/api/admin/stats')
check('guest gọi API admin → 401', st == 401, f'got {st}')
st, out = req('GET', '/api/admin/stats', role='tutor')
check('gia sư gọi API admin → 403', st == 403, f'got {st}')
st, out = req('GET', '/api/admin/verification', role='student')
check('phụ huynh gọi API admin → 403', st == 403, f'got {st}')
st, out = req('GET', '/api/admin/stats', role='admin')
check('admin gọi API stats → 200', st == 200 and 'totals' in out)
check('stats có watchlist + bookingByStatus', 'watchlist' in out and 'bookingByStatus' in out)

# ===== B. Upload xác minh (gia sư) =====
print('=== B. Gia sư gửi yêu cầu xác minh ===')
st, td = req('GET', f'/api/tutors/{TUTOR_ID}')
check('gia sư test đang CHƯA xác minh (điều kiện test)', td.get('isVerified') is False)

st, out = req_multipart('POST', '/api/tutors/me/verification',
                        {'kind': 'DEGREE', 'note': 'Bằng Cử nhân Sư phạm Toán — ĐHSP Hà Nội'},
                        'bang-cap.png', PNG_FAKE, 'image/png', role='tutor')
check('upload PNG 10KB kind DEGREE → 201 PENDING', st == 201 and out.get('request', {}).get('status') == 'PENDING', str(out.get('error', '')))
REQ_DEGREE_ID = out.get('request', {}).get('id', '')

st, out = req('GET', '/api/tutors/me/verification', role='tutor')
reqs = out.get('requests', [])
check('GET danh sách của chính mình', st == 200 and len(reqs) >= 1)
check('response KHÔNG chứa fileData (metadata only)', all('fileData' not in r for r in reqs))
check('metadata đủ fileName/fileSize/fileType', reqs[0].get('fileName') == 'bang-cap.png' and reqs[0].get('fileSize') == len(PNG_FAKE))
check('pendingCount đếm đúng', out.get('pendingCount', 0) >= 1)

st, out = req_multipart('POST', '/api/tutors/me/verification',
                        {'kind': 'DEGREE'}, 'bang-cap-2.png', PNG_FAKE, 'image/png', role='tutor')
check('chặn trùng: cùng kind đang PENDING → 400', st == 400 and 'đang chờ duyệt' in out.get('error', ''), str(out.get('error', '')))

st, out = req_multipart('POST', '/api/tutors/me/verification',
                        {'kind': 'CERTIFICATE'}, 'ielts.pdf', b'%PDF-1.4 test', 'application/pdf', role='tutor')
check('kind khác (CERTIFICATE, PDF) → 201', st == 201)
REQ_CERT_ID = out.get('request', {}).get('id', '')

big = b'\x89PNG\r\n\x1a\n' + b'x' * (6 * 1024 * 1024)
st, out = req_multipart('POST', '/api/tutors/me/verification',
                        {'kind': 'ID_CARD'}, 'lon.png', big, 'image/png', role='tutor')
check('file 6MB → 413', st == 413, f'got {st}')

st, out = req_multipart('POST', '/api/tutors/me/verification',
                        {'kind': 'ID_CARD'}, 'note.txt', b'hello', 'text/plain', role='tutor')
check('mime text/plain → 400', st == 400 and 'ảnh' in out.get('error', ''), str(out.get('error', '')))

st, out = req_multipart('POST', '/api/tutors/me/verification',
                        {'kind': 'PASSPORT'}, 'p.png', PNG_FAKE, 'image/png', role='tutor')
check('kind sai (PASSPORT) → 400', st == 400, f'got {st}')

st, out = req_multipart('POST', '/api/tutors/me/verification',
                        {'kind': 'DEGREE'}, 'p.png', PNG_FAKE, 'image/png', role='student')
check('phụ huynh upload → 403', st == 403, f'got {st}')

st, out = req_multipart('POST', '/api/tutors/me/verification',
                        {'kind': 'DEGREE'}, 'p.png', PNG_FAKE, 'image/png', role='admin')
check('admin upload → 403 (chỉ gia sư)', st == 403, f'got {st}')

st, out = req('DELETE', f'/api/tutors/me/verification?id={REQ_CERT_ID}', role='tutor')
check('rút lại yêu cầu PENDING → 200', st == 200, str(out.get('error', '')))
st, out = req('GET', '/api/tutors/me/verification', role='tutor')
check('sau rút: không còn CERTIFICATE pending', all(r['kind'] != 'CERTIFICATE' for r in out.get('requests', [])))

# ===== C. Admin duyệt / từ chối =====
print('=== C. Admin duyệt yêu cầu ===')
st, out = req('GET', '/api/admin/verification', role='admin')
admin_reqs = out.get('requests', [])
check('admin thấy danh sách (có PENDING lên trước)', st == 200 and len(admin_reqs) >= 1)
check('danh sách admin cũng KHÔNG chứa fileData', all('fileData' not in r for r in admin_reqs))
check('kèm thông tin gia sư (tutor.name)', all('tutor' in r and 'name' in r['tutor'] for r in admin_reqs))

st, raw, headers = req_file(f'/api/admin/verification/{REQ_DEGREE_ID}/file', role='admin')
check('admin tải file → 200 image/png', st == 200 and _header(headers, 'Content-Type').startswith('image/png'), f'got {st}')
check('bytes file khớp đúng file đã upload', raw == PNG_FAKE, f'{len(raw)} vs {len(PNG_FAKE)}')

st, raw, headers = req_file(f'/api/admin/verification/{REQ_DEGREE_ID}/file', role='tutor')
check('gia sư tải file qua API admin → 403', st == 403, f'got {st}')

st, out = req('POST', f'/api/admin/verification/{REQ_DEGREE_ID}/review',
              {'status': 'REJECTED'}, role='admin')
check('từ chối THIẾU lý do → 400', st == 400 and '5 ký tự' in out.get('error', ''), str(out.get('error', '')))

st, out = req('POST', f'/api/admin/verification/{REQ_DEGREE_ID}/review',
              {'status': 'REJECTED', 'reviewNote': 'Ảnh mờ không đọc được số hiệu'}, role='admin')
check('từ chối kèm lý do → 200', st == 200 and out.get('request', {}).get('status') == 'REJECTED', str(out.get('error', '')))
st, td = req('GET', f'/api/tutors/{TUTOR_ID}')
check('REJECTED ⇒ isVerified vẫn false', td.get('isVerified') is False)

st, out = req('GET', '/api/tutors/me/verification', role='tutor')
check('gia sư thấy lý do bị từ chối', any(r.get('reviewNote') == 'Ảnh mờ không đọc được số hiệu' for r in out.get('requests', [])))

st, out = req_multipart('POST', '/api/tutors/me/verification',
                        {'kind': 'DEGREE', 'note': 'Chụp lại rõ hơn'}, 'bang-cap-v2.png', PNG_FAKE, 'image/png', role='tutor')
check('sau REJECTED gửi lại cùng kind → 201', st == 201)
REQ_DEGREE2_ID = out.get('request', {}).get('id', '')

st, out = req('POST', f'/api/admin/verification/{REQ_DEGREE2_ID}/review',
              {'status': 'REJECTED'}, role='tutor')
check('gia sư tự duyệt → 403', st == 403, f'got {st}')

st, out = req('POST', f'/api/admin/verification/{REQ_DEGREE2_ID}/review',
              {'status': 'APPROVED', 'reviewNote': 'Đã đối chiếu bằng gốc'}, role='admin')
check('duyệt APPROVED → 200', st == 200 and out.get('tutorVerified') is True, str(out.get('error', '')))
st, td = req('GET', f'/api/tutors/{TUTOR_ID}')
check('APPROVED ⇒ isVerified = TRUE trên API công khai', td.get('isVerified') is True)

st, out = req('POST', f'/api/admin/verification/{REQ_DEGREE2_ID}/review',
              {'status': 'REJECTED', 'reviewNote': 'đổi ý'}, role='admin')
check('duyệt lần 2 cùng request → 400', st == 400 and 'đã được xử lý' in out.get('error', ''), str(out.get('error', '')))

st, out = req('GET', '/api/admin/verification?status=REJECTED', role='admin')
check('filter status=REJECTED hoạt động', st == 200 and all(r['status'] == 'REJECTED' for r in out.get('requests', [])))

st, out = req('GET', '/api/admin/users?locked=1', role='admin')
check('GET users?locked=1 → 200 (chưa có ai khóa)', st == 200 and isinstance(out.get('users'), list))

# ===== D. Tự khóa tài khoản (reliability < 30) =====
print('=== D. Tự khóa khi điểm tin cậy < 30 ===')
TEST_EMAIL = f'p6lock.test.{datetime.utcnow().strftime("%H%M%S")}@example.com'
st, out = req('POST', '/api/auth/register', {'name': 'Test Lock P6', 'email': TEST_EMAIL, 'password': '123456', 'role': 'STUDENT'})
check('đăng ký student throwaway', st == 200, str(out.get('error', '')))
st, out = req('POST', '/api/auth/login', {'email': TEST_EMAIL, 'password': '123456'}, role='victim')
check('login throwaway', st == 200)
VICTIM_ID = out.get('id', '')

st, mb = req('POST', '/api/auth/login', {'email': TUTOR_BOOK, 'password': '123456'}, role='tutor2')
st, td = req('GET', f"/api/tutors/{mb.get('id', '')}")
SUBJ_ID = td['subjects'][0]['id']
AVAILS, BUSY = td['availabilities'], td.get('busySlots') or []

# Sinh 6 slot tương lai từ availability − busySlots
cands = []
for wk in range(1, 7):
    for a in AVAILS:
        d = today + timedelta(days=(7 * wk))
        while dow_sys(d) != a['dayOfWeek']:
            d += timedelta(days=1)
        if d <= today + timedelta(days=2):
            continue
        s, e = to_min(a['startTime']), to_min(a['endTime'])
        if e - s > 240:
            e = s + 240
        clash = any(
            b['date'] == d.isoformat() and s < to_min(b['endTime']) and e > to_min(b['startTime'])
            for b in BUSY
        )
        if not clash:
            cands.append((d.isoformat(), hm(s), hm(e)))
cands = sorted(set(cands))[:12]

booking_ids = []
for d, s, e in cands:
    if len(booking_ids) >= 6:
        break
    st, out = req('POST', '/api/bookings', {
        'tutorId': mb['id'], 'subjectId': SUBJ_ID, 'mode': 'ONLINE',
        'date': d, 'startTime': s, 'endTime': e, 'note': 'P6 auto-lock test',
    }, role='victim')
    if st in (200, 201):
        booking_ids.append(out.get('booking', {}).get('id') or out.get('id'))
check(f'đặt được 6 buổi sạch (đã đặt {len(booking_ids)})', len(booking_ids) == 6)

if len(booking_ids) == 6:
    rc, so, se = bun('seed-violations', VICTIM_ID, mb['id'])
    check('gây 5 vi phạm -15đ trực tiếp DB (điểm còn 25)', rc == 0 and so.startswith('OK:5:'), so + se)
    LAST_BOOKING = so.split(':')[2] if so.startswith('OK:5:') else ''
else:
    LAST_BOOKING = ''

if LAST_BOOKING:
    st, out = req('POST', f'/api/bookings/{LAST_BOOKING}/cancel',
                  {'reason': 'Hủy buổi cuối để test tự khóa'}, role='victim')
    check('hủy buổi thứ 6 qua API → 200', st == 200, str(out.get('error', '')))
    check('phản hồi có autoLocked = true', out.get('autoLocked') is True, json.dumps(out.get('autoLocked')))
    check('reliabilityScore = 25', out.get('reliabilityScore') == 25, str(out.get('reliabilityScore')))
    check('message nói rõ tài khoản bị KHÓA', 'KHÓA' in out.get('message', ''), out.get('message', '')[:80])

    st, out = req('POST', '/api/auth/login', {'email': TEST_EMAIL, 'password': '123456'}, role='victim2')
    check('login sau khi khóa → 403', st == 403, f'got {st}')
    check('lý do khóa hiện rõ (liên hệ hỗ trợ)', 'khóa' in out.get('error', '').lower() and out.get('locked') is True)

    st, out = req('GET', '/api/me', role='victim')
    check('session CŨ bị vô hiệu ngay (/api/me → null)', st == 200 and out.get('user') is None)

    st, out = req('GET', '/api/admin/stats', role='admin')
    check('admin stats đếm lockedAccounts ≥ 1', out.get('totals', {}).get('lockedAccounts', 0) >= 1)

    st, out = req('GET', '/api/admin/users?locked=1', role='admin')
    locked = [u for u in out.get('users', []) if u['id'] == VICTIM_ID]
    check('admin thấy tài khoản khóa + điểm 25', len(locked) == 1 and locked[0].get('reliabilityScore') == 25)

    st, out = req('POST', f'/api/admin/users/{VICTIM_ID}/unlock', role='tutor')
    check('gia sư gọi unlock → 403', st == 403, f'got {st}')

    st, out = req('POST', f'/api/admin/users/{VICTIM_ID}/unlock', role='admin')
    check('admin mở khóa → 200', st == 200, str(out.get('error', '')))

    st, out = req('POST', '/api/auth/login', {'email': TEST_EMAIL, 'password': '123456'}, role='victim')
    check('login sau mở khóa → 200 lại được', st == 200, str(out.get('error', '')))

    st, out = req('POST', f'/api/admin/users/{VICTIM_ID}/unlock', role='admin')
    check('mở khóa tài khoản không khóa → 400', st == 400, f'got {st}')

# ===== E. Dọn dẹp =====
print('=== E. Dọn dẹp ===')
if VICTIM_ID:
    rc, so, se = bun('cleanup', VICTIM_ID)
    check('xóa throwaway + booking + cancellation (FK đúng thứ tự)', rc == 0 and so == 'CLEANED', so + se)
    st, out = req('POST', '/api/auth/login', {'email': TEST_EMAIL, 'password': '123456'})
    check('sau dọn: login throwaway → 400 (đã xóa)', st == 400)

# Ghi chú: test tự reset trạng thái xác minh của tutor dùng cho test ở đầu mỗi
# lần chạy (bun reset-verification) nên idempotent. Lịch sử REJECTED/APPROVED
# tạo trong lần chạy CUỐI được giữ lại cho admin dashboard có dữ liệu demo.

print()
print('=' * 50)
print(f'KẾT QUẢ: {ok} PASS · {fail} FAIL')
if fail > 0:
    sys.exit(1)
