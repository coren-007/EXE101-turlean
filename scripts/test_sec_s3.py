#!/usr/bin/env python3
"""S3 (chạy riêng): race condition sĩ số lớp nhóm — tái dụng user sec.* còn trong DB.
Bản nâng cấp 2: asyncio + raw socket — cả 4 request được ghi trong CÙNG một event-loop
tick (độ lệch đến < 1ms, nhỏ hơn thời lượng handler ~2-4ms) → buộc giao cắt ở await.
Chạy: python3 scripts/test_sec_s3.py
"""
import asyncio
import json
import subprocess
import urllib.request
import urllib.error
from datetime import date, timedelta

BASE = 'http://localhost:3000'
SESSIONS = {}
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
            return e.code, {'error': f'non-json: {e.reason}'}

async def raw_call(writer, method, path, body, cookie):
    payload = json.dumps(body).encode() if body is not None else b''
    head = (f'{method} {path} HTTP/1.1\r\nHost: localhost:3000\r\n'
            f'Content-Type: application/json\r\nContent-Length: {len(payload)}\r\n'
            f'Connection: close\r\n')
    if cookie:
        head += f'Cookie: {cookie}\r\n'
    head += '\r\n'
    writer.write(head.encode() + payload)

async def race_approve(calls):
    """calls: [(method, path, body, cookie)] — ghi tất cả request trong 1 tick rồi đọc."""
    conns = [await asyncio.open_connection('localhost', 3000) for _ in calls]
    readers = [r for r, _ in conns]
    writers = [w for _, w in conns]
    # GHI ĐỒNG LOẠN — tất cả write() diễn ra trước bất kỳ await drain nào
    for i, (m, p, b, ck) in enumerate(calls):
        await raw_call(writers[i], m, p, b, ck)
    for w in writers:
        await w.drain()

    async def read_one(i):
        data = await readers[i].read(-1)
        try:
            status = int(data.split(b'\r\n', 1)[0].split(b' ')[1])
        except Exception:
            status = 0
        raw = data.split(b'\r\n\r\n', 1)[1] if b'\r\n\r\n' in data else b''
        try:
            return status, json.loads(raw.decode())
        except Exception:
            return status, {'raw': raw[:120].decode(errors='replace')}
    results = await asyncio.gather(*(read_one(i) for i in range(len(calls))))
    for w in writers:
        w.close()
    return results

def tool_json(marker, *args):
    r = subprocess.run(['bun', 'run', 'scripts/sec_tools.ts', *args],
                       capture_output=True, text=True, cwd='/home/z/my-project', timeout=120)
    for line in r.stdout.splitlines():
        if line.startswith(marker):
            return json.loads(line[len(marker):])
    return None

today = date.today()
def dow_sys(d):
    return (d.weekday() + 1) % 7

async def main():
    print('=== S3 [CAO] api/classes/[id]/enrollments — race condition sĩ số (asyncio 1-tick) ===')
    users = tool_json('SEC_EMAILS=', 'emails') or []
    email_of = lambda tag: next((u['email'] for u in users if tag in u['email']), None)

    students = ['stu1', 'stu2', 'stu3', 'stu4']
    for tag in students:
        em = email_of(tag)
        if not em:
            em = f'sec.{tag}.{today.strftime("%d%H%M%S")}@example.com'
            st, out = req('POST', '/api/auth/register', {
                'name': f'SEC {tag}', 'email': em, 'password': PW, 'role': 'STUDENT'}, role=tag)
            assert st == 200, f'đăng ký {em} thất bại'
            print(f'  đăng ký mới {em}')
        else:
            st, out = req('POST', '/api/auth/login', {'email': em, 'password': PW}, role=tag)
            assert st == 200, f'login {em} thất bại'
    print('  login 4 học sinh test OK')
    em_tutor = email_of('tutora')
    st, out = req('POST', '/api/auth/login', {'email': em_tutor, 'password': PW}, role='tutora')
    assert st == 200
    print(f'  login {em_tutor} OK')

    st, out = req('GET', '/api/subjects')
    SUBJ_ID = out[0]['id'] if isinstance(out, list) else (out.get('subjects') or [{}])[0]['id']

    # Xóa các lớp test vòng trước (nếu có) để không vướng slot
    subprocess.run(['bun', 'run', 'scripts/sec_tools.ts', 'purge-classes'],
                   capture_output=True, text=True, cwd='/home/z/my-project', timeout=60)

    verified = None
    slot_opts = [(1, '19:00', '20:00'), (2, '20:00', '21:00'), (4, '19:30', '20:30'), (5, '21:00', '22:00'), (6, '18:00', '19:00')]
    for round_i, (off, t1, t2) in enumerate(slot_opts, 1):
        st, out = req('POST', '/api/classes', {
            'title': f'SEC Race Lop A{round_i}', 'subjectId': SUBJ_ID, 'capacity': 2,
            'meetingType': 'ONLINE', 'monthlyFee': 500000,
            'schedule': [{'dayOfWeek': dow_sys(today + timedelta(days=off)), 'startTime': t1, 'endTime': t2}],
        }, role='tutora')
        if st not in (200, 201):
            print(f'  (tạo lớp vòng {round_i} lỗi: {str(out.get("error", ""))[:90]})')
            continue
        class_id = out.get('id')
        eids = []
        for r in students:
            st, out = req('POST', f'/api/classes/{class_id}/enroll', {'studentName': f'SEC {r}'}, role=r)
            if st == 200:
                eids.append((out.get('enrollment') or {}).get('id'))
        if len(eids) != 4:
            print(f'  (vòng {round_i}: enroll được {len(eids)}/4)')
            continue
        calls = [('PATCH', f'/api/classes/{class_id}/enrollments/{eid}', {'status': 'APPROVED'},
                  f"tc_session={SESSIONS['tutora']}") for eid in eids]
        res = await race_approve(calls)
        statuses = [s for s, _ in res]
        vc = tool_json('SEC_CLASS=', 'verify-class', class_id)
        print(f'  · Vòng {round_i}: 4 PATCH approve (capacity 2) → statuses={statuses}; DB: {vc}')
        if vc and vc['approved'] > vc['capacity']:
            verified = vc
            break

    if verified:
        print(f"  ✓ RACE XÁC NHẬN: APPROVED={verified['approved']} > CAPACITY={verified['capacity']} (vượt sĩ số thật)")
    else:
        print('  ✗ Không tái hiện trong 5 vòng')
    with open('scripts/logs/sec_s3_result.json', 'w') as f:
        json.dump({'S3_race_reproduced': bool(verified), 'S3_detail': verified}, f, ensure_ascii=False, indent=2)

asyncio.run(main())
