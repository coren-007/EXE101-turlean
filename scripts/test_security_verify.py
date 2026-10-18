#!/usr/bin/env python3
"""Kiểm chứng Bảng 2 — các phát hiện bảo mật đối với code hiện tại (branch leminh + sandbox).

Xác minh ĐỘNG qua API trên dev server :3000, từng mục:
  S1  NGUY HIỂM  — gia sư bất kỳ thêm/xóa ngày lễ toàn hệ thống, hủy buổi xuyên tenant
  S2  CAO        — race condition đặt lịch (check xung đột tách rời transaction)
  S3  CAO        — race condition sĩ số lớp nhóm (duyệt song song vượt capacity)
  S4  CAO        — leak thông điệp lỗi nội bộ (login/register e.message)
  S5  CAO        — không có rate limit (brute-force login/register)
  S6  TRUNG BÌNH — địa chỉ nhà gia sư lộ cho người xem ẩn danh
  S7  TRUNG BÌNH — dữ liệu XSS (tên gia sư chứa HTML) đi thẳng từ API sang popup bản đồ
  S8  TRUNG BÌNH — PATCH nhảy PENDING→COMPLETED; hủy 2 lần có tạo 2 bản ghi trừ điểm?

Chạy: python3 scripts/test_security_verify.py   (yêu cầu dev server đang chạy ở :3000)
Sau test chạy:  bun run scripts/sec_tools.ts cleanup
"""
import json
import subprocess
import threading
import urllib.request
import urllib.error
from datetime import date, datetime, timedelta

BASE = 'http://localhost:3000'
SESSIONS = {}
HOLIDAY_NAME = 'SEC Test Le Thu Nghiem'
TUTOR_PW = '123456'

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
    """calls: [(method, path, body, role)] — bắn đồng thời thật, trả [(status, out)]."""
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
print('KIỂM CHỨNG BẢNG 2 — PHÁT HIỆN BẢO MẬT (động, trên dev server :3000)')
print('=' * 72)

# ===== 0. Chuẩn bị =====
print('\n=== 0. Chuẩn bị: snapshot DB + tài khoản test ===')
snap = tool_json('SEC_SNAP=', 'snapshot')
assert snap and 'date' in snap, 'snapshot thất bại — không chạy tiếp để tránh bẩn DB demo'
D = snap['date']
print(f"  (ngày test lễ D={D}: {snap['scheduled']} buổi SCHEDULED của {snap['tutors']} gia sư)")

ts = datetime.now().strftime('%H%M%S')
SEC = {
    'tutorA': f'sec.tutora.{ts}@example.com',
    'stu1': f'sec.stu1.{ts}@example.com',
    'stu2': f'sec.stu2.{ts}@example.com',
    'xss': f'sec.xss.{ts}@example.com',
}
for role, email in [('tutorA', SEC['tutorA']), ('stu1', SEC['stu1']), ('stu2', SEC['stu2'])]:
    rrole = 'TUTOR' if role == 'tutorA' else 'STUDENT'
    st, out = req('POST', '/api/auth/register', {
        'name': f'SEC {role}', 'email': email, 'password': TUTOR_PW, 'role': rrole}, role=role)
    check(f'đăng ký {role} (bắt được session)', st == 200 and SESSIONS.get(role), str(out.get('error', '')))

st, out = req('POST', '/api/auth/login', {'email': 'minhanh.tutor@example.com', 'password': TUTOR_PW}, role='minhanh')
check('login gia sư demo (Minh Anh)', st == 200)
DEMO_TUTOR_ID = out.get('id', '')

# Đăng ký sớm gia sư XSS (cache suggest TTL 60s cần thời gian hết hạn)
XSS_NAME = '<img src=x onerror="window.__xss=1">'
st, out = req('POST', '/api/auth/register', {
    'name': XSS_NAME, 'email': SEC['xss'], 'password': TUTOR_PW, 'role': 'TUTOR',
    'lat': 21.0285, 'lng': 105.8542, 'district': 'Hoàn Kiếm', 'city': 'Hà Nội'}, role='xss')
