#!/usr/bin/env python3
"""Kiểm chứng HẬU-SỬA — Bảng 2 bảo mật: từng phát hiện đã được fix đúng chưa?

Chạy SAU khi đã áp dụng các fix (SẬ-*). Mỗi mục assert hành vi MỚI (đảo chiều
so với test_security_verify.py cũ — cũ assert lỗ hổng TỒN TẠI, script này assert
lỗ hổng ĐÃ ĐÓNG):
  F1  NGUY HIỂM  — holidays: TUTOR/STUDENT bị 403, ADMIN được thêm/xóa
  F2  CAO        — booking race: 2 request đồng thời → chỉ 1 thắng (200+400)
  F3  CAO        — sĩ số lớp: 2 duyệt đồng thời capacity=1 → approved không vượt
  F4  CAO        — auth: lỗi nội bộ trả thông điệp chung, không lộ e.message/zod thô
  F5  CAO        — rate limit: dò mật khẩu >10 lần → 429; suggest spam → 429
  F6  TB         — tutors/[id]: address ẩn với người ẩn danh, hiện với booking hoạt động
  F8  TB         — PATCH ép PENDING→CONFIRMED→COMPLETED; hủy 2 lần (tuần tự+đồng thời) = 1 bản ghi;
                   booking CANCELLED → phone/address ẩn trong GET /api/bookings

Chạy: python3 scripts/test_security_after_fix.py  (dev server :3000)
Cuối script tự cleanup DB demo qua scripts/sec_tools.ts cleanup.
"""
import json
import subprocess
import threading
import time
import urllib.request
import urllib.error
from datetime import date, datetime, timedelta

BASE = 'http://localhost:3000'
SESSIONS = {}
HOLIDAY_NAME = 'SEC Fix Le Thu Nghiem'
PW = '123456'

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

def raw_post(path, raw: bytes):
    r = urllib.request.Request(BASE + path, method='POST', data=raw)
    r.add_header('Content-Type', 'application/json')
    try:
        resp = urllib.request.urlopen(r)
        return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

ok, fail = 0, 0
def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'  ✓ {name}')
    else:
        fail += 1
        print(f'  ✗ {name} {extra}')

def fire_concurrent(calls):
    n = len(calls)
    barrier = threading.Barrier(n)
    results = [None] * n
    def worker(i):
        m, p, b, r = calls[i]
        barrier.wait()
        results[i] = req(m, p, b, r)
    ts = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in ts: t.start()
    for t in ts: t.join()
    return results

def tool(*args):
    r = subprocess.run(['bun', 'run', 'scripts/sec_tools.ts', *args],
                       capture_output=True, text=True, cwd='/home/z/my-project', timeout=120)
    return r.stdout.strip()

def tool_json(marker, *args):
    out = tool(*args)
    for line in out.splitlines():
        if line.startswith(marker):
            return json.loads(line[len(marker):])
    return None

def to_min(t):
    h, m = t.split(':')
    return int(h) * 60 + int(m)

def hm(m):
    return f'{m // 60:02d}:{m % 60:02d}'

today = date.today()
def dow_sys(d):
    return (d.weekday() + 1) % 7  # Python Mon=0 → hệ thống T2=1, CN=0

RESULT = {}

print('=' * 72)
print('KIỂM CHỨNG HẬU-SỬA — CÁC FIX BẢO MẬT (Bảng 2) TRÊN DEV SERVER :3000')
print('=' * 72)

# ===== 0. Chuẩn bị =====
print('\n=== 0. Chuẩn bị: snapshot DB + tài khoản test ===')
snap = tool_json('SEC_SNAP=', 'snapshot')
assert snap and 'date' in snap, 'snapshot thất bại — không chạy tiếp để tránh bẩn DB demo'
D = snap['date']
print(f"  (ngày test lễ D={D}: {snap['scheduled']} buổi SCHEDULED của {snap['tutors']} gia sư)")

ts = datetime.now().strftime('%H%M%S')
SEC = {
    'tutorA': f'secfix.tutora.{ts}@example.com',
    'stu1': f'secfix.stu1.{ts}@example.com',
    'stu2': f'secfix.stu2.{ts}@example.com',
}
for role, email in [('tutorA', SEC['tutorA']), ('stu1', SEC['stu1']), ('stu2', SEC['stu2'])]:
    rrole = 'TUTOR' if role == 'tutorA' else 'STUDENT'
    st, out = req('POST', '/api/auth/register', {
        'name': f'SECFIX {role}', 'email': email, 'password': PW, 'role': rrole}, role=role)
    check(f'đăng ký {role}', st == 200 and SESSIONS.get(role), str(out.get('error', '')))

