#!/usr/bin/env python3
"""Test end-to-end TRỤ CỘT ĐẶT LỊCH & GIAO DỊCH — booking 1-1:
  A. Validate đầu vào khi đặt (auth, role, zod, quá khứ, mode, subject, availability)
  B. Chống double-booking: gia sư trùng giờ, học sinh trùng giờ
  C. Lớp định kỳ repeatWeeks: created/skipped/seriesId + hủy từng buổi
  D. State machine PATCH: CONFIRM / COMPLETED đúng giờ, chặn transition sai
  E. Hủy lịch qua /cancel: lý do bắt buộc, ghi vi phạm, không hủy được sau khi hủy
  F. Review: chỉ buổi COMPLETED, chỉ học sinh, chỉ 1 lần, rating 1-5
  G. Tiền: server tự tính totalAmount = pricePerHour × durationHours

Chiến lược slot động (idempotent, chạy lại được nhiều lần):
  - Buổi A (tương lai, cho state machine + hủy): tìm slot trống thật của gia sư
    từ availability − busySlots, POST thử cho tới khi thành công.
  - Buổi B (bắt đầu sau ~10 phút): đặt + CONFIRM ngay đầu test; các section
    khác chạy trong lúc chờ tới giờ → section F không phải chờ lâu.
  - Student throwaway mỗi lần chạy → không conflict dữ liệu cũ.
"""
import json
import urllib.request
import urllib.error
from datetime import date, datetime, timedelta

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
        for c in (resp.headers.get('set-cookie') or '').split(','):
            if 'tc_session=' in c and role:
                SESSIONS[role] = c.split('tc_session=')[1].split(';')[0]
        return resp.status, out
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {'error': f'non-json response: {e.reason}'}


ok, fail = 0, 0
def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'  ✓ {name}')
    else:
        fail += 1
        print(f'  ✗ {name} {extra}')


def to_min(t):
    h, m = t.split(':')
    return int(h) * 60 + int(m)

def hm(m):
    return f'{m // 60:02d}:{m % 60:02d}'

today = date.today()
def dow_sys(d):
    return (d.weekday() + 1) % 7  # Python Mon=0 → hệ thống T2=1, CN=0

_utcnow = datetime.utcnow()
now_min = (_utcnow + timedelta(minutes=2)).hour * 60 + (_utcnow + timedelta(minutes=2)).minute

# ===== 0. Đăng nhập + tìm slot động =====
print('=== 0. Chuẩn bị: tài khoản + slot động ===')
st, out = req('POST', '/api/auth/login', {'email': 'minhanh.tutor@example.com', 'password': '123456'}, role='tutor')
check('login gia sư Minh Anh', st == 200, str(out.get('error', '')))
TUTOR_ID = out.get('id', '') or (out.get('user') or {}).get('id', '')

TEST_EMAIL = f'booking.test.{datetime.utcnow().strftime("%H%M%S")}@example.com'
st, out = req('POST', '/api/auth/register', {
    'name': 'Test Booking', 'email': TEST_EMAIL, 'password': '123456', 'role': 'STUDENT'})
check('đăng ký student throwaway', st == 200, str(out.get('error', '')))
st, out = req('POST', '/api/auth/login', {'email': TEST_EMAIL, 'password': '123456'}, role='student')
check('login student throwaway', st == 200, str(out.get('error', '')))
st, out = req('POST', '/api/auth/register', {
    'name': 'Student Hai', 'email': TEST_EMAIL.replace('booking.test.', 'booking.test2.'),
    'password': '123456', 'role': 'STUDENT'})
st, out = req('POST', '/api/auth/login', {'email': TEST_EMAIL.replace('booking.test.', 'booking.test2.'),
                                          'password': '123456'}, role='student2')
check('login student thứ hai', st == 200)