check('đăng ký gia sư tên chứa HTML (không bị chặn)', st == 200 and SESSIONS.get('xss'), str(out.get('error', '')))
st, out = req('PATCH', '/api/me', {'hourlyRate': 100000}, role='xss')
st, out = req('GET', '/api/subjects')
SUBJ_ID = (out[0]['id'] if isinstance(out, list) else ((out.get('subjects') or [{}])[0].get('id', '')))
st, out = req('POST', '/api/tutors/me/subjects', {'subjectId': SUBJ_ID, 'pricePerHour': 100000}, role='xss')
check('gia sư XSS có giá + môn (đủ điều kiện hiện trên bản đồ/tìm kiếm)', st == 200, str(out.get('error', '')))
st, out = req('POST', '/api/tutors/me/subjects', {'subjectId': SUBJ_ID, 'pricePerHour': 100000}, role='tutorA')
check('gia sư tutorA có môn dạy (đủ điều kiện mở lớp cho test S3)', st == 200, str(out.get('error', '')))

# ===== S1. Holiday: gia sư bất kỳ thêm/xóa lễ toàn hệ thống =====
print('\n=== S1 [NGUY HIỂM] api/holidays — gia sư bất kỳ điều khiển lễ toàn hệ thống ===')
st, out = req('GET', '/api/holidays')
check('người lạ (chưa đăng nhập) GET holidays → 401', st == 401)
st, out = req('POST', '/api/holidays', {'date': D, 'name': HOLIDAY_NAME}, role='stu1')
check('học sinh POST holiday → 403 (bị chặn đúng)', st == 403)
st, out = req('POST', '/api/holidays', {'date': D, 'name': HOLIDAY_NAME}, role='tutorA')
cancelled = out.get('sessionsCancelled', -1) if isinstance(out, dict) else -1
check(f'gia sư thường (không phải admin) POST holiday → 200 & HỦY {cancelled} buổi', st == 200 and cancelled > 0,
      f'status={st} resp={str(out)[:150]}')
HOLIDAY_ID = (out.get('holiday') or {}).get('id', '')
hol = tool_json('SEC_HOL=', 'verify-holiday', HOLIDAY_NAME)
if hol:
    check(f"buổi bị hủy thuộc {hol['distinctTutors']} gia sư KHÁC (xuyên tenant)", hol['distinctTutors'] >= 1 and hol['cancelled'] > 0,
          json.dumps(hol, ensure_ascii=False))
    RESULT['S1_cross_tenant'] = hol
    print(f"    → gia sư bị ảnh hưởng: {', '.join(hol['tutorNames'][:6])}")
RESULT['S1_any_tutor_can_add'] = st == 200 and cancelled > 0

st, out = req('DELETE', f'/api/holidays/{HOLIDAY_ID}', role='stu1')
check('học sinh DELETE holiday → 403', st == 403)
st, out = req('DELETE', f'/api/holidays/{HOLIDAY_ID}', role='tutorA')
check('gia sư thường DELETE holiday (do người khác tạo) → 200', st == 200, str(out.get('error', '')))

# ===== S4. Leak thông điệp lỗi nội bộ =====
print('\n=== S4 [CAO] api/auth — lộ thông điệp lỗi nội bộ ===')
st, out = req('POST', '/api/auth/register', {
    'name': 'x', 'email': f'sec.bad.{ts}@example.com', 'password': '123456', 'role': 'ADMIN'})
err = str(out.get('error', ''))
leak_zod = ('invalid_enum_value' in err) or ('"received"' in err) or ('expected' in err and 'ADMIN' in err) or err.startswith('[')
check('register role=ADMIN → 400 kèm CHUẨN ZOD THÔ (lộ schema nội bộ)', st == 400 and leak_zod, f'err={err[:120]}')
print(f'    → error trả về: {err[:160]}')
RESULT['S4_register_leak'] = err[:200]
RESULT['S4_admin_role_registerable'] = False  # zod chặn ADMIN — đúng

st, body = raw_post('/api/auth/login', b'{"email": "minhanh.tutor@example.com", "password')
leak_login = ('Unexpected' in body) or ('JSON' in body) or ('error' in body and 'thất bại' not in body)
check('login body JSON sai → 500 kèm e.message của parser (SyntaxError)', st == 500 and leak_login, f'body={body[:120]}')
print(f'    → error trả về: {body[:160]}')
RESULT['S4_login_leak'] = body[:200]

