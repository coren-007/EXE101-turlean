#!/usr/bin/env python3
"""Live test fix makeup-CANCELLED: buổi đã nghỉ không còn chặn dạy bù cùng khung giờ.

Phát hiện lúc chạy E2E browser UI: existed check trong PATCH sessions
(api/classes/[id]/sessions/[sessionId]) KHÔNG lọc status → một buổi CANCELLED
(nghỉ lễ/nghỉ buổi) vẫn chặn việc xếp dạy bù vào đúng khung giờ đó.

Kịch bản (tự tạo lớp riêng + tự dọn — không để lại dữ liệu):
  1. Login gia sư, quét lịch hiện có → chọn khung giờ không đụng lớp nào
  2. Tạo lớp test (sinh ~12 buổi tương lai cùng khung tuần)
  3. Nghỉ buổi B (không bù)        → B = CANCELLED
  4. Nghỉ buổi A kèm bù ĐÚNG slot B → TRƯỚC fix: 409 'Lớp đã có buổi cùng ngày
     cùng giờ này'; SAU fix: 200 + makeupSession (status SCHEDULED, makeupForId=A)
  5. Đối chứng: nghỉ buổi C kèm bù đè lên slot vừa có makeup SCHEDULED → 409 đúng
  6. DELETE lớp test → sạch
"""
import json
import urllib.request
import urllib.error
from datetime import date, timedelta

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

# ===== 1. Đăng nhập =====
st, out = req('POST', '/api/auth/login', {'email': 'minhanh.tutor@example.com', 'password': '123456'}, role='tutor')
check('login gia sư Min Anh', st == 200, str(out.get('error', '')))
if st != 200:
    raise SystemExit('Không đăng nhập được')

# ===== 2. Quét lịch hiện có để chọn khung giờ "sạch" =====
st, out = req('GET', '/api/classes/mine', role='tutor')
my_classes = out.get('classes', [])
check('GET /api/classes/mine', st == 200 and len(my_classes) >= 1)

# Mọi khung tuần đang dùng (tạo lớp mới phải không đụng) + mọi buổi tương lai
# (makeup phải không đụng buổi lớp khác cùng ngày)
busy_slots = set()   # (dayOfWeek, start, end) từ schedule các lớp OPEN/PAUSED
future_by_date = {}  # date -> [(start, end)] các buổi tương lai của TẤT CẢ lớp
today = date.today()
for c in my_classes:
    if c.get('status') in ('OPEN', 'PAUSED'):
        for s in c.get('schedule', []):
            busy_slots.add((s['dayOfWeek'], s['startTime'], s['endTime']))
    for s in c.get('sessions', []):
        if s['status'] != 'CANCELLED' and s['date'] >= today.isoformat():
            future_by_date.setdefault(s['date'], []).append((s['startTime'], s['endTime']))

subject_id = my_classes[0]['subject']['id']

def overlaps(s1, e1, s2, e2):
    return s1 < e2 and s2 < e1

def slot_clean(dow, t1, t2):
    # không đụng khung tuần các lớp đang mở + 12 ngày tới không đụng buổi cụ thể
    for (d, s, e) in busy_slots:
        if d == dow and overlaps(t1, t2, s, e):
            return False
    for w in range(1, 13):
        d = today + timedelta(days=w)
        # dayOfWeek của date: Python Mon=0..Sun=6; app dùng chuẩn gì?
        # generateSessionDates nextOccurrence dùng vnDayOfWeek — kiểm tra bằng
        # chính các ngày sinh: chỉ cần các buổi tương lai cùng NGÀY không đụng khung
        for (s, e) in future_by_date.get(d.isoformat(), []):
            if overlaps(t1, t2, s, e):
                return False
    return True

# Chọn khung giờ hiếm — thử vài ứng viên
candidates = [
    (3, '05:30', '07:00'),  # T4 sáng sớm (vnDayOfWeek: 3 = thứ 4 nếu 0=T2? thử bằng POST)
    (4, '05:30', '07:00'),
    (5, '05:30', '07:00'),
    (2, '21:15', '22:45'),
    (6, '05:15', '06:45'),
]
chosen = None
created = None
for (dow, t1, t2) in candidates:
    if not slot_clean(dow, t1, t2):
        continue
    st, out = req('POST', '/api/classes', {
        'title': 'E2E MKC2 lớp test bù đè buổi nghỉ',
        'subjectId': subject_id, 'capacity': 5,
        'schedule': [{'dayOfWeek': dow, 'startTime': t1, 'endTime': t2}],
    }, role='tutor')
    if st == 201 or st == 200:
        chosen, created = (dow, t1, t2), out
        break
    # 409 trùng lịch → thử ứng viên kế
    print(f'    (slot {(dow, t1, t2)} bị từ chối: {out.get("error", "")[:80]})')

check('tạo lớp test ở khung giờ sạch', chosen is not None,
      'không tìm được slot trống')