st, td = req('GET', f'/api/tutors/{TUTOR_ID}')
SUBJ_ID, PRICE = td['subjects'][0]['id'], td['subjects'][0]['pricePerHour']
AVAILS, BUSY = td['availabilities'], td.get('busySlots') or []
print(f"  (gia sư A: {td.get('name')} | {td['subjects'][0]['name']} @ {PRICE}/h | {len(AVAILS)} khung rảnh | {len(BUSY)} slot bận)")

# --- Buổi B: tutor nào có khung HÔM NAY bắt đầu trong [now+4, now+6], đủ duration 30-90' ---
B_CTX = None  # (role_key, tutor_id, subject_id, date, start, end)
CAND_EMAILS = ['ductri.tutor@example.com', 'thanhtung.tutor@example.com', 'tuankiet.tutor@example.com',
               'thuha.tutor@example.com', 'minhquan.tutor@example.com', 'hoanglong.tutor@example.com',
               'minhanh.tutor@example.com', 'sarah.tutor@example.com', 'kimngan.tutor@example.com',
               'quocbao.tutor@example.com', 'maiphuong.tutor@example.com', 'thilan.tutor@example.com']
for em in CAND_EMAILS:
    key = 'tb_' + em.split('.')[0]
    st, lo = req('POST', '/api/auth/login', {'email': em, 'password': '123456'}, role=key)
    if st != 200:
        continue
    tid = lo.get('id', '') or (lo.get('user') or {}).get('id', '')
    st, d2 = req('GET', f'/api/tutors/{tid}')
    if st != 200 or not d2.get('teachesOnline') or not d2.get('subjects'):
        continue
    bs_today = [b for b in (d2.get('busySlots') or []) if b['date'] == today.isoformat()]
    for a in d2['availabilities']:
        if a['dayOfWeek'] != dow_sys(today):
            continue
        s, e = to_min(a['startTime']), to_min(a['endTime'])
        for start in range(now_min + 3, now_min + 7):
            if start < s:
                continue
            for dur in (90, 60, 45, 30):
                if start + dur <= e:
                    clash = any(start < to_min(b['endTime']) and start + dur > to_min(b['startTime']) for b in bs_today)
                    if not clash:
                        B_CTX = (key, tid, d2['subjects'][0]['id'], today.isoformat(), hm(start), hm(start + dur))
                        break
                if B_CTX:
                    break
            if B_CTX:
                break
        if B_CTX:
            break
    if B_CTX:
        break

def gen_cands(day_from, day_to):
    """Sinh slot 90' trống theo availability − busySlots cho dải [day_from, day_to] ngày tới"""
    out = []
    for d in range(day_from, day_to):
        dt = today + timedelta(days=d)
        busy_d = [b for b in BUSY if b['date'] == dt.isoformat()]
        for a in AVAILS:
            if a['dayOfWeek'] != dow_sys(dt):
                continue
            s, e = to_min(a['startTime']), to_min(a['endTime'])
            for st_m in range(s, e - 89, 30):
                clash = any(st_m < to_min(b['endTime']) and st_m + 90 > to_min(b['startTime']) for b in busy_d)
                if not clash:
                    out.append((dt.isoformat(), hm(st_m), hm(st_m + 90)))
    return out

# --- Buổi A: slot tương lai gần (2-12 ngày) trống của Minh Anh ---
A_CTX = None
booking_a = None
cands = gen_cands(2, 12)
for c in cands[:12]:
    body = dict(tutorId=TUTOR_ID, subjectId=SUBJ_ID, mode='ONLINE',
                date=c[0], startTime=c[1], endTime=c[2])
    st, out = req('POST', '/api/bookings', body, role='student')
    if st == 200:
        A_CTX, booking_a = c, out
        break
check('đặt buổi A (slot trống động) → 200', A_CTX is not None,
      str(out.get('error', ''))[:70] if A_CTX is None else '')
A_DATE, A_START, A_END = A_CTX if A_CTX else (None, None, None)
A_ID = booking_a['id'] if booking_a else ''
print(f'  (buổi A: {A_DATE} {A_START}-{A_END})')

