#!/usr/bin/env python3
"""Test fix BẤT NHẤT repeatWeeks — /api/bookings POST:

Trước fix: tuần ĐẦU của chuỗi trùng lịch → hard-fail 400 cả request,
           trong khi tuần 2+ trùng → bỏ qua êm thấm kèm lý do.
Sau fix : MỌI tuần (kể cả tuần đầu) trùng lịch → bỏ qua + lý do, khóa học
           vẫn đặt được từ tuần kế còn trống; chỉ 400 khi không còn tuần nào
           hợp lệ (kèm lý do cụ thể của tuần đầu).

Các section:
  A. Tuần đầu trùng GIA SƯ (blocker booking) → series đặt được từ tuần 2 (fix cốt lõi)
  B. Đơn lẻ trùng → 400 lý do cụ thể (hồi quy hành vi cũ)
  C. Mọi tuần trùng → 400 ưu tiên lý do tuần ĐẦU
  D. Tuần đầu trùng do HỌC SINH (booking của chính mình) → bỏ qua, tạo từ tuần 2
  E. Tuần đầu trùng LỚP CỐ ĐỊNH → 400 kèm tên lớp + khung giờ
  F. Hồi quy: chuỗi sạch → full created, skipped rỗng, buổi đầu = ngày yêu cầu
  G. Dọn dẹp booking test

Idempotent: student throwaway mỗi lần chạy + hủy hết booking khi kết thúc.
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


def add_days(iso, days):
    return (date.fromisoformat(iso) + timedelta(days=days)).isoformat()


def fmt_vi(iso):
    y, m, d = iso.split('-')
    return f'{d}/{m}/{y}'


def dow_sys(d_iso):
    return (date.fromisoformat(d_iso).weekday() + 1) % 7  # Python Mon=0 → hệ thống CN=0


today = date.today()
DUR = 90  # phút
DUR_H = 1.5

# ===== 0. Setup =====
print('=== 0. Chuẩn bị ===')
st, out = req('POST', '/api/auth/login', {'email': 'minhanh.tutor@example.com', 'password': '123456'}, role='tutor')
check('login gia sư Minh Anh', st == 200, str(out.get('error', ''))[:60])
TUTOR_ID = out.get('id', '')

ts_name = datetime.utcnow().strftime('%H%M%S')
S1_NAME, S2_NAME = f'Test Repeat S1 {ts_name}', f'Test Repeat S2 {ts_name}'
S1_EMAIL = f'repeat.s1.{ts_name}@example.com'
S2_EMAIL = f'repeat.s2.{ts_name}@example.com'
for nm, em, role in ((S1_NAME, S1_EMAIL, 's1'), (S2_NAME, S2_EMAIL, 's2')):
    st, out = req('POST', '/api/auth/register', {'name': nm, 'email': em, 'password': '123456', 'role': 'STUDENT'})
    check(f'đăng ký {role}', st == 200, str(out.get('error', ''))[:60])
    st, out = req('POST', '/api/auth/login', {'email': em, 'password': '123456'}, role=role)
    check(f'login {role}', st == 200, str(out.get('error', ''))[:60])

st, td = req('GET', f'/api/tutors/{TUTOR_ID}')
SUBJ_ID, PRICE = td['subjects'][0]['id'], td['subjects'][0]['pricePerHour']
AVAILS = td['availabilities']
BUSY = td.get('busySlots') or []
print(f"  (gia sư: {td.get('name')} | {td['subjects'][0]['name']} @ {PRICE}/h | {len(AVAILS)} khung rảnh | {len(BUSY)} slot bận)")

# Lớp cố định của gia sư: template tuần + buổi thực tế (dời/bù)
st, cm = req('GET', '/api/classes/mine', role='tutor')
class_tpl = []   # (dow, startMin, endMin, title)
class_sess = []  # (dateISO, startMin, endMin)
for c in cm.get('classes', []):
    if c.get('status') in ('OPEN', 'PAUSED'):
        for s in c.get('schedule') or []:
            class_tpl.append((s['dayOfWeek'], to_min(s['startTime']), to_min(s['endTime']), c['title']))
    for s in c.get('sessions') or []:
        if s.get('status') in ('SCHEDULED', 'COMPLETED'):
            class_sess.append((s['date'], to_min(s['startTime']), to_min(s['endTime'])))
print(f"  ({len(class_tpl)} khung lớp tuần | {len(class_sess)} buổi lớp thực tế)")


def overlaps(t1, t2, u1, u2):
    return t1 < u2 and t2 > u1


def slot_clean(d_iso, t1, t2):
    """Slot sạch cho GIA SƯ: trong availability, không trùng lớp (template + buổi thực tế) + busy 1-1."""
    dow = dow_sys(d_iso)
    if not any(a['dayOfWeek'] == dow and t1 >= to_min(a['startTime']) and t2 <= to_min(a['endTime']) for a in AVAILS):
        return False
    for cd, cs, ce, _ in class_tpl:
        if cd == dow and overlaps(t1, t2, cs, ce):
            return False
    for sd, ss, se in class_sess:
        if sd == d_iso and overlaps(t1, t2, ss, se):
            return False
    for b in BUSY:
        if b['date'] == d_iso and overlaps(t1, t2, to_min(b['startTime']), to_min(b['endTime'])):
            return False
    return True


def find_slot(weeks_needed, exclude_dates=()):
    """Tìm (dateISO, start, end) sạch cho `weeks_needed` tuần liên tiếp, tránh hoàn toàn các ngày trong exclude_dates."""
    for off in range(15, 33):
        d = (today + timedelta(days=off)).isoformat()
        if d in exclude_dates:
            continue
        dow = dow_sys(d)
        for a in AVAILS:
            if a['dayOfWeek'] != dow:
                continue
            s, e = to_min(a['startTime']), to_min(a['endTime'])
            t1 = s
            while t1 + DUR <= e:
                t2 = t1 + DUR
                if all(slot_clean(add_days(d, 7 * w), t1, t2) for w in range(weeks_needed)):
                    return d, hm(t1), hm(t2)
                t1 += 30
    return None


S = find_slot(4)  # series 4 tuần
S_dates = {add_days(S[0], 7 * w) for w in range(4)} if S else set()
T = find_slot(2, exclude_dates=S_dates)  # 2 tuần, khác ngày chuỗi S
T_dates = {add_days(T[0], 7 * w) for w in range(2)} if T else set()
U = find_slot(3, exclude_dates=S_dates | T_dates)  # 3 tuần, khác S/T
check('tìm slot S sạch 4 tuần', S is not None)
check('tìm slot T sạch 2 tuần (khác S)', T is not None)
check('tìm slot U sạch 3 tuần (khác S/T)', U is not None)
if not (S and T and U):
    print('  !!! Không đủ slot sạch — bỏ toàn bộ test')
    raise SystemExit(1)
print(f"  (S={S[0]} {S[1]}-{S[2]} | T={T[0]} {T[1]}-{T[2]} | U={U[0]} {U[1]}-{U[2]})")

# Ngày T3/T5 giao lớp Toán 10 (18:00–20:30) trong 15-32 ngày, không có 1-1 bận chồng
CLASS_SLOT = None
for off in range(15, 33):
    d = (today + timedelta(days=off)).isoformat()
    if dow_sys(d) not in (2, 4):
        continue
    if any(b['date'] == d and overlaps(to_min('18:00'), to_min('19:30'), to_min(b['startTime']), to_min(b['endTime'])) for b in BUSY):
        continue
    CLASS_SLOT = d
    break
check('tìm ngày T3/T5 giao lớp Toán 10', CLASS_SLOT is not None)
if CLASS_SLOT:
    print(f"  (slot lớp: {CLASS_SLOT} 18:00-19:30)")


def post_booking(role, slot, repeat=None, date_override=None, time_override=None):
    body = dict(tutorId=TUTOR_ID, subjectId=SUBJ_ID, mode='ONLINE',
                date=date_override or slot[0],
                startTime=time_override[0] if time_override else slot[1],
                endTime=time_override[1] if time_override else slot[2])
    if repeat:
        body['repeatWeeks'] = repeat
    return req('POST', '/api/bookings', body, role=role)


# ===== A. Tuần đầu trùng GIA SƯ → series vẫn đặt được từ tuần 2 =====
print('=== A. Tuần đầu trùng lịch GIA SƯ (fix cốt lõi) ===')
st, out = post_booking('s1', S)
check('A1. S1 đặt blocker đơn buổi tại S → 200', st == 200, str(out.get('error', ''))[:70])

st, out = post_booking('s2', S, repeat=4)
check('A2. S2 đặt repeatWeeks=4 tại S (tuần đầu bận) → 200 (không bị chặn cả request)', st == 200, str(out.get('error', ''))[:70])
if st == 200:
    created = out.get('created', 0)
    skipped = out.get('skipped', [])
    check('A3. created=3, skipped=1', created == 3 and len(skipped) == 1,
          f'created={created} skipped={json.dumps(skipped, ensure_ascii=False)}')
    if skipped:
        check('A4. skipped[0] = đúng ngày S + lý do "Gia sư bận"',
              skipped[0].get('date') == S[0] and 'bận' in skipped[0].get('reason', '').lower(),
              json.dumps(skipped, ensure_ascii=False))
    check('A5. buổi đầu THẬT SỰ (response.date) = S+7', out.get('date') == add_days(S[0], 7),
          f"got {out.get('date')}")
    check('A6. seriesId cấp + seriesTotal=3', bool(out.get('seriesId')) and out.get('seriesTotal') == 3,
          f"seriesTotal={out.get('seriesTotal')}")
    per = round(PRICE * DUR_H)
    check('A7. totalSeriesAmount = đơn giá × 3 buổi', out.get('totalSeriesAmount') == per * 3,
          f"got {out.get('totalSeriesAmount')} vs {per * 3}")
    st, mine = req('GET', '/api/bookings?role=student', role='s2')
    s_rows = [b for b in mine['bookings'] if b.get('seriesId') == out.get('seriesId')]
    check('A8. GET bookings: 3 buổi đúng ngày S+7/S+14/S+21',
          sorted(b['date'] for b in s_rows) == sorted(add_days(S[0], 7 * w) for w in (1, 2, 3)),
          str(sorted(b['date'] for b in s_rows)))
    # Thông báo gia sư: firstDate = ngày buổi đầu THẬT (S+7), ghi chú tuần bị bỏ qua
    st, convs = req('GET', '/api/conversations', role='tutor')
    conv = next((c for c in convs.get('conversations', []) if c.get('other', {}).get('name') == S2_NAME), None)
    body_txt = (conv or {}).get('lastMessage', {}) or {}
    body_txt = body_txt.get('body', '') if body_txt else ''
    check('A9. thông báo gia sư nói "từ S+7" (buổi đầu thật)',
          f'từ {add_days(S[0], 7)}' in body_txt, body_txt[:90])
    check('A10. thông báo ghi chú 1 tuần bị bỏ qua kèm ngày S',
          '1 tuần bị bỏ qua' in body_txt and S[0] in body_txt, body_txt[:120])
else:
    print('  !!! A2 fail — bỏ các check phụ thuộc')

# ===== B. Đơn lẻ trùng → 400 lý do cụ thể (hồi quy) =====
print('=== B. Đơn lẻ trùng lịch → 400 lý do cụ thể ===')
st, out = post_booking('s2', S)
check('B1. S2 đặt ĐƠN tại S (gia sư bận) → 400', st == 400, f'got {st}')
check('B2. lý do "Gia sư đã có lịch vào khung giờ này" + ngày dd/mm/yyyy',
      'Gia sư đã có lịch' in out.get('error', '') and fmt_vi(S[0]) in out.get('error', ''),
      str(out.get('error', ''))[:90])

# ===== C. Mọi tuần trùng → 400 ưu tiên lý do tuần ĐẦU =====
print('=== C. Mọi tuần trùng → 400 lý do tuần đầu ===')
# Tuần 1 (S): gia sư bận do blocker của S1 · Tuần 2 (S+7): S2 tự bận do series ở A
st, out = post_booking('s2', S, repeat=2)
check('C1. repeatWeeks=2, cả 2 tuần trùng → 400', st == 400, f'got {st}')
check('C2. lý do = của TUẦN ĐẦU (gia sư bận) kèm ngày S',
      'Gia sư đã có lịch' in out.get('error', '') and fmt_vi(S[0]) in out.get('error', ''),
      str(out.get('error', ''))[:90])

# ===== D. Tuần đầu trùng do HỌC SINH (booking với GIA SƯ KHÁC) =====
print('=== D. Tuần đầu trùng do HỌC SINH ===')
# Blocker phải là booking của S2 với MỘT GIA SƯ KHÁC tại slot T (minhanh còn rảnh tại T)
# → nhánh student-busy mới được chọn (nếu blocker cùng minhanh thì nhánh tutor-busy ăn trước).
B_FOUND = None  # (role_key, tutor_id, subject_id)
for em in ('sarah.tutor@example.com', 'kimngan.tutor@example.com', 'ductri.tutor@example.com',
           'thanhtung.tutor@example.com', 'tuankiet.tutor@example.com', 'thuha.tutor@example.com',
           'minhquan.tutor@example.com', 'hoanglong.tutor@example.com', 'quocbao.tutor@example.com'):
    key = 'tb_' + em.split('.')[0]
    st, lo = req('POST', '/api/auth/login', {'email': em, 'password': '123456'}, role=key)
    if st != 200:
        continue
    tid = lo.get('id', '')
    st, d2 = req('GET', f'/api/tutors/{tid}')
    if st != 200 or not d2.get('subjects'):
        continue
    dow_t = dow_sys(T[0])
    ok_avail = any(a['dayOfWeek'] == dow_t and to_min(T[1]) >= to_min(a['startTime'])
                   and to_min(T[2]) <= to_min(a['endTime']) for a in d2['availabilities'])
    ok_busy = not any(b['date'] == T[0] and overlaps(to_min(T[1]), to_min(T[2]),
                                                     to_min(b['startTime']), to_min(b['endTime']))
                      for b in (d2.get('busySlots') or []))
    if ok_avail and ok_busy:
        # POST thử nhiều mode (ONLINE → tại nơi gia sư → tại nhà HS) —
        # trùng lớp cố định của gia sư B thì thử ứng viên kế
        for mode_b in ('ONLINE', 'STUDENT_TO_TUTOR', 'TUTOR_TO_STUDENT'):
            body_b = {'tutorId': tid, 'subjectId': d2['subjects'][0]['id'], 'mode': mode_b,
                      'date': T[0], 'startTime': T[1], 'endTime': T[2]}
            if mode_b == 'TUTOR_TO_STUDENT':
                body_b['address'] = 'Số 1 Nguyễn Trãi, Thanh Xuân, Hà Nội'
            st3, o3 = req('POST', '/api/bookings', body_b, role='s2')
            if st3 == 200:
                B_FOUND = (key, tid, d2['subjects'][0]['id'])
                break
        if B_FOUND:
            break
check('D1. S2 đặt đơn tại T với GIA SƯ KHÁC (blocker học sinh) → 200', B_FOUND is not None)
if B_FOUND:
    st, out = post_booking('s2', T, repeat=2)
    check('D2. S2 đặt repeatWeeks=2 tại T với minhanh → 200 (tuần đầu tự bận, bỏ qua)', st == 200, str(out.get('error', ''))[:70])
    if st == 200:
        skipped = out.get('skipped', [])
        check('D3. created=1, skipped=[T: "Bạn có lịch học trùng giờ"]',
              out.get('created') == 1 and len(skipped) == 1 and skipped[0].get('date') == T[0]
              and 'lịch học trùng' in skipped[0].get('reason', ''),
              json.dumps(skipped, ensure_ascii=False))
        check('D4. buổi đầu thật = T+7, seriesId=null (1 buổi)',
              out.get('date') == add_days(T[0], 7) and not out.get('seriesId'),
              f"date={out.get('date')} seriesId={out.get('seriesId')}")
else:
    print('  !!! D1 fail — bỏ các check phụ thuộc')

# ===== E. Tuần đầu trùng LỚP CỐ ĐỊNH =====
print('=== E. Tuần đầu trùng LỚP CỐ ĐỊNH ===')
if CLASS_SLOT:
    st, out = post_booking('s2', (CLASS_SLOT, '18:00', '19:30'))
    check('E1. đặt đơn tại slot giao lớp Toán 10 → 400 "Trùng lịch lớp học cố định"',
          st == 400 and 'Trùng lịch lớp học cố định' in out.get('error', '')
          and 'Toán 10' in out.get('error', '') and '(18:00–20:30)' in out.get('error', ''),
          str(out.get('error', ''))[:110])
    st, out = post_booking('s2', (CLASS_SLOT, '18:00', '19:30'), repeat=2)
    check('E2. repeatWeeks=2 tại slot giao lớp → 400 cùng lý do tuần đầu + ngày',
          st == 400 and 'Trùng lịch lớp học cố định' in out.get('error', '')
          and fmt_vi(CLASS_SLOT) in out.get('error', ''),
          str(out.get('error', ''))[:110])
else:
    print('  (bỏ — không tìm được ngày giao lớp)')

# ===== F. Hồi quy: chuỗi sạch =====
print('=== F. Hồi quy chuỗi sạch ===')
st, out = post_booking('s2', U, repeat=3)
check('F1. repeatWeeks=3 tại U sạch → 200, created=3, skipped=[]',
      st == 200 and out.get('created') == 3 and out.get('skipped') == [],
      f"created={out.get('created')} skipped={out.get('skipped')}")
if st == 200:
    check('F2. buổi đầu = đúng ngày U yêu cầu', out.get('date') == U[0], f"got {out.get('date')}")
    check('F3. seriesTotal=3', out.get('seriesTotal') == 3, f"got {out.get('seriesTotal')}")

# ===== G. Dọn dẹp =====
print('=== G. Dọn dẹp booking test ===')
n_cancel = 0
for role in ('s1', 's2'):
    st, mine = req('GET', '/api/bookings?role=student', role=role)
    for b in mine.get('bookings', []):
        if b.get('status') in ('PENDING', 'CONFIRMED'):
            st2, _ = req('POST', f"/api/bookings/{b['id']}/cancel", {'reason': 'dọn dữ liệu test tự động'}, role=role)
            if st2 == 200:
                n_cancel += 1
check(f'G1. hủy sạch booking test ({n_cancel} buổi)', n_cancel >= 5, f'n={n_cancel}')

print(f'\n===== KẾT QUẢ: {ok}/{ok + fail} PASS =====')
raise SystemExit(0 if fail == 0 else 1)
