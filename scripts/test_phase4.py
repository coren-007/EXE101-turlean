#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test tự động phase 4 — trụ cột Tìm kiếm & kết nối:
A. API autocomplete /api/search/suggest (khớp không dấu, popular, IELTS...)
B. API /api/subjects kèm tutorCount
C. API tutors: filter subject (slug) + maxPrice lọc ở DB
D. Wishlist /api/favorites: 401/404/toggle on-off/list/merge idempotent
E. Bug fix: subject param hoạt động end-to-end (toan-tieu-hoc → có kết quả)
"""
import json
import urllib.request
import urllib.parse
import http.cookiejar

BASE = 'http://localhost:3000'
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

PASS, FAIL = 0, 0

def req(method, path, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if data:
        r.add_header('Content-Type', 'application/json')
    try:
        with opener.open(r, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}

def check(name, cond, detail=''):
    global PASS, FAIL
    mark = '✓' if cond else '✗'
    print(f'  {mark} {name}' + (f' — {detail}' if (detail and not cond) else ''))
    if cond:
        PASS += 1
    else:
        FAIL += 1

print('=== A. API autocomplete /api/search/suggest ===')

# A1. Từ khóa không dấu "toan" → khớp môn "Toán..."
st, out = req('GET', '/api/search/suggest?q=toan')
names = [s['name'] for s in out.get('subjects', [])]
check('q=toan (không dấu) gợi ý môn Toán', st == 200 and any('Toán' in n for n in names), f'{names}')

# A2. "hoa" → khớp "Hóa học"
st, out = req('GET', '/api/search/suggest?q=hoa')
names = [s['name'] for s in out.get('subjects', [])]
check('q=hoa khớp môn Hóa học', st == 200 and any('Hóa' in n for n in names), f'{names}')

# A3. Tên gia sư không dấu
st, out = req('GET', '/api/search/suggest?q=nguyen%20minh%20anh')
tnames = [t['name'] for t in out.get('tutors', [])]
check('q=nguyen minh anh tìm đúng gia sư', st == 200 and any('Minh Anh' in n for n in tnames), f'{tnames}')

# A4. q rỗng → popular (môn nhiều gia sư nhất, kèm tutorCount)
st, out = req('GET', '/api/search/suggest')
subs = out.get('subjects', [])
check('q rỗng → popular kèm tutorCount > 0', st == 200 and out.get('popular') is True
      and len(subs) > 0 and all(s.get('tutorCount', 0) > 0 for s in subs),
      f'{[(s["name"], s["tutorCount"]) for s in subs[:3]]}')

# A5. Từ khóa vô nghĩa → rỗng không lỗi
st, out = req('GET', '/api/search/suggest?q=zzzzqxv')
check('q vô nghĩa → rỗng, không lỗi', st == 200 and len(out.get('subjects', [])) == 0 and len(out.get('tutors', [])) == 0)

print()
print('=== B. API /api/subjects kèm tutorCount ===')
st, out = req('GET', '/api/subjects')
check('GET subjects trả mảng kèm tutorCount', st == 200 and isinstance(out, list)
      and len(out) > 20 and all('tutorCount' in s for s in out[:5]))
toan = next((s for s in out if s['slug'] == 'toan-tieu-hoc'), None)
check('môn toan-tieu-hoc có tutorCount >= 1', toan is not None and toan['tutorCount'] >= 1,
      f'{toan and toan["tutorCount"]}')

print()
print('=== C. API tutors: subject + maxPrice ===')

# C1. Filter subject bằng slug (bug fix chính)
st, out = req('GET', '/api/tutors?subject=toan-tieu-hoc')
ok = st == 200 and out.get('total', 0) >= 1
if ok:
    ok = all(any(s['slug'] == 'toan-tieu-hoc' for s in t['subjects']) for t in out['tutors'])
check('subject=toan-tieu-hoc → chỉ gia sư dạy Toán tiểu học', ok, f'total={out.get("total")}')

# C2. maxPrice lọc ở DB
st, out = req('GET', '/api/tutors?maxPrice=250000')
ok = st == 200 and out.get('total', 0) >= 1
if ok:
    ok = all(t['minPrice'] <= 250000 for t in out['tutors'])
check('maxPrice=250000 → mọi kết quả ≤ 250k', ok, f'total={out.get("total")}')

# C3. Kết hợp subject + city + maxPrice
st, out = req('GET', '/api/tutors?subject=toan-hoc&city=' + urllib.parse.quote('Hà Nội') + '&maxPrice=400000')
ok = st == 200
if ok and out.get('total', 0) > 0:
    t0 = out['tutors'][0]
    ok = (t0['city'] == 'Hà Nội' and t0['minPrice'] <= 400000
          and any(s['slug'] == 'toan-hoc' for s in t0['subjects']))
check('subject + city + maxPrice kết hợp đúng', ok, f'total={out.get("total")}')

print()
print('=== D. Wishlist /api/favorites ===')

# D1. Chưa login → 401
st, out = req('GET', '/api/favorites')
check('GET favorites chưa login → 401', st == 401)
st, out = req('POST', '/api/favorites', {'tutorId': 'x'})
check('POST toggle chưa login → 401', st == 401)

# Login phụ huynh (response trả user object trực tiếp)
st, out = req('POST', '/api/auth/login', {'email': 'hoa.parent@example.com', 'password': '123456'})
check('login phụ huynh hoa', st == 200 and out.get('role') == 'STUDENT')

# D2. Toggle tutor không tồn tại → 404
st, out = req('POST', '/api/favorites', {'tutorId': 'khong-ton-tai'})
check('toggle tutor không tồn tại → 404', st == 404)

# D3. Toggle on → list → toggle off
st, tutors = req('GET', '/api/tutors?pageSize=5&sort=rating')
tid = tutors['tutors'][0]['id']
tname = tutors['tutors'][0]['name']

st, out = req('POST', '/api/favorites', {'tutorId': tid})
check('toggle ON → favorited=true', st == 200 and out.get('favorited') is True)

st, out = req('GET', '/api/favorites')
check('list có đúng tutor vừa lưu (đủ fields TutorCard)', st == 200
      and tid in out.get('ids', [])
      and any(t['id'] == tid and 'minPrice' in t and 'subjects' in t for t in out.get('tutors', [])))

st, out = req('POST', '/api/favorites', {'tutorId': tid})
check('toggle OFF → favorited=false', st == 200 and out.get('favorited') is False)
st, out = req('GET', '/api/favorites')
check('list rỗng sau khi bỏ lưu', st == 200 and tid not in out.get('ids', []))

# D4. Merge idempotent + lọc ID giả
st, out = req('POST', '/api/favorites?action=merge', {'tutorIds': [tid, 'id-gia-1', 'id-gia-2']})
check('merge (1 thật + 2 giả) → merged=1', st == 200 and out.get('merged') == 1, f'{out}')
st, out = req('POST', '/api/favorites?action=merge', {'tutorIds': [tid]})
check('merge lần 2 → merged=0 (idempotent)', st == 200 and out.get('merged') == 0)

# D5. Body xấu → 400
st, out = req('POST', '/api/favorites', {})
check('body thiếu tutorId → 400', st == 400)
st, out = req('POST', '/api/favorites?action=merge', {'tutorIds': 'khong-phai-mang'})
check('merge body sai → 400', st == 400)

# Dọn dữ liệu test (chỉ đòi hỏi tutor test bị bỏ lưu — account có thể có favorite khác)
req('POST', '/api/favorites', {'tutorId': tid})
st, out = req('GET', '/api/favorites')
check('dọn: tutor test đã được bỏ lưu', st == 200 and tid not in out.get('ids', []))

print()
print('=== E. Bug fix subject param end-to-end ===')
# Chip trang chủ "Toán" (slug toan-tieu-hoc) giờ truyền đúng param subject → có kết quả
st, out = req('GET', '/api/tutors?subject=toan-tieu-hoc&pageSize=12')
check('chip "Toán" trang chủ → có kết quả (trước đây 0)', st == 200 and out.get('total', 0) >= 1)
# Hero city: /api/tutors?city=Hà Nội (không còn nhét vào district)
st, out = req('GET', '/api/tutors?city=' + urllib.parse.quote('Hà Nội'))
check('hero chọn "Hà Nội" → lọc theo city (trước đây lọc district=Hà Nội → 0)', st == 200 and out.get('total', 0) >= 1
      and all(t['city'] == 'Hà Nội' for t in out['tutors']))

print()
print('=== F. Text search không dấu tiếng Việt (fallback normalize) ===')
st, out = req('GET', '/api/tutors?q=toan')
check('q=toan (không dấu) → khớp gia sư Toán (trước đây 0)', st == 200 and out.get('total', 0) >= 3,
      f'total={out.get("total")}')
st, out = req('GET', '/api/tutors?q=toan&city=' + urllib.parse.quote('Hà Nội'))
check('q=toan + city Hà Nội → kết quả đều ở Hà Nội', st == 200 and out.get('total', 0) >= 1
      and all(t['city'] == 'Hà Nội' for t in out['tutors']))
st, out = req('GET', '/api/tutors?q=hoa')
check('q=hoa → khớp Hóa/Hoàng (không dấu)', st == 200 and out.get('total', 0) >= 2,
      f'total={out.get("total")}')
st, out = req('GET', '/api/tutors?q=' + urllib.parse.quote('Toán'))
check('q=Toán (có dấu) vẫn khớp qua SQL contains', st == 200 and out.get('total', 0) >= 1)
st, out = req('GET', '/api/tutors?q=zzzzqxv')
check('q vô nghĩa → 0 kết quả, không lỗi', st == 200 and out.get('total', 0) == 0)

print()
print('=' * 50)
print(f'KẾT QUẢ: {PASS} PASS · {FAIL} FAIL')
exit(0 if FAIL == 0 else 1)