# --- Đặt + CONFIRM buổi B ngay để "giờ học" tới trong lúc test chạy ---
if B_CTX:
    b_key, b_tid, b_subj, b_date, b_start, b_end = B_CTX
    st, booking_b = req('POST', '/api/bookings', {
        'tutorId': b_tid, 'subjectId': b_subj, 'mode': 'ONLINE',
        'date': b_date, 'startTime': b_start, 'endTime': b_end}, role='student')
    check('đặt buổi B (hôm nay, sắp tới giờ) → 200', st == 200, str(booking_b.get('error', ''))[:70])
    B_ID = booking_b.get('id', '') if st == 200 else ''
    if B_ID:
        st, out = req('PATCH', '/api/bookings', {'bookingId': B_ID, 'status': 'CONFIRMED'}, role=b_key)
        check('tutor B CONFIRM ngay → 200', st == 200, str(out.get('error', ''))[:70])
        print(f'  (buổi B: {b_date} {b_start}-{b_end} — tutor {b_key})')
else:
    B_ID = ''
    print('  (không tìm được tutor có khung chiều nay — section F sẽ bỏ qua)')

# ===== A. Validate đầu vào =====
print('=== A. Validate đầu vào POST /api/bookings ===')
base_body = dict(tutorId=TUTOR_ID, subjectId=SUBJ_ID, mode='ONLINE',
                 date=A_DATE, startTime=A_START, endTime=A_END)

st, out = req('POST', '/api/bookings', base_body)
check('không login → 401', st == 401, f'got {st}')
st, out = req('POST', '/api/bookings', base_body, role='tutor')
check('gia sư tự đặt lịch → 403', st == 403, f'got {st}')
bad = dict(base_body, date='12-10-2026')
st, out = req('POST', '/api/bookings', bad, role='student')
check('sai định dạng ngày → 400', st == 400, f'got {st}')
bad = dict(base_body, startTime='25:00')
st, out = req('POST', '/api/bookings', bad, role='student')
check('giờ 25:00 → 400', st == 400, f'got {st}')
bad = dict(base_body, startTime=A_END, endTime=A_START)
st, out = req('POST', '/api/bookings', bad, role='student')
check('kết thúc trước bắt đầu → 400', st == 400, f'got {st}')
bad = dict(base_body, startTime='08:00', endTime='13:00')
st, out = req('POST', '/api/bookings', bad, role='student')
check('5 tiếng (qua 4h max) → 400', st == 400, f'got {st}')
bad = dict(base_body, date='2026-09-01')
st, out = req('POST', '/api/bookings', bad, role='student')
check('ngày trong quá khứ → 400', st == 400, f'got {st}')
bad = dict(base_body, tutorId='khong-ton-tai')
st, out = req('POST', '/api/bookings', bad, role='student')
check('gia sư không tồn tại → 400', st == 400, f'got {st}')
bad = dict(base_body, subjectId='subject-sai')
st, out = req('POST', '/api/bookings', bad, role='student')
check('môn gia sư không dạy → 400', st == 400, f'got {st}')
bad = dict(base_body, startTime='05:00', endTime='06:30')
st, out = req('POST', '/api/bookings', bad, role='student')
check('giờ ngoài availability → 400', st == 400, f'got {st}')
bad = dict(base_body, mode='TUTOR_TO_STUDENT')
st, out = req('POST', '/api/bookings', bad, role='student')
check('đến nhà học sinh mà thiếu địa chỉ → 400', st == 400, f'got {st}')

# ===== B. Chống double-booking =====
print('=== B. Tiền & chống trùng ===')
amount_expected = round(PRICE * 1.5)
check(f'server tự tính tiền ({PRICE} × 1.5h = {amount_expected})',
      booking_a.get('totalAmount') == amount_expected, f"got {booking_a.get('totalAmount')}")
check('status khởi đầu PENDING', booking_a.get('status') == 'PENDING')

