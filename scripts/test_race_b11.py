#!/usr/bin/env python3
"""Live race test B11 (SẸ-RACE3): 2 request enroll đồng thời (threading.Barrier)
vào lớp ĐÃ ĐỦ SĨ SỐ → 2 vị trí danh sách chờ phải KHÁC NHAU.
Trước fix: vị trí tính từ snapshot cũ (waiting.length + 1) → cả 2 cùng #N."""
import json
import threading
import urllib.request
import urllib.error

BASE = 'http://localhost:3000'


def api(method, path, body=None, cookie=None, timeout=30):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header('Content-Type', 'application/json')
    if cookie:
        req.add_header('Cookie', cookie)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=timeout) as r:
            raw = r.read().decode()
            return r.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw.strip().startswith('{') else {}
        except Exception:
            return e.code, {}


def login(email):
    req = urllib.request.Request(BASE + '/api/auth/login', method='POST')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, json.dumps({'email': email, 'password': '123456'}).encode()) as r:
        return r.headers.get('Set-Cookie').split(';')[0]


# 1. Tìm lớp đầy: /api/classes/discover trả remaining
st, body = api('GET', '/api/classes/discover')
full_class = next((c for c in body.get('classes', []) if c.get('remaining', 1) <= 0), None)
assert full_class, 'Không có lớp đầy nào để test waitlist race!'
class_id = full_class['id']
print(f"Lớp đầy: {full_class['title']} (sĩ số {full_class['capacity']}, đã {full_class['enrolledCount']})")

# 2. Đăng ký 2 học sinh test mới (dọn sau bằng cleanup_race_test.ts)
import time


def reg(email):
    st, b = api('POST', '/api/auth/register', {
        'email': email, 'password': '123456', 'name': 'Test Race B11',
        'role': 'STUDENT', 'city': 'Hà Nội',
    })
    if st not in (200, 201):
        print(f'  register {email}: {st} {str(b)[:80]} (thử login)')
    return login(email)


ts = str(int(time.time()))[-6:]
free = []
for prefix in ('race.a', 'race.b'):
    em = f'{prefix}.{ts}@example.com'
    c = reg(em)
    assert c and c.startswith('tc_session='), f'register/login {em} thất bại'
    free.append((em, c))
print(f'2 học sinh: {free[0][0]}, {free[1][0]}')

# 3. Bắn 2 request ĐỒNG THỜI qua Barrier
results = [None, None]
barrier = threading.Barrier(2)


def enroll(idx, cookie):
    barrier.wait()
    st, b = api('POST', f'/api/classes/{class_id}/enroll', {'force': True}, cookie=cookie, timeout=60)
    results[idx] = (st, b)


t1 = threading.Thread(target=enroll, args=(0, free[0][1]))
t2 = threading.Thread(target=enroll, args=(1, free[1][1]))
t1.start(); t2.start(); t1.join(); t2.join()

for i, (st, b) in enumerate(results):
    pos = b.get('waitlistPosition')
    print(f'  student {i + 1}: HTTP {st} | vị trí chờ = {pos} | {str(b.get("message", b.get("error", "")))[:80]}')

ok_status = all(st == 200 for st, _ in results)
positions = [b.get('waitlistPosition') for _, b in results]
ok_pos = ok_status and len(set(positions)) == 2 and all(isinstance(p, int) for p in positions)
print(f'\nKẾT QUẢ B11 race test: {"✅ 2 vị trí khác nhau" if ok_pos else "❌ vị trí trùng hoặc lỗi"}')

# 4. Dọn: lưu enrollment id để script bun xóa sau
print('\n--- để dọn dữ liệu, chạy: ---')
print('bun scripts/cleanup_race_test.ts')
with open('/tmp/race_enroll_ids.json', 'w') as f:
    ids = []
    for _, b in results:
        e = b.get('enrollment') or {}
        if e.get('id'):
            ids.append(e['id'])
    json.dump({'classId': class_id, 'enrollmentIds': ids, 'emails': [em for em, _ in free]}, f)
print(f'đã lưu {len(ids)} enrollment id vào /tmp/race_enroll_ids.json')
exit(0 if ok_pos else 1)