# ===== S5. Không có rate limit =====
print('\n=== S5 [CAO] toàn bộ API — không có rate limit ===')
statuses = []
for wave in range(3):
    calls = [('POST', '/api/auth/login', {'email': 'minhanh.tutor@example.com', 'password': 'sai-roi'}, None)] * 10
    statuses += [s for s, _ in fire_concurrent(calls)]
n_400 = sum(1 for s in statuses if s == 400)
n_429 = sum(1 for s in statuses if s == 429)
check(f'30 lần sai mật khẩu liên tiếp: {n_400}×400, {n_429}×429 → KHÔNG bị chặn',
      n_400 == 30 and n_429 == 0)
reg_calls = [('POST', '/api/auth/register', {
    'name': 'spam', 'email': f'sec.spam.{ts}.{i}@example.com', 'password': '123', 'role': 'STUDENT'}, None)
    for i in range(20)]
rstatuses = [s for s, _ in fire_concurrent(reg_calls)]
check(f'20 lần spam register: {sum(1 for s in rstatuses if s == 400)}×400, {sum(1 for s in rstatuses if s == 429)}×429 → KHÔNG bị chặn',
      all(s == 400 for s in rstatuses))
RESULT['S5_rate_limited'] = False

# ===== S6. Địa chỉ gia sư lộ công khai =====
print('\n=== S6 [TRUNG BÌNH] api/tutors/[id] — address lộ cho người ẩn danh ===')
st, out = req('GET', f'/api/tutors/{DEMO_TUTOR_ID}')  # KHÔNG gửi cookie
has_addr = bool(out.get('address'))
phone_null = out.get('phone') is None
no_email = 'email' not in out
check('người xem ẩn danh nhận được address đầy đủ (không gate)', st == 200 and has_addr)
check('phone vẫn được gate (null) + email đã loại khỏi response', phone_null and no_email)
print(f"    → address lộ: {str(out.get('address'))[:80]}")
RESULT['S6_address_public'] = has_addr

# ===== S2. Race condition đặt lịch =====
print('\n=== S2 [CAO] api/bookings — race condition đặt lịch trùng khung giờ ===')
CAND_EMAILS = ['ductri.tutor@example.com', 'thanhtung.tutor@example.com', 'tuankiet.tutor@example.com',
               'thuha.tutor@example.com', 'minhquan.tutor@example.com', 'hoanglong.tutor@example.com',
               'minhanh.tutor@example.com', 'sarah.tutor@example.com', 'kimngan.tutor@example.com',
               'quocbao.tutor@example.com', 'maiphuong.tutor@example.com', 'thilan.tutor@example.com']
slots = []
for em in CAND_EMAILS:
    key = 'tb_' + em.split('.')[0]
    st, lo = req('POST', '/api/auth/login', {'email': em, 'password': TUTOR_PW}, role=key)
    if st != 200:
        continue
    tid = lo.get('id', '')
    st, td = req('GET', f'/api/tutors/{tid}')
    if st != 200 or not td.get('teachesOnline') or not td.get('subjects'):
        continue
    subj = td['subjects'][0]
    busy = td.get('busySlots') or []
    for off in range(1, 9):
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
                        break
                break
        if len(slots) >= 15:
            break
    if len(slots) >= 15:
        break
print(f'  (tìm được {len(slots)} slot trống của các gia sư demo)')

race_reproduced = False
attempts = []
for i, (key, tid, sid, d, st_, et) in enumerate(slots[:10]):
    body = {'tutorId': tid, 'subjectId': sid, 'mode': 'ONLINE', 'date': d, 'startTime': st_, 'endTime': et}
    (s1, o1), (s2, o2) = fire_concurrent([
        ('POST', '/api/bookings', body, 'stu1'),
        ('POST', '/api/bookings', body, 'stu2'),
    ])
    attempts.append((s1, s2))
    if s1 == 200 and s2 == 200:
        race_reproduced = True
        print(f'  ⚠ Lần thử {i + 1}: HAI REQUEST CÙNG 200 → trùng lịch THẬT trên cùng khung giờ!')
        break
    if s1 == 200 or s2 == 200:
        print(f'  · Lần thử {i + 1}: ({s1},{s2}) — một bên thắng, một bên bị chặn (chưa giao cắt)')