st, out = req('POST', '/api/bookings', base_body, role='student')
check('học sinh đặt trùng giờ mình → 400', st == 400, f'got {st}: {str(out.get("error",""))[:60]}')

# Chồng lấn 30′ cuối buổi A (nằm gọn trong window → lý do lỗi chắc chắn là conflict)
ov_start = hm(to_min(A_START) + 30)
st, out = req('POST', '/api/bookings', dict(base_body, startTime=ov_start, endTime=A_END), role='student')
check('booking chồng lấn 30′ cuối → 400 chặn', st == 400, f'got {st}: {str(out.get("error",""))[:60]}')

st, out = req('POST', '/api/bookings', base_body, role='student2')
check('student 2 đặt trùng giờ gia sư → 400', st == 400, f'got {st}: {str(out.get("error",""))[:60]}')

# ===== C. Lớp định kỳ repeatWeeks =====
print('=== C. Lớp định kỳ (repeatWeeks) ===')
# Chiến lược: tìm slot S2 (khác slot A) qua POST-retry (tuần đầu phải sạch);
# blocker = 1 buổi của student1 tại S2+7 hoặc +14 → tuần giữa/kỳ của series bị skip có lý do.
# Lưu ý: các slot đã dùng (slot A) phải loại khỏi candidate.
s2_done = False
s_out = None
blocker_date = None
S2 = None
# Refetch busySlots TƯƠI (chứa booking A + leftovers các lần chạy trước)
st, td_fresh = req('GET', f'/api/tutors/{TUTOR_ID}')
fresh_busy = td_fresh.get('busySlots') or []
own_blockers = []  # blockers tạo trong section này

def slot_free(d, t1, t2):
    if d == A_DATE and t1 < to_min(A_END) and t2 > to_min(A_START):
        return False
    for b in fresh_busy + own_blockers:
        if b['date'] == d and t1 < to_min(b['endTime']) and t2 > to_min(b['startTime']):
            return False
    return True

for c in gen_cands(15, 32)[:12]:
    sb = dict(tutorId=TUTOR_ID, subjectId=SUBJ_ID, mode='ONLINE',
              date=c[0], startTime=c[1], endTime=c[2])
    # 1) Blocker TRƯỚC (student1 đặt 1 buổi ở S2+7 hoặc +14 → tuần sau của series sẽ trùng gia sư)
    blocker_date = None
    for off in (7, 14):
        bd = (date.fromisoformat(c[0]) + timedelta(days=off)).isoformat()
        if not slot_free(bd, to_min(c[1]), to_min(c[2])):
            continue
        st2, out2 = req('POST', '/api/bookings', dict(sb, date=bd), role='student')
        if st2 == 200:
            blocker_date = bd
            own_blockers.append({'date': bd, 'startTime': c[1], 'endTime': c[2]})
            break
    # 2) Series của student2 (tuần đầu = c; class-conflict còn sót → POST-retry lo)
    st, s_out = req('POST', '/api/bookings', dict(sb, repeatWeeks=3), role='student2')
    if st == 200:
        s2_done = True
        S2 = c
        break

