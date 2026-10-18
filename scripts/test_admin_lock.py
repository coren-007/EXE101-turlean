#!/usr/bin/env python3
"""Live test P6 hardening: admin KHÓA TAY tài khoản + RÀ SOÁT tự khóa toàn hệ thống.

Hai lỗ hổng bịt trong đợt này (bổ sung cho Phase 6 đã có auto-lock + unlock):
  1. POST /api/admin/users/[id]/lock — admin khóa tay kèm lý do (watchlist có nút),
     đối xứng unlock: guard (không tự khóa / không khóa admin / không khóa 2 lần),
     AdminActionLog LOCK_ACCOUNT, lý do "[Admin khóa] ...", login 403 + session cũ chết.
  2. POST /api/admin/users/lock-sweep — bất biến "điểm < 30 ⇒ khóa": tutor có score 20
     tạo bằng dữ liệu ngoài luồng hủy (không qua cancel route nên không tự khóa) ⇒
     sweep phải khóa kèm AdminActionLog LOCK_SWEEP; chạy lần 2 idempotent (locked=0);
     không đụng admin / người trên ngưỡng.

Tự tạo dữ liệu riêng (alock.*) + tự dọn sạch — không đọng lại gì trên DB demo.
"""
import json
import subprocess
import urllib.request
import urllib.error
from datetime import datetime

BASE = 'http://localhost:3000'
SESSIONS = {}
TS = datetime.now().strftime('%H%M%S')
TUTOR_EMAIL = f'alock.tutor.{TS}@example.com'
STUDENT_EMAIL = f'alock.student.{TS}@example.com'
SETUP = {}  # tutorId/studentId/admin2Id/admin2Email/logSince từ alock_tools setup

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

def tools(*args):
    p = subprocess.run(
        ['bun', 'run', 'scripts/alock_tools.ts', *[str(a) for a in args]],
        capture_output=True, text=True, cwd='/home/z/my-project',
    )
    if p.returncode != 0:
        raise RuntimeError(f'alock_tools {args} fail: {p.stderr[-500:]}')
    return json.loads(p.stdout.strip().splitlines()[-1])

ok, fail = 0, 0
def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'  ✓ {name}')
    else:
        fail += 1
        print(f'  ✗ {name} {extra}')

# ===== 0. SETUP =====
print('\n[0] Setup — đăng nhập + đăng ký user test + fabricate điểm 20 chưa khóa')
st, out = req('POST', '/api/auth/login', {'email': 'admin@turlean.vn', 'password': '123456'}, role='admin')
check('0.1 admin login', st == 200 and out.get('role') == 'ADMIN', str(out.get('error', '')))
ADMIN_ID = out.get('id', '')

st, out = req('POST', '/api/auth/register', {
    'name': 'ALock Tutor', 'email': TUTOR_EMAIL, 'password': '123456', 'role': 'TUTOR',
}, role='tutor')
check('0.2 đăng ký alock.tutor', st in (200, 201), str(out.get('error', '')))

st, out = req('POST', '/api/auth/register', {
    'name': 'ALock Student', 'email': STUDENT_EMAIL, 'password': '123456', 'role': 'STUDENT',
}, role='student')
check('0.3 đăng ký alock.student', st in (200, 201), str(out.get('error', '')))

try:
    SETUP = tools('setup', TUTOR_EMAIL, STUDENT_EMAIL)
    check('0.4 alock_tools setup: score 20 chưa khóa', SETUP.get('score') == 20, json.dumps(SETUP))
except Exception as e:
    raise SystemExit(f'0.4 setup fail: {e}')

# ===== A. GUARD KHÓA TAY =====
print('\n[A] Guard — phân quyền + validate + không khóa sai đối tượng')
st, out = req('POST', f"/api/admin/users/{SETUP['tutorId']}/lock", {'reason': 'hành vi xấu'})
check('A1 chưa đăng nhập → 401', st == 401, f'got {st}')

st, out = req('POST', f"/api/admin/users/{SETUP['tutorId']}/lock", {'reason': 'hành vi xấu'}, role='student')
check('A2 không phải admin → 403', st == 403, f'got {st}')

st, out = req('POST', f"/api/admin/users/{SETUP['tutorId']}/lock", {}, role='admin')
check('A3 thiếu lý do → 400', st == 400, f'got {st}: {out.get("error","")[:60]}')

st, out = req('POST', f"/api/admin/users/{SETUP['tutorId']}/lock", {'reason': 'abc'}, role='admin')
check('A4 lý do < 5 ký tự → 400', st == 400, f'got {st}')

st, out = req('POST', '/api/admin/users/khong-ton-tai/lock', {'reason': 'lý do hợp lệ'}, role='admin')
check('A5 user không tồn tại → 404', st == 404, f'got {st}')

st, out = req('POST', f'/api/admin/users/{ADMIN_ID}/lock', {'reason': 'tự khóa mình'}, role='admin')
check('A6 admin tự khóa chính mình → 400', st == 400, f'got {st}')

st, out = req('POST', f"/api/admin/users/{SETUP['admin2Id']}/lock", {'reason': 'khóa admin khác'}, role='admin')
check('A7 khóa tài khoản ADMIN → 400', st == 400 and 'quản trị' in out.get('error', ''), f'got {st}: {out.get("error","")[:60]}')

# ===== B. KHÓA TAY HOẠT ĐỘNG =====
print('\n[B] Khóa tay hoạt động — DB + audit log + hiệu lực 2 tầng')
REASON = 'Quấy rối phụ huynh qua tin nhắn'
st, out = req('POST', f"/api/admin/users/{SETUP['studentId']}/lock", {'reason': REASON}, role='admin')
check('B1 khóa student hợp lệ → 200', st == 200 and 'Đã khóa' in out.get('message', ''), f'got {st}: {out.get("error","")[:60]}')