if race_reproduced:
    check('race condition: 2 booking cùng khung giờ ĐỀU thành công', True)
else:
    check('race condition: không tái hiện được trong 10 lần thử (cửa sổ giao cắt hẹp)', False,
          f'kết quả các lần: {attempts[:6]}')
RESULT['S2_race_reproduced'] = race_reproduced
RESULT['S2_attempts'] = attempts

# ===== S3. Race condition sĩ số lớp nhóm =====
print('\n=== S3 [CAO] api/classes/[id]/enrollments — race condition sĩ số ===')
class_verified = None
for round_i in range(1, 4):
    st, out = req('POST', '/api/classes', {
        'title': f'SEC Race Test Lop {round_i}', 'subjectId': SUBJ_ID, 'capacity': 1,
        'meetingType': 'ONLINE', 'monthlyFee': 500000,
        'schedule': [{'dayOfWeek': dow_sys(today + timedelta(days=3)), 'startTime': '19:00', 'endTime': '20:00'}],
    }, role='tutorA')
    if st not in (200, 201):
        print(f'  (tạo lớp vòng {round_i} lỗi: {str(out.get("error", ""))[:100]})')
        continue
    class_id = out.get('id')
    eids = []
    for r in ['stu1', 'stu2']:
        st, out = req('POST', f'/api/classes/{class_id}/enroll', {'studentName': f'SEC {r}'}, role=r)
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
    if vc and vc['approved'] > vc['capacity']:
        class_verified = vc
        break
if class_verified:
    check(f"race sĩ số: APPROVED={class_verified['approved']} > CAPACITY={class_verified['capacity']} (vượt sĩ số thật)",
          True)
else:
    check('race sĩ số: không tái hiện trong 3 vòng (cửa sổ giao cắt hẹp)', False)
RESULT['S3_race_reproduced'] = bool(class_verified)
RESULT['S3_detail'] = class_verified

# ===== S7. XSS — dữ liệu HTML đi thẳng sang popup bản đồ =====
print('\n=== S7 [TRUNG BÌNH] tutor-map.tsx — vector XSS qua tên gia sư ===')
xss_tutor_id = None
raw_name_seen = False
# suggest có cache 60s — poll tới khi tutor XSS xuất hiện (tối đa ~100s)
for attempt in range(11):
    st, out = req('GET', '/api/search/suggest?q=img%20src')
    tutors = out.get('tutors') or []
    hit = next((t for t in tutors if 'sec.xss' in (t.get('id') or '') or XSS_NAME in (t.get('name') or '')), None)
    if not hit:
        # fallback: dò theo tên trả về chứa '<img'
        hit = next((t for t in tutors if '<img' in (t.get('name') or '')), None)
    if hit:
        xss_tutor_id = hit.get('id')
        raw_name_seen = '<img' in hit.get('name', '')
        break
    if attempt < 10:
        import time
        time.sleep(10)
check('API search trả về TÊN CHỨA HTML NGUYÊN VẸN (không escape phía server)', raw_name_seen,
      f'(poll {attempt + 1} lần)')
if raw_name_seen:
    print(f'    → name trong JSON: {XSS_NAME}')
# Đối chiếu thêm qua /api/tutors (nguồn dữ liệu của bản đồ)
if xss_tutor_id:
    st, out = req('GET', f'/api/tutors/{xss_tutor_id}')
    raw2 = '<img' in (out.get('name') or '')
    check('API hồ sơ /api/tutors/[id] cũng trả tên HTML nguyên vẹn (nguồn cấp cho popup bản đồ)', raw2)
RESULT['S7_raw_html_in_api'] = raw_name_seen