if s2_done:
    created = s_out.get('created', 0)
    skipped = s_out.get('skipped', [])
    check(f'repeatWeeks=3 → created + skipped = 3 (slot {S2[1]}-{S2[2]} ngày {S2[0]})',
          created + len(skipped) == 3, f'created={created} skipped={len(skipped)}')
    if blocker_date:
        hit = [s for s in skipped if s['date'] == blocker_date]
        check('tuần trùng blocker bị bỏ kèm lý do "bận"',
              len(hit) == 1 and 'bận' in hit[0].get('reason', '').lower(), str(skipped))
    check('mọi tuần bị bỏ đều kèm lý do',
          all('bận' in s.get('reason', '').lower() or 'trùng' in s.get('reason', '').lower()
              for s in skipped), str(skipped))
    if created >= 2:
        check('seriesId được cấp cho >= 2 buổi', bool(s_out.get('seriesId')))
        check('seriesTotal đúng', s_out.get('seriesTotal') == created)
        check('seriesTotalAmount = đơn giá × số buổi',
              s_out.get('totalSeriesAmount') == round(PRICE * 1.5) * created,
              f"got {s_out.get('totalSeriesAmount')}")
        st, mine = req('GET', '/api/bookings?role=student', role='student2')
        s_ids = [b['id'] for b in mine['bookings'] if b.get('seriesId') == s_out.get('seriesId')]
        check('GET bookings liệt kê đủ buổi của series', len(s_ids) == created, f'got {len(s_ids)}')
        if len(s_ids) >= 2:
            st, out = req('POST', f"/api/bookings/{s_ids[0]}/cancel",
                          {'reason': 'bận việc đột xuất'}, role='student2')
            check('hủy 1 buổi trong khóa → 200', st == 200, str(out.get('error', ''))[:60])
            st, mine2 = req('GET', '/api/bookings?role=student', role='student2')
            s_rows = [b for b in mine2['bookings'] if b.get('seriesId') == s_out.get('seriesId')]
            st_map = sorted(b['status'] for b in s_rows)
            check('buổi còn lại KHÔNG bị hủy theo', 'PENDING' in st_map and 'CANCELLED' in st_map, str(st_map))
    else:
        print(f'  (chỉ tạo được {created} buổi — bỏ test hủy từng buổi)')
else:
    check('repeatWeeks từ chối có lý do khi không còn slot sạch',
          st == 400 and bool(out.get('error')), str(out.get('error', ''))[:70])
    print('  (mọi candidate đều trùng lịch đã có — hành vi server vẫn đúng, chỉ thiếu dữ liệu sạch)')

# ===== D. State machine PATCH =====
print('=== D. State machine (PATCH /api/bookings) ===')
st, out = req('PATCH', '/api/bookings', {'bookingId': A_ID, 'status': 'CANCELLED'}, role='student')
check('hủy qua PATCH bị chặn (phải qua /cancel)', st == 400, f'got {st}')
st, out = req('PATCH', '/api/bookings', {'bookingId': A_ID, 'status': 'CONFIRMED'}, role='student')
check('học sinh không được xác nhận (403)', st == 403, f'got {st}')
st, out = req('PATCH', '/api/bookings', {'bookingId': A_ID, 'status': 'COMPLETED'}, role='tutor')
check('COMPLETED trước giờ học → 400', st == 400, f'got {st}: {str(out.get("error",""))[:50]}')
st, out = req('PATCH', '/api/bookings', {'bookingId': 'id-khong-ton-tai', 'status': 'CONFIRMED'}, role='tutor')
check('booking không tồn tại → 404', st == 404, f'got {st}')
st, out = req('PATCH', '/api/bookings', {'bookingId': A_ID, 'status': 'CONFIRMED'}, role='tutor')
check('gia sư CONFIRM buổi tương lai → 200', st == 200, str(out.get('error', ''))[:50])
check('status chuyển CONFIRMED', out.get('status') == 'CONFIRMED')

# ===== E. Hủy lịch qua /cancel =====
print('=== E. Hủy lịch (/api/bookings/[id]/cancel) ===')
st, out = req('POST', f'/api/bookings/{A_ID}/cancel', {'reason': 'ng'}, role='tutor')
check('lý do < 5 ký tự → 400', st == 400, f'got {st}')
st, out = req('POST', f'/api/bookings/{A_ID}/cancel', {'reason': 'tôi không liên quan'}, role='student2')
check('người ngoài cuộc hủy → 403', st == 403, f'got {st}')
st, out = req('POST', f'/api/bookings/{A_ID}/cancel',
              {'reason': 'Gia sư bận việc gia đình đột xuất'}, role='tutor')
