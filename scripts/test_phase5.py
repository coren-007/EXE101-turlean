#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test tự động phase 5 — trụ cột Tìm kiếm & kết nối nâng cao:
A. /api/tutors?ids= — lấy đúng bộ gia sư theo thứ tự (cho "Xem gần đây")
B. Lọc khung giờ dạy availDay + availSlot (lịch rảnh thật của gia sư)
C. Filter verified=true (gia sư đã xác minh)
D. /api/me + login/register trả city (cá nhân hóa trang chủ)
E. Hồi quy phase 4: suggest không dấu, favorites toggle, subject filter
F. Index DB: schema có các @@index mới (kiểm file)
"""
import json
import urllib.request
import urllib.parse
import http.cookiejar

BASE = 'http://localhost:3000'
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

PASS, FAIL = 0, 0

def req(method, path, body=None):
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

print('=== A. /api/tutors?ids= — lấy theo thứ tự ===')

# A1. Lấy 3 tutor mốc
st, out = req('GET', '/api/tutors?sort=rating&pageSize=5')
base_tutors = out.get('tutors', [])
ids = [t['id'] for t in base_tutors[:3]]
names = [t['name'] for t in base_tutors[:3]]
check('lấy 3 tutor mốc', st == 200 and len(ids) == 3)

# A2. Đảo thứ tự → API trả đúng thứ tự đảo
rev = list(reversed(ids))
st, out = req('GET', '/api/tutors?ids=' + ','.join(rev))
got = [t['id'] for t in out.get('tutors', [])]
check('ids đảo thứ tự → trả đúng thứ tự', st == 200 and got == rev, f'{got}')

# A3. Kèm reliability (đủ field cho TutorCard)
st, out = req('GET', '/api/tutors?ids=' + ids[0])
t = out.get('tutors', [{}])[0]
check('tutor có reliability + subjects + minPrice', 'reliability' in t and 'subjects' in t and 'minPrice' in t)

# A4. ids rỗng → mảng rỗng không lỗi
st, out = req('GET', '/api/tutors?ids=')
check('ids rỗng → []', st == 200 and out.get('tutors') == [])

# A5. id không tồn tại → bỏ qua, không crash
st, out = req('GET', '/api/tutors?ids=nonexistent123,' + ids[0])
got = [t['id'] for t in out.get('tutors', [])]
check('id rác bị bỏ qua', st == 200 and got == [ids[0]], f'{got}')

print('=== B. Lọc khung giờ dạy (availDay + availSlot) ===')

# B1. Tổng số không lọc
st, out = req('GET', '/api/tutors?pageSize=50')
total_all = out.get('total', 0)
check('tổng không lọc > 0', total_all > 0, f'total={total_all}')

# B2. availDay=2 (thứ 3) — ít hơn hoặc bằng tổng
st, out = req('GET', '/api/tutors?availDay=2&pageSize=50')
total_tue = out.get('total', 0)
check('availDay=2 lọc được kết quả', st == 200 and 0 < total_tue <= total_all, f'{total_tue}/{total_all}')

# B3. availDay=0 (chủ nhật) khác availDay=2 — dữ liệu seed đa dạng nên 2 số khác nhau
st, out = req('GET', '/api/tutors?availDay=0&pageSize=50')
total_sun = out.get('total', 0)
check('availDay=0 ≠ availDay=2 (dữ liệu đa dạng)', total_sun != total_tue, f'CN={total_sun} vs T3={total_tue}')

# B4. availSlot=evening một mình — hoạt động (mọi ngày)
st, out = req('GET', '/api/tutors?availSlot=evening&pageSize=50')
total_eve = out.get('total', 0)
check('availSlot=evening hoạt động độc lập', st == 200 and 0 < total_eve <= total_all, f'{total_eve}')

# B5. Kết hợp ngày + khung giờ hẹp hơn chỉ ngày
st, out = req('GET', '/api/tutors?availDay=1&availSlot=morning&pageSize=50')
total_tue_morning = out.get('total', 0)
st, out = req('GET', '/api/tutors?availDay=1&pageSize=50')
total_tue_all = out.get('total', 0)
check('ngày+khung giờ ⊆ chỉ ngày', total_tue_morning <= total_tue_all, f'{total_tue_morning} <= {total_tue_all}')

# B6. availSlot rác → bỏ qua filter (kết quả = tất cả)
st, out = req('GET', '/api/tutors?availSlot=midnight&pageSize=50')
check('availSlot rác bỏ qua', st == 200 and out.get('total', 0) == total_all)

# B7. availDay + subject kết hợp
st, out = req('GET', '/api/tutors?subject=toan-hoc&availDay=6&pageSize=50')
check('subject + availDay kết hợp OK', st == 200 and out.get('total', 0) >= 0)

print('=== C. Filter verified ===')

# C1. verified=true → tất cả kết quả đều isVerified
st, out = req('GET', '/api/tutors?verified=true&pageSize=50')
vt = out.get('tutors', [])
check('verified=true chỉ trả gia sư đã xác minh', st == 200 and len(vt) > 0 and all(t.get('isVerified') for t in vt), f'{len(vt)} gia sư')

# C2. verified=false (param tắt) → trả tất cả
st, out = req('GET', '/api/tutors?verified=false&pageSize=50')
check('verified=false bỏ filter', st == 200 and out.get('total', 0) == total_all)

# C3. verified + city kết hợp
st, out = req('GET', '/api/tutors?verified=true&city=H%C3%A0%20N%E1%BB%99i&pageSize=50')
vt = out.get('tutors', [])
check('verified + city kết hợp', st == 200 and all(t.get('isVerified') and t.get('city') == 'Hà Nội' for t in vt), f'{len(vt)}')

print('=== D. /api/me + login trả city (cá nhân hóa) ===')

# D1. Login phụ huynh demo → response có city
st, out = req('POST', '/api/auth/login', {'email': 'hoa.parent@example.com', 'password': '123456'})
check('login trả city', st == 200 and out.get('city') in ('Hà Nội', 'TP.HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ'), f"city={out.get('city')}")

# D2. /api/me có city
st, out = req('GET', '/api/me')
check('/api/me trả city', st == 200 and (out.get('user') or {}).get('city'), f"city={(out.get('user') or {}).get('city')}")

# D3. Tìm theo city của user → có kết quả
city = (out.get('user') or {}).get('city')
st, out = req('GET', '/api/tutors?city=' + urllib.parse.quote(city) + '&pageSize=50')
check(f'tutors?city={city} có kết quả', st == 200 and out.get('total', 0) > 0, f"total={out.get('total')}")

# D4. Logout
st, out = req('POST', '/api/auth/logout', {})

print('=== E. Hồi quy phase 4 ===')

# E1. Suggest không dấu vẫn hoạt động
st, out = req('GET', '/api/search/suggest?q=toan')
names = [s['name'] for s in out.get('subjects', [])]
check('suggest q=toan vẫn khớp môn Toán', st == 200 and any('Toán' in n for n in names))

# E2. Subject filter vẫn hoạt động
st, out = req('GET', '/api/tutors?subject=toan-tieu-hoc&pageSize=50')
check('subject=toan-tieu-hoc có kết quả', st == 200 and out.get('total', 0) > 0)

# E3. Favorites 401 khi chưa login
st, out = req('GET', '/api/favorites')
check('favorites cần đăng nhập (401)', st == 401)

# E4. Text search fallback không dấu
st, out = req('GET', '/api/tutors?q=toan&pageSize=50')
check('q=toan (không dấu) fallback có kết quả', st == 200 and out.get('total', 0) > 0)

print('=== F. Schema index (file) ===')

# F1-F3. Schema có các index mới
with open('prisma/schema.prisma', encoding='utf-8') as f:
    schema = f.read()
check('User @@index([role, city])', '@@index([role, city])' in schema)
check('User @@index([hourlyRate])', '@@index([hourlyRate])' in schema)
check('Availability @@index([tutorId, dayOfWeek])', '@@index([tutorId, dayOfWeek])' in schema)

# F4. Migration PostgreSQL tồn tại
import os
check('migration phase5 tồn tại (trong file gộp baseline)',
      os.path.exists('prisma/migrations/20261012000000_phase5_search_indexes/migration.sql')
      or 'Availability_tutorId_dayOfWeek_idx' in open('prisma/migrations/20261006000000_phase2_to5_classes_favorites_search/migration.sql').read())

print(f'KẾT QUẢ: {PASS} PASS · {FAIL} FAIL')
exit(0 if FAIL == 0 else 1)