v = tools('verify', STUDENT_EMAIL)
check('B2 DB: lockedAt set + lý do "[Admin khóa]"', v['locked'] and v['lockedReason'] == f'[Admin khóa] {REASON}', json.dumps(v))

logs = tools('logs', SETUP['logSince'])
la = [l for l in logs if l['action'] == 'LOCK_ACCOUNT' and l['targetId'] == SETUP['studentId']]
check('B3 AdminActionLog LOCK_ACCOUNT ghi đúng target', len(la) == 1 and json.loads(la[0]['meta'])['reason'] == REASON, f'{len(la)} rows')

st, out = req('POST', '/api/auth/login', {'email': STUDENT_EMAIL, 'password': '123456'})
check('B4 user bị khóa login → 403 kèm lý do', st == 403 and REASON in str(out.get('error', '')), f'got {st}: {str(out)[:80]}')

st, out = req('GET', '/api/me', role='student')
check('B5 session CŨ của user bị khóa chết ngay (/api/me → user null)', st == 200 and out.get('user') is None, f'got {st}: {str(out)[:80]}')

st, out = req('POST', f"/api/admin/users/{SETUP['studentId']}/lock", {'reason': 'khóa lần hai'}, role='admin')
check('B6 khóa lần 2 → 400 đã bị khóa', st == 400 and 'đã bị khóa' in out.get('error', ''), f'got {st}')

st, out = req('POST', f"/api/admin/users/{SETUP['studentId']}/unlock", role='admin')
check('B7 unlock user bị khóa TAY vẫn hoạt động → 200', st == 200, f'got {st}: {out.get("error","")[:60]}')

st, out = req('POST', '/api/auth/login', {'email': STUDENT_EMAIL, 'password': '123456'}, role='student2')
check('B8 sau unlock login lại → 200', st == 200, f'got {st}')

# ===== C. RÀ SOÁT TỰ KHÓA (SWEEP) =====
print('\n[C] Sweep — bất biến "điểm < 30 ⇒ khóa" cho dữ liệu ngoài luồng hủy')
v = tools('verify', TUTOR_EMAIL)
check('C1 tutor score 20 và CHƯA bị khóa (giả lập dữ liệu lệch)', v['score'] == 20 and not v['locked'], json.dumps(v))

st, out = req('POST', '/api/admin/users/lock-sweep', role='student')
check('C2 sweep không phải admin → 403', st == 403, f'got {st}')

st, out = req('POST', '/api/admin/users/lock-sweep', role='admin')
locked_names = [u['name'] for u in out.get('users', [])]
check('C3 sweep khóa đúng 1 user (tutor 20 điểm)', st == 200 and out.get('locked') == 1 and 'ALock Tutor' in locked_names, json.dumps(out)[:120])

v = tools('verify', TUTOR_EMAIL)
check('C4 DB: tutor bị khóa kèm lý do rà soát', v['locked'] and 'rà soát lại' in v['lockedReason'], json.dumps(v)[:100])

st, out = req('POST', '/api/auth/login', {'email': TUTOR_EMAIL, 'password': '123456'})
check('C5 tutor bị khóa sau sweep → login 403', st == 403, f'got {st}')

logs = tools('logs', SETUP['logSince'])
ls = [l for l in logs if l['action'] == 'LOCK_SWEEP']
meta = json.loads(ls[0]['meta']) if ls else {}
check('C6 AdminActionLog LOCK_SWEEP ghi đủ', len(ls) == 1 and meta.get('locked') == 1 and any(u['name'] == 'ALock Tutor' for u in meta.get('lockedUsers', [])), f'{len(ls)} rows')

st, out = req('POST', '/api/admin/users/lock-sweep', role='admin')
check('C7 sweep lần 2 idempotent → locked=0', st == 200 and out.get('locked') == 0, json.dumps(out)[:100])

v = tools('verify', SETUP['admin2Email'])
check('C8 tài khoản ADMIN không bị sweep đụng tới', not v['locked'], json.dumps(v))

st, out = req('GET', '/api/admin/users?locked=1', role='admin')
locked_emails = [u['email'] for u in out.get('users', [])]
check('C9 danh sách khóa chỉ có tutor test', locked_emails == [TUTOR_EMAIL], str(locked_emails))

# ===== D. DỌN DẸN =====
print('\n[D] Dọn dẹp — trả DB demo sạch như trước test')
st, out = req('POST', f"/api/admin/users/{SETUP['tutorId']}/unlock", role='admin')
check('D1 unlock tutor trước khi dọn', st == 200, f'got {st}')

c = tools('cleanup', TUTOR_EMAIL, STUDENT_EMAIL, SETUP['admin2Email'], SETUP['logSince'])
check('D2 cleanup xóa đủ 3 user + 8 booking + 8 cancellation + log', c['deleted']['users'] == 3 and c['deleted']['bookings'] == 8 and c['deleted']['cancellations'] == 8 and c['deleted']['logs'] >= 2, json.dumps(c))

st, out = req('GET', '/api/admin/users?locked=1', role='admin')
check('D3 không còn ai bị khóa', len(out.get('users', [])) == 0, str(out.get('users', [])[:2]))

st, out = req('GET', '/api/admin/stats', role='admin')
check('D4 stats vẫn lành sau dọn', st == 200 and out.get('totals', {}).get('tutors', 0) >= 26, f'got {st}')

print(f'\n===== KẾT QUẢ: {ok}/{ok + fail} PASS =====')
if fail:
    raise SystemExit(1)