if created is None:
    raise SystemExit('Không tạo được lớp test')
cls_id = created.get('class', {}).get('id') or created.get('id', '')
print(f'    lớp test: {cls_id} slot={chosen}')

# ===== 3. Lấy buổi tương lai của lớp test =====
st, out = req('GET', '/api/classes/mine', role='tutor')
mine = next(c for c in out.get('classes', []) if c['id'] == cls_id)
sched = [s for s in mine['sessions'] if s['status'] == 'SCHEDULED' and s['date'] >= today.isoformat()]
check(f'lớp test có >= 3 buổi SCHEDULED tương lai (có {len(sched)})', len(sched) >= 3)
if len(sched) < 3:
    req('DELETE', f'/api/classes/{cls_id}', role='tutor')
    raise SystemExit('Thiếu buổi để test')

A, B, C = sched[0], sched[1], sched[2]  # A: nghỉ kèm bù, B: bị nghỉ trước, C: đối chứng

# ===== 4. Nghỉ buổi B (không bù) =====
st, out = req('PATCH', f"/api/classes/{cls_id}/sessions/{B['id']}",
              {'action': 'cancel', 'reason': 'E2E MKC2 nghỉ buổi B để giải phóng slot'}, role='tutor')
check('nghỉ buổi B (không bù) → 200', st == 200, f'st={st} err={out.get("error", "")}')

# ===== 5. FIX CHECK: nghỉ A kèm bù ĐÚNG slot B đã nghỉ =====
st, out = req('PATCH', f"/api/classes/{cls_id}/sessions/{A['id']}", {
    'action': 'cancel',
    'reason': 'E2E MKC2 nghỉ A, bù đè lên slot buổi B đã nghỉ',
    'makeup': {'date': B['date'], 'startTime': B['startTime'], 'endTime': B['endTime']},
}, role='tutor')
mk = out.get('makeupSession') or {}
check('FIX: bù đè lên slot buổi ĐÃ NGHỈ → 200 (trước fix 409)', st == 200,
      f'st={st} err={out.get("error", "")}')
check('makeupSession đúng: SCHEDULED + makeupForId=A + trỏ slot B',
      st == 200 and mk.get('status') == 'SCHEDULED' and mk.get('makeupForId') == A['id']
      and mk.get('date') == B['date'] and mk.get('startTime') == B['startTime'],
      f'mk={json.dumps(mk, ensure_ascii=False)[:160]}')
check('hồi sinh đúng DÒNG cũ (makeup.id == B.id, giữ unique DB)',
      st == 200 and mk.get('id') == B['id'],
      f'mk.id={mk.get("id")} vs B.id={B["id"]}')

# ===== 6. Đối chứng: bù đè lên slot vừa có makeup SCHEDULED → vẫn 409 =====
st, out = req('PATCH', f"/api/classes/{cls_id}/sessions/{C['id']}", {
    'action': 'cancel',
    'reason': 'E2E MKC2 đối chứng bù đè buổi còn lịch',
    'makeup': {'date': B['date'], 'startTime': B['startTime'], 'endTime': B['endTime']},
}, role='tutor')
check('đối chứng: bù đè slot makeup SCHEDULED → 409 đúng luật',
      st == 409 and ('cùng ngày cùng giờ' in (out.get('error') or '')
                     or 'Trùng buổi lớp' in (out.get('error') or '')),
      f'st={st} err={out.get("error", "")}')

# ===== 7. Trạng thái cuối trên DB (qua API mine) =====
st, out = req('GET', '/api/classes/mine', role='tutor')
mine = next(c for c in out.get('classes', []) if c['id'] == cls_id)
sess = {s['id']: s for s in mine['sessions']}
a_new, b_new = sess.get(A['id'], {}), sess.get(B['id'], {})
mk_on_slot = [s for s in mine['sessions']
              if s['date'] == B['date'] and s['startTime'] == B['startTime']]
check('A = CANCELLED, slot B có ĐÚNG 1 dòng = buổi bù SCHEDULED (hồi sinh dòng B)',
      a_new.get('status') == 'CANCELLED'
      and len(mk_on_slot) == 1
      and mk_on_slot[0]['status'] == 'SCHEDULED' and mk_on_slot[0]['id'] == B['id']
      and mk_on_slot[0].get('makeupForId') == A['id'],
      f'A={a_new.get("status")} tại slot: '
      + str([(s.get("status"), s.get("id") == B["id"], s.get("makeupForId")) for s in mk_on_slot]))

# ===== 8. Dọn dẹp =====
st, out = req('DELETE', f'/api/classes/{cls_id}', role='tutor')
check('DELETE lớp test → sạch', st == 200, f'st={st} err={out.get("error", "")}')
st, out = req('GET', '/api/classes/mine', role='tutor')
check('lớp test biến mất', all(c['id'] != cls_id for c in out.get('classes', [])))

print()
print(f'KẾT QUẢ: {ok} pass / {fail} fail')
exit(1 if fail else 0)