st, out = req('POST', '/api/auth/login', {'email': 'minhanh.tutor@example.com', 'password': PW}, role='minhanh')
check('login gia sư demo (Minh Anh)', st == 200)
DEMO_TUTOR_ID = out.get('id', '')

st, out = req('POST', '/api/auth/login', {'email': 'hoa.parent@example.com', 'password': PW}, role='hoa')
check('login phụ huynh demo (Hoa)', st == 200)

st, out = req('POST', '/api/auth/login', {'email': 'admin@turlean.vn', 'password': PW}, role='admin')
check('login admin (admin@turlean.vn)', st == 200 and out.get('role') == 'ADMIN', str(out.get('error', ''))[:100])

st, out = req('GET', '/api/subjects')
SUBJ_ID = (out[0]['id'] if isinstance(out, list) else ((out.get('subjects') or [{}])[0]).get('id', ''))
st, out = req('POST', '/api/tutors/me/subjects', {'subjectId': SUBJ_ID, 'pricePerHour': 100000}, role='tutorA')
check('tutorA có môn dạy (đủ điều kiện mở lớp)', st == 200, str(out.get('error', '')))

# ===== F1. Holidays: chỉ ADMIN =====
print('\n=== F1 [NGUY HIỂM] api/holidays — giờ chỉ ADMIN được thêm/xóa lễ ===')
st, out = req('GET', '/api/holidays')
check('người lạ GET holidays → 401', st == 401)
st, out = req('GET', '/api/holidays', role='tutorA')
check('gia sư GET holidays → 200 (xem read-only để lập lịch)', st == 200)

st, out = req('POST', '/api/holidays', {'date': D, 'name': HOLIDAY_NAME}, role='stu1')
check('học sinh POST holiday → 403', st == 403, f'status={st}')
st, out = req('POST', '/api/holidays', {'date': D, 'name': HOLIDAY_NAME}, role='minhanh')
check('GIA SƯ POST holiday → 403 (đã chặn — trước đây 200 + hủy buổi xuyên tenant!)', st == 403,
      f'status={st} resp={str(out)[:120]}')
hol = tool_json('SEC_HOL=', 'verify-holiday', HOLIDAY_NAME)
check('sau 403: KHÔNG buổi nào bị hủy (lỗ hổng cũ đã đóng)', (hol or {}).get('cancelled', -1) == 0,
      json.dumps(hol or {}, ensure_ascii=False))

st, out = req('POST', '/api/holidays', {'date': D, 'name': HOLIDAY_NAME}, role='admin')
cancelled = out.get('sessionsCancelled', -1) if isinstance(out, dict) else -1
check(f'ADMIN POST holiday → 200 & hủy {cancelled} buổi (quyền đúng vai trò)', st == 200 and cancelled > 0,
      f'status={st} resp={str(out)[:150]}')
HOLIDAY_ID = (out.get('holiday') or {}).get('id', '')

st, out = req('DELETE', f'/api/holidays/{HOLIDAY_ID}', role='minhanh')
check('GIA SƯ DELETE holiday (do admin tạo) → 403', st == 403, f'status={st}')
st, out = req('DELETE', f'/api/holidays/{HOLIDAY_ID}', role='admin')
check('ADMIN DELETE holiday → 200', st == 200, str(out.get('error', '')))
RESULT['F1_admin_only'] = True

# ===== F4. Auth không lộ e.message =====
print('\n=== F4 [CAO] api/auth — không lộ thông điệp lỗi nội bộ ===')
st, out = req('POST', '/api/auth/register', {
    'name': 'x', 'email': f'secfix.bad.{ts}@example.com', 'password': '123456', 'role': 'ADMIN'})
err = str(out.get('error', ''))
leak_zod = ('invalid_enum_value' in err) or ('"received"' in err) or ('expected' in err) or err.startswith('[')
check('register role=ADMIN → 400 + THÔNG ĐIỆP TIẾNG VIỆT (không lộ zod thô)', st == 400 and not leak_zod,
      f'err={err[:120]}')
check('register role=ADMIN vẫn bị chặn (ADMIN không tự đăng ký được)', st == 400)
RESULT['F4_register_error'] = err[:200]