check('gia sư hủy kèm lý do → 200', st == 200, str(out.get('error', ''))[:60])
v = out.get('violation') or {}
check('violation được ghi (severity + points)', bool(v.get('severity')) and v.get('points', -1) >= 0, str(v))
check('CONFIRMED hủy trước 24h → có trừ điểm', v.get('points', 0) > 0, str(v))
st, out = req('POST', f'/api/bookings/{A_ID}/cancel', {'reason': 'hủy lần nữa cho chắc'}, role='tutor')
check('hủy lần 2 → 400 (đã hủy)', st == 400, f'got {st}')
st, out = req('PATCH', '/api/bookings', {'bookingId': A_ID, 'status': 'CONFIRMED'}, role='tutor')
check('PATCH lên booking đã hủy → 400', st == 400, f'got {st}')
st, viol = req('GET', '/api/users/me/violations', role='tutor')
viols = viol.get('violations', []) if isinstance(viol, dict) else []
check('lịch sử vi phạm ghi nhận lần hủy vừa rồi',
      any(v.get('date') == A_DATE and v.get('startTime') == A_START for v in viols),
      f'{len(viols)} bản ghi, không thấy buổi test')

# ===== F. COMPLETED + REVIEW trên buổi B =====
print('=== F. COMPLETED đúng giờ + REVIEW ===')
if B_ID:
    st, out = req('POST', '/api/reviews', {'bookingId': B_ID, 'rating': 5, 'comment': 'chưa xong'}, role='student')
    check('review buổi chưa COMPLETED → 400', st == 400, f'got {st}')
    st, out = req('POST', '/api/reviews', {'bookingId': B_ID, 'rating': 5}, role=b_key)
    check('gia sư tự review mình → 403', st == 403, f'got {st}')

    start_dt = datetime.strptime(f'{b_date} {b_start}', '%Y-%m-%d %H:%M')
    wait = (start_dt - datetime.utcnow()).total_seconds() + 2
    if wait > 0:
        print(f'  (chờ thêm {int(wait)}s tới giờ bắt đầu buổi B…)')
        import time
        time.sleep(min(wait, 600))
    st, out = req('PATCH', '/api/bookings', {'bookingId': B_ID, 'status': 'COMPLETED'}, role=b_key)
    check('COMPLETED sau giờ bắt đầu → 200', st == 200, str(out.get('error', ''))[:60])
    check('status chuyển COMPLETED', out.get('status') == 'COMPLETED')
    st, out = req('POST', f'/api/bookings/{B_ID}/cancel', {'reason': 'hủy sau hoàn thành'}, role='student')
    check('hủy buổi đã COMPLETED → 400', st == 400, f'got {st}')
    st, out = req('POST', '/api/reviews', {'bookingId': B_ID, 'rating': 0}, role='student')
    check('rating 0 → 400', st == 400, f'got {st}')
    st, out = req('POST', '/api/reviews', {'bookingId': B_ID, 'rating': 6}, role='student')
    check('rating 6 → 400', st == 400, f'got {st}')
    st, out = req('POST', '/api/reviews', {'bookingId': B_ID, 'rating': 5, 'comment': 'Gia sư dạy rất dễ hiểu'}, role='student')
    check('review hợp lệ → 200', st == 200, str(out.get('error', ''))[:60])
    st, out = req('POST', '/api/reviews', {'bookingId': B_ID, 'rating': 4}, role='student')
    check('review lần 2 → 400 (unique)', st == 400, f'got {st}')
else:
    print('  (bỏ qua — không có slot hôm nay)')

# ===== G. GET bookings: filter =====
print('=== G. GET /api/bookings (filter) ===')
st, mine = req('GET', '/api/bookings?role=student', role='student')
check('student lấy danh sách của mình', st == 200 and 'bookings' in mine)
st, pend = req('GET', '/api/bookings?role=student&status=PENDING', role='student')
check('filter status=PENDING hoạt động',
      st == 200 and all(b['status'] == 'PENDING' for b in pend['bookings']))

print()
print('=' * 50)
print(f'KẾT QUẢ: {ok} PASS · {fail} FAIL')
exit(1 if fail else 0)
