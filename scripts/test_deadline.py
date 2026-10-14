#!/usr/bin/env python3
"""Test end-to-end: HẠN ĐĂNG KÝ (enrollDeadline) + lịch calendar học sinh."""
import json
import urllib.request
from datetime import date, timedelta

BASE = 'http://localhost:3000'
SESSIONS = {}  # role -> token


def req(method, path, body=None, role=None):
    r = urllib.request.Request(BASE + path, method=method)
    r.add_header('Content-Type', 'application/json')
    if role and SESSIONS.get(role):
        r.add_header('Cookie', f"tc_session={SESSIONS[role]}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        resp = urllib.request.urlopen(r, data=data)
        out = json.loads(resp.read().decode())
        for c in (resp.headers.get('set-cookie') or '').split(','):  # type: ignore
            if 'tc_session=' in c and role:
                SESSIONS[role] = c.split('tc_session=')[1].split(';')[0]
        return resp.status, out
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {'error': f'non-json response: {e.reason}'}


ok, fail = 0, 0
TUTOR_ID = ''
STUDENT_ID = ''
def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'  ✓ {name}')
    else:
        fail += 1
        print(f'  ✗ {name} {extra}')


yesterday = (date.today() - timedelta(days=1)).isoformat()
next_week = (date.today() + timedelta(days=7)).isoformat()

# ===== 1. Đăng nhập =====
st, out = req('POST', '/api/auth/login', {'email': 'hoanglong.tutor@example.com', 'password': '123456'}, role='tutor')
check('login gia sư Hoàng Long', st == 200, str(out.get('error', '')))
TUTOR_ID = out.get('id', '') or (out.get('user') or {}).get('id', '')
st, out = req('POST', '/api/auth/login', {'email': 'minhtam.parent@example.com', 'password': '123456'}, role='student')
check('login phụ huynh Minh Tâm', st == 200, str(out.get('error', '')))
STUDENT_ID = out.get('id', '') or (out.get('user') or {}).get('id', '')

# ===== 2. Lấy lớp Vật lý 11 của gia sư =====
st, out = req('GET', '/api/classes/mine', role='tutor')
mine = out.get('classes', [])
vatly = next((c for c in mine if 'Vật lý' in c['title']), None)
check('gia sư có Lớp Vật lý 11', vatly is not None)
if not vatly:
    raise SystemExit('Thiếu dữ liệu seed')

# ===== 3. Gia sư đặt hạn đăng ký QUA KHỨ (đóng đăng ký ngay) =====
st, out = req('PATCH', f"/api/classes/{vatly['id']}", {'enrollDeadline': yesterday}, role='tutor')
check('PATCH hạn quá khứ OK (đóng đăng ký)', st == 200, str(out.get('error', '')))

# ===== 4. Phụ huynh đăng ký → phải bị chặn =====
st, out = req('POST', f"/api/classes/{vatly['id']}/enroll", {'note': 'test quá hạn'}, role='student')
check('enroll quá hạn → 400 + thông báo hết hạn', st == 400 and 'hết hạn' in out.get('error', '').lower(),
      f'st={st} err={out.get("error", "")}')

# ===== 5. API công khai (hồ sơ gia sư) đánh dấu deadlinePassed =====
st, out = req('GET', f'/api/classes?tutorId={TUTOR_ID}')
pub = next((c for c in out.get('classes', []) if c['id'] == vatly['id']), None)
check('GET /api/classes trả enrollDeadline + deadlinePassed=true',
      pub and pub.get('enrollDeadline') == yesterday and pub.get('deadlinePassed') is True,
      f'enrollDeadline={pub and pub.get("enrollDeadline")} passed={pub and pub.get("deadlinePassed")}')

# ===== 6. Discover cũng trả flag =====
st, out = req('GET', '/api/classes/discover')
disc = next((c for c in out.get('classes', []) if c['id'] == vatly['id']), None)
check('discover trả deadlinePassed=true', disc and disc.get('deadlinePassed') is True)

# ===== 7. Gia sư đặt lại hạn tương lai → đăng ký được =====
st, out = req('PATCH', f"/api/classes/{vatly['id']}", {'enrollDeadline': next_week}, role='tutor')
check('PATCH hạn tương lai OK', st == 200)
st, out = req('GET', f'/api/classes?tutorId={TUTOR_ID}')
pub = next((c for c in out.get('classes', []) if c['id'] == vatly['id']), None)
check('deadlinePassed=false khi hạn tương lai', pub and pub.get('deadlinePassed') is False)

st, out = req('POST', f"/api/classes/{vatly['id']}/enroll", {'note': 'test còn hạn'}, role='student')
# Lỗi "đã gửi đăng ký" cũng chứng tỏ CỔNG ĐĂNG KÝ ĐÃ MỞ (check hạn chạy TRƯỚC check trùng)
check('enroll còn hạn → qua được cổng hạn (mới hoặc trùng đăng ký cũ)',
      st == 200 or 'đã gửi đăng ký' in out.get('error', ''),
      f'st={st} err={out.get("error", "")}')

# ===== 8. Tạo lớp mới có hạn — validate hạn trước hôm nay bị từ chối =====
st, out = req('POST', '/api/classes', {
    'title': 'Lớp test hạn quá khứ', 'subjectId': vatly['subject']['id'],
    'capacity': 5, 'enrollDeadline': yesterday,
    'schedule': [{'dayOfWeek': 4, 'startTime': '19:00', 'endTime': '20:30'}],
}, role='tutor')
check('tạo lớp với hạn quá khứ → 400', st == 400, f'st={st} err={out.get("error", "")}')

# ===== 9. Dữ liệu lịch học sinh (cho calendar) =====
st, out = req('GET', '/api/enrollments/mine', role='student')
enr = out.get('enrollments', [])
approved = [e for e in enr if e['status'] == 'APPROVED']
check(f'enrollments/mine có {len(enr)} đăng ký', st == 200 and len(enr) > 0)
with_sessions = [e for e in approved if (e['class'].get('sessions') or [])]
check('lớp APPROVED kèm danh sách sessions cho calendar', len(with_sessions) > 0,
      f'approved={len(approved)} có sessions={len(with_sessions)}')
if with_sessions:
    s = with_sessions[0]['class']['sessions'][0]
    check('session có date/startTime/status', all(k in s for k in ('date', 'startTime', 'status')))

# ===== 10. Dọn dẹp: xóa lớp test =====
if vatly:
    # trả lớp Vật lý về không hạn để seed sạch
    req('PATCH', f"/api/classes/{vatly['id']}", {'enrollDeadline': None}, role='tutor')

print()
print(f'KẾT QUẢ: {ok} pass / {fail} fail')
exit(1 if fail else 0)