st, body = raw_post('/api/auth/login', b'{"email": "minhanh.tutor@example.com", "password')
leak_login = ('Unexpected' in body) or ('JSON' in body) or ('position' in body) or ('SyntaxError' in body)
generic = 'Đăng nhập thất bại' in body
check('login body JSON sai → 500 với THÔNG ĐIỆP CHUNG (không lộ e.message parser)',
      st == 500 and generic and not leak_login, f'body={body[:150]}')
RESULT['F4_login_error'] = body[:200]

# ===== F6. Địa chỉ gia sư =====
print('\n=== F6 [TRUNG BÌNH] api/tutors/[id] — address được gate ===')
st, out = req('GET', f'/api/tutors/{DEMO_TUTOR_ID}')  # KHÔNG cookie — ẩn danh
check('người ẩn danh: address = null (đã gate như phone)', st == 200 and out.get('address') is None,
      f'address={str(out.get("address"))[:60]}')
check('người ẩn danh: phone null + email vắng + district/city/lat/lng vẫn có (bản đồ hoạt động)',
      out.get('phone') is None and 'email' not in out and out.get('district') and out.get('lat') is not None)

st, out = req('GET', f'/api/tutors/{DEMO_TUTOR_ID}', role='minhanh')
check('chính gia sư xem hồ sơ mình: address có đầy đủ', st == 200 and bool(out.get('address')))

# hoa.parent có booking hoạt động với gia sư nào đó — dùng chính tutor đó làm positive control
st, out = req('GET', '/api/bookings?role=student', role='hoa')
active = next((b for b in out.get('bookings', []) if b.get('status') in ('PENDING', 'CONFIRMED', 'COMPLETED')), None)
if active:
    T_ID = active['tutor']['id']
    st, out = req('GET', f'/api/tutors/{T_ID}', role='hoa')
    check('học sinh có booking hoạt động: address + phone HIỆN (luồng liên hệ không vỡ)',
          st == 200 and bool(out.get('address')) and bool(out.get('phone')),
          f'address={str(out.get("address"))[:50]} phone={out.get("phone")}')
    RESULT['F6_positive_control'] = True
else:
    check('học sinh có booking hoạt động: address + phone HIỆN (luồng liên hệ không vỡ)', False, 'không tìm booking hoạt động của hoa')

# ===== F2. Race condition đặt lịch =====
print('\n=== F2 [CAO] api/bookings — race đã đóng: 2 request đồng thời chỉ 1 thắng ===')
# Sanity: bảo đảm session stu1/stu2 còn sống (đăng ký có thể bị rate limit cuỗm cookie)
for _role, _email in (('stu1', SEC['stu1']), ('stu2', SEC['stu2'])):
    st, out = req('GET', '/api/me', role=_role)
    if st != 200 or not out.get('user'):
        print(f'  (session {_role} mất — đăng nhập lại)')
        req('POST', '/api/auth/login', {'email': _email, 'password': PW}, role=_role)
        st, out = req('GET', '/api/me', role=_role)
        check(f'session {_role} sống trước khi test race', st == 200 and out.get('user'))

CAND_EMAILS = ['kimngan.tutor@example.com', 'quanghuy.tutor@example.com', 'sarah.tutor@example.com',
               'minhanh.tutor@example.com', 'hoanglong.tutor@example.com']
slots = []
for em in CAND_EMAILS:
    key = 'tb_' + em.split('.')[0]
    st, lo = req('POST', '/api/auth/login', {'email': em, 'password': PW}, role=key)
    if st != 200:
        continue
    tid = lo.get('id', '')
    st, td = req('GET', f'/api/tutors/{tid}')
    if st != 200 or not td.get('teachesOnline') or not td.get('subjects'):
        continue
    subj = td['subjects'][0]
    busy = td.get('busySlots') or []
    found = 0
    # 1 slot MỖI NGÀY (không chồng lấn nhau) × tối đa 4 ngày/tutor → đủ dự phòng
    # cho F2 (3 round) + F8a + F8b + F8c.
    for off in range(1, 9):
        if found >= 4:
            break
        d = (today + timedelta(days=off)).isoformat()
        for a in td['availabilities']:
            if a['dayOfWeek'] != dow_sys(date.fromisoformat(d)):
                continue
            s, e = to_min(a['startTime']), to_min(a['endTime'])
            for start in range(s, e - 30, 30):
                for dur in (60, 90, 45, 30):
                    if start + dur > e:
                        continue
                    clash = any(b['date'] == d and start < to_min(b['endTime']) and start + dur > to_min(b['startTime'])
                                for b in busy)
                    if not clash:
                        slots.append((key, tid, subj['id'], d, hm(start), hm(start + dur)))
                        found += 1
                        break
                break  # 1 slot mỗi khung availability
            if found >= 4:
                break
    if len(slots) >= 16:
        break