# ===== S8. PATCH PENDING→COMPLETED + hủy 2 lần =====
print('\n=== S8 [TRUNG BÌNH] api/bookings — PATCH nhảy trạng thái & hủy 2 lần ===')
# B1: đặt slot tương lai rồi "đưa về quá khứ" (mô phỏng thời gian trôi) rồi PATCH COMPLETED
b1_done = False
for (key, tid, sid, d, st_, et) in slots:
    st, out = req('POST', '/api/bookings', {
        'tutorId': tid, 'subjectId': sid, 'mode': 'ONLINE', 'date': d, 'startTime': st_, 'endTime': et}, role='stu1')
    if st != 200:
        continue
    b1 = out.get('id')
    tool('shift', b1)
    st, out = req('PATCH', '/api/bookings', {'bookingId': b1, 'status': 'COMPLETED'}, role=key)
    b1_done = st == 200 and out.get('status') == 'COMPLETED'
    if b1_done:
        print(f'  ⚠ PATCH chuyển thẳng PENDING → COMPLETED (booking chưa từng CONFIRM): {b1}')
    check('PATCH cho phép nhảy PENDING → COMPLETED (sau giờ bắt đầu)', b1_done,
          f'status={st} resp={str(out)[:120]}')
    break
if not b1_done:
    check('PATCH PENDING → COMPLETED (không tái hiện được — không slot hợp lệ)', False)

# B2: hủy tuần tự 2 lần
b2 = None
for (key, tid, sid, d, st_, et) in slots:
    st, out = req('POST', '/api/bookings', {
        'tutorId': tid, 'subjectId': sid, 'mode': 'ONLINE', 'date': d, 'startTime': st_, 'endTime': et}, role='stu1')
    if st == 200:
        b2 = (out.get('id'), key)
        break
if b2:
    st1, o1 = req('POST', f"/api/bookings/{b2[0]}/cancel", {'reason': 'SEC test thu ly do lan mot'}, role='stu1')
    st2, o2 = req('POST', f"/api/bookings/{b2[0]}/cancel", {'reason': 'SEC test thu ly do lan hai'}, role='stu1')
    check('hủy lần 1 → 200 (ghi 1 vi phạm)', st1 == 200)
    check('hủy lần 2 → 400 "Lịch này đã bị hủy trước đó" (KHÔNG trừ điểm lần 2)', st2 == 400,
          f'status={st2} resp={str(o2)[:120]}')
    cx = tool_json('SEC_CXL=', 'countcxl', b2[0])
    check(f"số bản ghi Cancellation sau 2 lần hủy = {cx['cancellations']} (mong đợi 1)", cx and cx['cancellations'] == 1)
    RESULT['S8_double_cancel_records'] = cx['cancellations'] if cx else None
else:
    check('hủy 2 lần (không dựng được booking)', False)

# B3: hủy đồng thời 2 request (race)
b3 = None
for (key, tid, sid, d, st_, et) in slots:
    st, out = req('POST', '/api/bookings', {
        'tutorId': tid, 'subjectId': sid, 'mode': 'ONLINE', 'date': d, 'startTime': st_, 'endTime': et}, role='stu1')
    if st == 200:
        b3 = (out.get('id'), key)
        break
if b3:
    (c1, _), (c2, _) = fire_concurrent([
        ('POST', f"/api/bookings/{b3[0]}/cancel", {'reason': 'SEC test race cancel A'}, 'stu1'),
        ('POST', f"/api/bookings/{b3[0]}/cancel", {'reason': 'SEC test race cancel B'}, 'stu1'),
    ])
    cx = tool_json('SEC_CXL=', 'countcxl', b3[0])
    n = cx['cancellations'] if cx else -1
    check(f'hủy đồng thời 2 request → statuses ({c1},{c2}), số bản ghi = {n} (ràng buộc unique bookingId chặn)',
          n == 1, f'statuses=({c1},{c2})')
    RESULT['S8_concurrent_cancel_records'] = n
else:
    check('hủy đồng thời (không dựng được booking)', False)

# ===== Tổng kết =====
print('\n' + '=' * 72)
print(f'KẾT QUẢ: {ok} ✓ / {fail} ✗')
print('=' * 72)
RESULT['passed'], RESULT['failed'] = ok, fail
with open('scripts/logs/sec_result.json', 'w') as f:
    json.dump(RESULT, f, ensure_ascii=False, indent=2)
print('\n→ Dọn dẹp DB demo:  bun run scripts/sec_tools.ts cleanup')
