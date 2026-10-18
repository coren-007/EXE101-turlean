#!/usr/bin/env python3
"""Live test B1 sau fix: address phải bị gate ở 4 route public,
vẫn hiện cho tutor chủ lớp + học sinh APPROVED."""
import json
import urllib.request

BASE = 'http://localhost:3000'
TUTOR_MINHANH = 'cmvd3j9r3000ylgw5h6a7hqc5'  # minhanh.tutor


def api(method, path, body=None, cookie=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header('Content-Type', 'application/json')
    if cookie:
        req.add_header('Cookie', cookie)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data) as r:
            return r.status, json.loads(r.read().decode() or '{}'), r.headers.get('Set-Cookie')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or '{}'), None
        except Exception:
            return e.code, {}, None


def login(email):
    st, body, sc = api('POST', '/api/auth/login', {'email': email, 'password': '123456'})
    assert st == 200, f'login {email}: {st}'
    return sc.split(';')[0]


PASS, FAIL = 0, 0


def check(name, cond, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  ✅ {name}')
    else:
        FAIL += 1
        print(f'  ❌ {name} — {detail}')


print('1) /api/tutors ẨN DANH')
st, body, _ = api('GET', '/api/tutors?pageSize=5')
ts = body.get('tutors', [])
leaked = [t['name'] for t in ts if 'address' in t and t['address']]
check('không có field address / address=null', all(t.get('address') is None for t in ts),
      f"lộ: {leaked[:2]}")
check('vẫn còn district/city', all('district' in t for t in ts))

print('2) /api/classes?tutorId= ẨN DANH')
st, body, _ = api('GET', f'/api/classes?tutorId={TUTOR_MINHANH}')
cs = body.get('classes', [])
leaked = [c['title'] for c in cs if c.get('address')]
check(f'address null cho {len(cs)} lớp', len(cs) > 0 and all(c.get('address') is None for c in cs),
      f'lộ: {leaked}')

print('3) /api/classes/discover ẨN DANH')
st, body, _ = api('GET', '/api/classes/discover')
cs = body.get('classes', [])
leaked = [c['title'] for c in cs if c.get('address')]
check(f'address null cho {len(cs)} lớp', len(cs) > 0 and all(c.get('address') is None for c in cs),
      f'lộ: {leaked}')

print('4) /api/favorites đã LOGIN (hoa.parent)')
cookie = login('hoa.parent@example.com')
st, body, _ = api('GET', '/api/favorites', cookie=cookie)
ts = body.get('tutors', [])
leaked = [t['name'] for t in ts if t.get('address')]
check(f'address null cho {len(ts)} tutor đã lưu', all(t.get('address') is None for t in ts),
      f'lộ: {leaked}')

print('5) /api/classes?tutorId= với học sinh APPROVED (hoa.parent)')
st, body, _ = api('GET', f'/api/classes?tutorId={TUTOR_MINHANH}', cookie=cookie)
cs = body.get('classes', [])
approved_addr = [c['title'] for c in cs if c.get('address')]
check('lớp đã APPROVED vẫn thấy address (không regression)', len(approved_addr) >= 1,
      f'0 lớp có address: {[c["title"] for c in cs]}')

print('6) /api/classes?tutorId= với CHÍNH tutor chủ lớp')
tcookie = login('minhanh.tutor@example.com')
st, body, _ = api('GET', f'/api/classes?tutorId={TUTOR_MINHANH}', cookie=tcookie)
cs = body.get('classes', [])
own_addr = [c['title'] for c in cs if c.get('address')]
check('chủ lớp vẫn thấy address (không regression)', len(own_addr) >= 1,
      f'0 lớp có address')

print('7) /api/classes/discover với học sinh APPROVED')
st, body, _ = api('GET', '/api/classes/discover', cookie=cookie)
cs = body.get('classes', [])
has_addr = [c['title'] for c in cs if c.get('address')]
check('lớp APPROVED trong discover vẫn thấy address', len(has_addr) >= 1, f'{[c["title"] for c in cs][:3]}')

print()
print(f'KẾT QUẢ B1: {PASS} pass / {FAIL} fail')
exit(1 if FAIL else 0)