print(f'  (tìm được {len(slots)} slot trống của các gia sư demo)')

race_wins = 0
race_both = 0
attempts = []
for i, (key, tid, sid, d, st_, et) in enumerate(slots[:6]):
    body = {'tutorId': tid, 'subjectId': sid, 'mode': 'ONLINE', 'date': d, 'startTime': st_, 'endTime': et}
    (s1, _o1), (s2, _o2) = fire_concurrent([
        ('POST', '/api/bookings', body, 'stu1'),
        ('POST', '/api/bookings', body, 'stu2'),
    ])
    codes = sorted([s1, s2])
    if codes == [200, 400]:
        race_wins += 1
        attempts.append((s1, s2))
        print(f'  · Vòng {i + 1}: ({s1},{s2}) — đúng 1 thắng + 1 bị chặn')
    elif s1 == 200 and s2 == 200:
        race_both += 1
        attempts.append((s1, s2))
        print(f'  ⚠ Vòng {i + 1}: CẢ HAI 200 → race vẫn tái hiện!')
    else:
        # (400,400): slot đó trùng lịch lớp/điều kiện khác cho cả 2 — không tính round
        attempts.append((s1, s2, 'skip'))
        print(f'  · Vòng {i + 1}: ({s1},{s2}) — slot không đặt được cho cả 2 (bỏ qua vòng)')
    if race_wins >= 3:
        break
check(f'race booking: {race_wins} vòng chỉ 1 request thắng (200+400), 0 vòng đôi 200',
      race_wins >= 2 and race_both == 0, f'kết quả: {attempts}')
RESULT['F2_rounds'] = attempts
RESULT['F2_fixed'] = race_both == 0

# ===== F3. Race condition sĩ số =====
print('\n=== F3 [CAO] api/classes enrollments — đếm-đổi trong transaction ===')
class_verified = None
for round_i in range(1, 4):
    # mỗi vòng dùng khung giờ KHÁC NHAU để không trùng lớp của vòng trước cùng gia sư
    hr = 19 + (round_i - 1)
    st, out = req('POST', '/api/classes', {
        'title': f'SEC Fix Race Lop {round_i}', 'subjectId': SUBJ_ID, 'capacity': 1,
        'meetingType': 'ONLINE', 'monthlyFee': 500000,
        'schedule': [{'dayOfWeek': dow_sys(today + timedelta(days=3)), 'startTime': f'{hr}:00', 'endTime': f'{hr + 1}:00'}],
    }, role='tutorA')
    if st not in (200, 201):
        print(f'  (tạo lớp vòng {round_i} lỗi: {str(out.get("error", ""))[:100]})')
        continue
    class_id = out.get('id')
    eids = []
    for r in ['stu1', 'stu2']:
        # force=True: bỏ qua cảnh báo trùng lịch 1-1 (stu1/stu2 có booking từ F2)
        st, out = req('POST', f'/api/classes/{class_id}/enroll',
                      {'studentName': f'SECFIX {r}', 'force': True}, role=r)
        if st == 200:
            eids.append((out.get('enrollment') or {}).get('id'))
    if len(eids) != 2:
        print(f'  (vòng {round_i}: enroll không đủ 2 — {eids})')
        continue
    (a1, _o1), (a2, _o2) = fire_concurrent([
        ('PATCH', f'/api/classes/{class_id}/enrollments/{eids[0]}', {'status': 'APPROVED'}, 'tutorA'),
        ('PATCH', f'/api/classes/{class_id}/enrollments/{eids[1]}', {'status': 'APPROVED'}, 'tutorA'),
    ])
    vc = tool_json('SEC_CLASS=', 'verify-class', class_id)
    print(f'  · Vòng {round_i}: 2 PATCH approve đồng thời → ({a1},{a2}); DB: {vc}')
    if vc and vc['approved'] <= vc['capacity']:
        class_verified = vc
        if sorted([a1, a2]) == [200, 400]:
            break
if class_verified:
    check(f"race sĩ số: APPROVED={class_verified['approved']} ≤ CAPACITY={class_verified['capacity']} (không vượt)",
          True)
else:
    check('race sĩ số: approved ≤ capacity', False, '3 vòng đều lỗi hoặc không kiểm chứng được')
RESULT['F3_detail'] = class_verified
RESULT['F3_fixed'] = bool(class_verified)

# ===== F8. PATCH máy trạng thái + hủy idempotent + ẩn SĐT booking hủy =====
print('\n=== F8 [TRUNG BÌNH] api/bookings — máy trạng thái & idempotency & gate SĐT ===')
# 8a. Ép transition: PENDING → COMPLETED bị chặn; PENDING → CONFIRMED → COMPLETED OK
did_transition = False
for (key, tid, sid, d, st_, et) in slots[3:] or slots:
    st, out = req('POST', '/api/bookings', {
        'tutorId': tid, 'subjectId': sid, 'mode': 'ONLINE', 'date': d, 'startTime': st_, 'endTime': et}, role='stu1')
    if st != 200:
        continue
    bA = out.get('id')
    # (1) booking còn TƯƠNG LAI: nhảy thẳng PENDING → COMPLETED bị chặn (chưa CONFIRMED)
    st, out = req('PATCH', '/api/bookings', {'bookingId': bA, 'status': 'COMPLETED'}, role=key)
    check('PATCH PENDING → COMPLETED trực tiếp → 400 (đã ép đúng máy trạng thái)',
          st == 400 and 'xác nhận' in str(out.get('error', '')), f'status={st} resp={str(out)[:120]}')
    # (2) PENDING → CONFIRMED khi còn tương lai → hợp lệ
    st, out = req('PATCH', '/api/bookings', {'bookingId': bA, 'status': 'CONFIRMED'}, role=key)
    ok_confirm = st == 200 and out.get('status') == 'CONFIRMED'
    check('PATCH PENDING → CONFIRMED (còn tương lai — đường đi hợp lệ) → 200', ok_confirm,
          f'status={st} resp={str(out)[:120]}')
    # (3) đưa về quá khứ (mô phỏng thời gian trôi) → CONFIRMED → COMPLETED hợp lệ
    tool('shift', bA)
    st, out = req('PATCH', '/api/bookings', {'bookingId': bA, 'status': 'COMPLETED'}, role=key)
    check('PATCH CONFIRMED → COMPLETED (sau giờ học) → 200', st == 200 and out.get('status') == 'COMPLETED',
          f'status={st} resp={str(out)[:100]}')
    did_transition = ok_confirm and st == 200
    break
if not did_transition and not slots:
    check('PATCH máy trạng thái (không dựng được booking)', False)

# 8b. Hủy tuần tự 2 lần → 1 bản ghi
bB = None
for (key, tid, sid, d, st_, et) in slots:
    st, out = req('POST', '/api/bookings', {
        'tutorId': tid, 'subjectId': sid, 'mode': 'ONLINE', 'date': d, 'startTime': st_, 'endTime': et}, role='stu1')
    if st == 200:
        bB = (out.get('id'), key)
        break
if bB:
    st1, o1 = req('POST', f"/api/bookings/{bB[0]}/cancel", {'reason': 'SECFIX test huy lan mot'}, role='stu1')
    check('hủy lần 1 → 200', st1 == 200)
    st2, o2 = req('POST', f"/api/bookings/{bB[0]}/cancel", {'reason': 'SECFIX test huy lan hai'}, role='stu1')
    check('hủy lần 2 → 400 (không trừ điểm lần 2)', st2 == 400, f'status={st2} resp={str(o2)[:120]}')
    cx = tool_json('SEC_CXL=', 'countcxl', bB[0])
    check(f"số bản ghi Cancellation sau 2 lần hủy = {cx['cancellations']} (mong đợi 1)",
          cx and cx['cancellations'] == 1)
    RESULT['F8_seq_cancel_records'] = cx['cancellations'] if cx else None

    # 8c. GET bookings: booking CANCELLED → phone/address ẩn
    st, out = req('GET', '/api/bookings?role=student', role='stu1')
    cancelled_b = next((b for b in out.get('bookings', []) if b.get('status') == 'CANCELLED'), None)
    active_b = next((b for b in out.get('bookings', []) if b.get('status') in ('PENDING', 'CONFIRMED', 'COMPLETED')), None)
    if cancelled_b:
        check('GET bookings: booking CANCELLED → tutor.phone/address = null (đã ẩn)',
              cancelled_b['tutor'].get('phone') is None and cancelled_b['tutor'].get('address') is None,
              f"phone={cancelled_b['tutor'].get('phone')}")
    else:
        check('GET bookings: booking CANCELLED → tutor.phone/address = null', False, 'không tìm booking CANCELLED')
    if active_b:
        check('GET bookings: booking còn hiệu lực → tutor.phone vẫn hiện (luồng liên hệ giữ nguyên)',
              bool(active_b['tutor'].get('phone')))
    else:
        check('GET bookings: booking còn hiệu lực → tutor.phone vẫn hiện', False, 'không tìm booking hoạt động')
else:
    check('hủy 2 lần (không dựng được booking)', False)

# 8d. Hủy đồng thời 2 request → 1 bản ghi
bC = None
for (key, tid, sid, d, st_, et) in slots:
    st, out = req('POST', '/api/bookings', {
        'tutorId': tid, 'subjectId': sid, 'mode': 'ONLINE', 'date': d, 'startTime': st_, 'endTime': et}, role='stu1')
    if st == 200:
        bC = (out.get('id'), key)
        break
if bC:
    (c1, _), (c2, _) = fire_concurrent([
        ('POST', f"/api/bookings/{bC[0]}/cancel", {'reason': 'SECFIX test race cancel A'}, 'stu1'),
        ('POST', f"/api/bookings/{bC[0]}/cancel", {'reason': 'SECFIX test race cancel B'}, 'stu1'),
    ])
    cx = tool_json('SEC_CXL=', 'countcxl', bC[0])
    n = cx['cancellations'] if cx else -1
    check(f'hủy đồng thời 2 request → statuses ({c1},{c2}), số bản ghi = {n} (mong đợi 1)',
          n == 1 and sorted([c1, c2]) == [200, 400], f'statuses=({c1},{c2}) n={n}')
    RESULT['F8_concurrent_cancel_records'] = n
else:
    check('hủy đồng thời (không dựng được booking)', False)

# ===== F5. Rate limit (chạy CUỐI để không ảnh hưởng các test trên) =====
print('\n=== F5 [CAO] rate limit — dò mật khẩu & spam bị chặn ===')
brute_email = f'secfix.brute.{ts}@example.com'
codes = []
for i in range(13):
    st, _ = req('POST', '/api/auth/login', {'email': brute_email, 'password': 'sai-mat-khau'})
    codes.append(st)
n_400 = sum(1 for c in codes if c == 400)
n_429 = sum(1 for c in codes if c == 429)
check(f'13 lần sai mật khẩu liên tiếp: {n_400}×400, {n_429}×429 → bị chặn từ lần thứ 11',
      n_429 >= 1 and codes[:10].count(400) >= 9, f'codes={codes}')
RESULT['F5_login_codes'] = codes

reg_codes = []
for i in range(25):
    st, _ = req('POST', '/api/auth/register', {
        'name': 'spam', 'email': f'secfix.spam.{ts}.{i}@example.com', 'password': '123456', 'role': 'STUDENT'})
    reg_codes.append(st)
n_reg_429 = sum(1 for c in reg_codes if c == 429)
check(f'25 lần spam register: {n_reg_429}×429 → bị chặn khi vượt ngưỡng IP (20/giờ)',
      n_reg_429 >= 1, f'codes={reg_codes}')
RESULT['F5_register_429'] = n_reg_429

sug_codes = []
for i in range(65):
    st, _ = req('GET', '/api/search/suggest?q=toan')
    sug_codes.append(st)
n_sug_429 = sum(1 for c in sug_codes if c == 429)
check(f'65 lần suggest liên tiếp: {n_sug_429}×429 → autocomplete public được giới hạn',
      n_sug_429 >= 1)
RESULT['F5_suggest_429'] = n_sug_429

# ===== Tổng kết + dọn dẹp =====
print('\n' + '=' * 72)
print(f'KẾT QUẢ HẬU-SỬA: {ok} ✓ / {fail} ✗')
print('=' * 72)
RESULT['passed'], RESULT['failed'] = ok, fail
with open('scripts/logs/sec_after_fix_result.json', 'w') as f:
    json.dump(RESULT, f, ensure_ascii=False, indent=2)

print('\n→ Dọn dẹp DB demo...')
print(tool('cleanup'))
