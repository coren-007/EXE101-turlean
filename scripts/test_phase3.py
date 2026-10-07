#!/usr/bin/env python3
"""Test end-to-end PHASE 3 — hoàn thiện quản lý lớp học:
  A. Sổ học phí lớp nhóm (GET/POST/DELETE + badge stats + phía học sinh)
  B. Điểm danh đi muộn (LATE)
  B2. Nghỉ buổi kèm xếp buổi DẠY BÙ (makeupForId)
  C. Ngày nghỉ lễ (sinh buổi bỏ qua + hủy buổi trúng lễ)
  D. Cảnh báo trùng lịch khi học sinh đăng ký (409 + force)
"""
import json
import urllib.request
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
def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'  ✓ {name}')
    else:
        fail += 1
        print(f'  ✗ {name} {extra}')


today = date.today()
period_now = today.strftime('%Y-%m')
period_prev = (today.replace(day=1) - timedelta(days=1)).strftime('%Y-%m')

# ===== 1. Đăng nhập =====
st, out = req('POST', '/api/auth/login', {'email': 'minhanh.tutor@example.com', 'password': '123456'}, role='tutor')
check('login gia sư Min Anh', st == 200, str(out.get('error', '')))
TUTOR_ID = out.get('id', '') or (out.get('user') or {}).get('id', '')
st, out = req('POST', '/api/auth/login', {'email': 'minhtam.parent@example.com', 'password': '123456'}, role='student')
check('login phụ huynh Minh Tâm', st == 200, str(out.get('error', '')))
st, out = req('POST', '/api/auth/login', {'email': 'hoa.parent@example.com', 'password': '123456'}, role='student2')
check('login phụ huynh Hoa', st == 200, str(out.get('error', '')))
st, out = req('POST', '/api/auth/login', {'email': 'hoanglong.tutor@example.com', 'password': '123456'}, role='tutor2')
check('login gia sư Hoàng Long', st == 200, str(out.get('error', '')))

# Dọn leftovers nếu test chạy lại mà KHÔNG reset demo (lớp test trùng lịch lần trước)
st, out = req('GET', '/api/classes/mine', role='tutor2')
for c in out.get('classes', []):
    if 'test trùng lịch' in c['title']:
        req('DELETE', f"/api/classes/{c['id']}", role='tutor2')
        print('  (đã dọn lớp test cũ)')

# ===== 2. Lấy lớp Toán 10 của gia sư =====
st, out = req('GET', '/api/classes/mine', role='tutor')
mine = out.get('classes', [])
toan10 = next((c for c in mine if 'Toán 10' in c['title']), None)
check('gia sư có Lớp Toán 10', toan10 is not None)
if not toan10:
    raise SystemExit('Thiếu dữ liệu seed')
approved = [e for e in toan10['enrollments'] if e['status'] == 'APPROVED']
check('Lớp Toán 10 có học sinh APPROVED', len(approved) >= 1)
monthlyFee = toan10.get('monthlyFee')

# ---------- A. SỔ HỌC PHÍ ----------
print('\n=== A. Sổ học phí lớp nhóm ===')
st, out = req('GET', f"/api/classes/{toan10['id']}/fees", role='tutor')
check('GET fees trả months + students + payments', st == 200 and 'months' in out and 'students' in out and 'payments' in out,
      f'st={st} err={out.get("error","")}')
check('months chứa tháng hiện tại', period_now in (out.get('months') or []))
seed_paid_now = len([p for p in out.get('payments', []) if p['period'] == period_now])
unpaid_expected = len(out.get('students', [])) - seed_paid_now

# Tìm 1 học sinh chưa đóng tháng này → ghi nhận
students = out.get('students', [])
paid_enroll_ids = {p['enrollmentId'] for p in out.get('payments', []) if p['period'] == period_now}
unpaid = next((s for s in students if s['enrollmentId'] not in paid_enroll_ids), None)
if unpaid is None and students:
    unpaid = students[0]
    # xóa dòng cũ để test create
    old = next((p for p in out['payments'] if p['enrollmentId'] == unpaid['enrollmentId'] and p['period'] == period_now), None)
    if old:
        st2, _ = req('DELETE', f"/api/classes/{toan10['id']}/fees/{old['id']}", role='tutor')
        check('DELETE dòng học phí (để test lại create)', st2 == 200)

st, out = req('POST', f"/api/classes/{toan10['id']}/fees", {
    'enrollmentId': unpaid['enrollmentId'], 'period': period_now,
    'amount': monthlyFee, 'method': 'CASH', 'note': 'test thu tiền',
}, role='tutor')
check('POST fees ghi nhận đóng tiền tháng này', st == 200 and out.get('payment', {}).get('amount') == monthlyFee,
      f'st={st} err={out.get("error","")}')

# Upsert lại với số tiền khác (miễn giảm)
st, out = req('POST', f"/api/classes/{toan10['id']}/fees", {
    'enrollmentId': unpaid['enrollmentId'], 'period': period_now,
    'amount': monthlyFee - 100000, 'method': 'BANK', 'note': 'miễn giảm',
}, role='tutor')
check('POST fees lần 2 = upsert sửa số tiền', st == 200 and out.get('payment', {}).get('amount') == monthlyFee - 100000)

# Chặn thu tháng tương lai xa
st, out = req('POST', f"/api/classes/{toan10['id']}/fees", {
    'enrollmentId': unpaid['enrollmentId'], 'period': '2027-05', 'amount': 1000,
}, role='tutor')
check('POST fees chặn tháng xa tương lai → 400', st == 400, f'st={st}')

# Học sinh không thuộc lớp
st, out = req('POST', f"/api/classes/{toan10['id']}/fees", {
    'enrollmentId': 'enrollment-khong-ton_tai', 'period': period_now, 'amount': 1000,
}, role='tutor')
check('POST fees sai enrollment → 400', st == 400)

# mine có feeUnpaidCurrent giảm sau khi thu + payments trả về
st, out = req('GET', '/api/classes/mine', role='tutor')
t10 = next((c for c in out.get('classes', []) if c['id'] == toan10['id']), None)
check('mine trả feePayments + stats.feeUnpaidCurrent', t10 is not None and 'feePayments' in t10 and 'feeUnpaidCurrent' in (t10.get('stats') or {}))
check('feeUnpaidCurrent đúng sau khi thu thêm 1 người', (t10['stats']['feeUnpaidCurrent']) == max(0, unpaid_expected - 1) if unpaid_expected else True,
      f'got={t10["stats"]["feeUnpaidCurrent"]} expected={max(0, (unpaid_expected or 1) - 1)}')

# Phía học sinh: enrollments/mine có fees (currentPaid + payments)
st, out = req('GET', '/api/enrollments/mine', role='student2')
enr = next((e for e in out.get('enrollments', []) if e['class']['id'] == toan10['id'] and e['status'] == 'APPROVED'), None)
check('enrollments/mine trả fees cho học sinh trong lớp', enr is not None and 'fees' in enr,
      f'enr={enr is not None} fees={"fees" in (enr or {})}')
if enr and enr.get('fees'):
    check('fees.currentPaid đúng (người vừa thu) hoặc các học sinh khác', isinstance(enr['fees'].get('currentPaid'), bool))

# DELETE dòng vừa tạo
pid = None
st, out = req('GET', f"/api/classes/{toan10['id']}/fees", role='tutor')
pid = next((p['id'] for p in out.get('payments', []) if p['enrollmentId'] == unpaid['enrollmentId'] and p['period'] == period_now), None)
st, out = req('DELETE', f"/api/classes/{toan10['id']}/fees/{pid}", role='tutor')
check('DELETE fees xóa dòng ghi nhận', st == 200, f'st={st}')

# Học sinh không được gọi fees
st, out = req('GET', f"/api/classes/{toan10['id']}/fees", role='student2')
check('GET fees chặn học sinh (403)', st == 403)

# ---------- B. ĐIỂM DANH ĐI MUỘN ----------
print('\n=== B. Điểm danh đi muộn (LATE) ===')
# Ưu tiên buổi SCHEDULED đã qua giờ bắt đầu; không có thì sửa điểm danh buổi COMPLETED
started = next((s for s in toan10['sessions'] if s['status'] == 'SCHEDULED' and s['date'] < today.isoformat()), None)
completed = next((s for s in toan10['sessions'] if s['status'] == 'COMPLETED'), None)
target_session = started or completed
check('có buổi để điểm danh (SCHEDULED đã bắt đầu hoặc COMPLETED)', target_session is not None)
if target_session:
    rows = [{'studentParentId': e['parent']['id'], 'status': 'LATE'} for e in approved[:1]]
    rows += [{'studentParentId': e['parent']['id'], 'status': 'PRESENT'} for e in approved[1:]]
    st, out = req('POST', f"/api/classes/{toan10['id']}/sessions/{target_session['id']}/attendance", {'attendance': rows}, role='tutor')
    check('POST attendance với LATE thành công', st == 200 and out.get('summary', {}).get('late', 0) >= 1,
          f'st={st} summary={out.get("summary")}')
    check('message có chữ "muộn"', 'muộn' in out.get('message', ''), out.get('message', ''))

    st, out = req('GET', '/api/enrollments/mine', role='student2')
    enr2 = next((e for e in out.get('enrollments', []) if e['class']['id'] == toan10['id'] and e['status'] == 'APPROVED'), None)
    check('enrollments/mine attendance có trường late', enr2 is not None and 'late' in (enr2.get('attendance') or {}))
    check('tổng attended = present + late + absent', enr2 is not None and enr2['attendance']['total'] ==
          enr2['attendance']['present'] + enr2['attendance'].get('late', 0) + enr2['attendance']['absent'])

# ---------- B2. NGHỈ BUỔI + DẠY BÙ ----------
print('\n=== B2. Nghỉ buổi kèm dạy bù ===')
future = next((s for s in toan10['sessions'] if s['status'] == 'SCHEDULED' and s['date'] >= today.isoformat() and not s.get('makeupForId')), None)
check('có buổi tương lai để nghỉ + xếp bù', future is not None)
if future:
    makeup_date = (today + timedelta(days=10)).isoformat()
    st, out = req('PATCH', f"/api/classes/{toan10['id']}/sessions/{future['id']}", {
        'action': 'cancel', 'reason': 'test nghỉ buổi có bù',
        'makeup': {'date': makeup_date, 'startTime': future['startTime'], 'endTime': future['endTime']},
    }, role='tutor')
    check('PATCH cancel + makeup tạo buổi bù', st == 200 and out.get('makeupSession', {}).get('makeupForId') == future['id'],
          f'st={st} err={out.get("error","")}')
    check('message nhắc DẠY BÙ', 'DẠY BÙ' in out.get('message', ''))

    st, out = req('GET', '/api/classes/mine', role='tutor')
    t10 = next((c for c in out.get('classes', []) if c['id'] == toan10['id']), None)
    mk = next((s for s in t10['sessions'] if s.get('makeupForId') == future['id']), None)
    check('mine trả buổi bù với makeupForId', mk is not None)

    # Phía học sinh cũng thấy buổi bù
    st, out = req('GET', '/api/enrollments/mine', role='student2')
    enr3 = next((e for e in out.get('enrollments', []) if e['class']['id'] == toan10['id'] and e['status'] == 'APPROVED'), None)
    mk2 = next((s for s in (enr3['class'].get('sessions') or []) if s.get('makeupForId') == future['id']), None)
    check('phía học sinh thấy buổi bù (makeupForId)', mk2 is not None)

    # Xếp bù trùng buổi khác → 409
    st, out = req('PATCH', f"/api/classes/{toan10['id']}/sessions/{future['id']}", {
        'action': 'cancel', 'reason': 'thử xếp bù trùng',
        'makeup': {'date': makeup_date, 'startTime': future['startTime'], 'endTime': future['endTime']},
    }, role='tutor')
    # buổi gốc giờ đã CANCELLED → phải bị chặn trước khi tới logic makeup
    check('cancel lần 2 buổi đã nghỉ → 400', st == 400, f'st={st}')

# ---------- C. NGÀY NGHỈ LỄ ----------
print('\n=== C. Ngày nghỉ lễ ===')
st, out = req('GET', '/api/holidays', role='tutor')
check('GET /api/holidays (tutor)', st == 200 and len(out.get('holidays', [])) >= 1)
st, out = req('GET', '/api/holidays', role='student2')
check('GET /api/holidays (student)', st == 200)

# Thêm 1 ngày lễ mới trúng buổi tương lai của lớp (refetch để không dùng dữ liệu cũ)
st, out = req('GET', '/api/classes/mine', role='tutor')
t10f = next((c for c in out.get('classes', []) if c['id'] == toan10['id']), None)
future2 = next((s for s in t10f['sessions'] if s['status'] == 'SCHEDULED' and s['date'] >= today.isoformat() and not s.get('makeupForId')), None)
if future2:
    st, out = req('POST', '/api/holidays', {'date': future2['date'], 'name': 'Lễ test tự động'}, role='tutor')
    check('POST holiday trúng buổi → buổi bị hủy + đếm sessionsCancelled',
          st == 200 and out.get('sessionsCancelled', 0) >= 1, f'st={st} out={out}')
    test_holiday_id = out.get('holiday', {}).get('id')

    st, out = req('GET', '/api/classes/mine', role='tutor')
    t10 = next((c for c in out.get('classes', []) if c['id'] == toan10['id']), None)
    s2 = next((s for s in t10['sessions'] if s['id'] == future2['id']), None)
    check('buổi trúng lễ chuyển CANCELLED + note "Nghỉ lễ"', s2['status'] == 'CANCELLED' and 'Nghỉ lễ' in (s2.get('note') or ''))

    # Xóa ngày lễ test
    st, out = req('DELETE', f"/api/holidays/{test_holiday_id}", role='tutor')
    check('DELETE holiday', st == 200)
else:
    print('  (bỏ qua — không còn buổi tương lai nào)')

# Sinh buổi mới KHÔNG rơi vào ngày lễ
st, out = req('GET', '/api/holidays', role='tutor')
holiday_dates = {h['date'] for h in out.get('holidays', [])}
st, out = req('GET', '/api/classes/mine', role='tutor')
t10 = next((c for c in out.get('classes', []) if c['id'] == toan10['id']), None)
scheduled_dates = {s['date'] for s in t10['sessions'] if s['status'] == 'SCHEDULED'}
overlap = scheduled_dates & holiday_dates
check('không còn buổi SCHEDULED nào trùng ngày lễ', len(overlap) == 0, f'trùng: {overlap}')

# Học sinh không được thêm lễ
st, out = req('POST', '/api/holidays', {'date': (today + timedelta(days=30)).isoformat(), 'name': 'Lễ lạ'}, role='student2')
check('POST holiday chặn học sinh (403)', st == 403)

# ---------- D. CẢNH BÁO TRÙNG LỊCH KHI ĐĂNG KÝ ----------
print('\n=== D. Cảnh báo trùng lịch khi đăng ký ===')
# Tạo lớp MỚI của gia sư khác trùng khung giờ Lớp Toán 10 (T2 18:00–20:30)
# → phụ huynh Hoa (đang APPROVED trong Toán 10) đăng ký sẽ bị cảnh báo 409
st, out = req('GET', '/api/tutors/me/subjects', role='tutor2')
subj2 = (out.get('subjects') or [{}])[0]
st, out = req('POST', '/api/classes', {
    'title': 'Lớp test trùng lịch (tự xóa)',
    'subjectId': (subj2.get('subject') or {}).get('id') or subj2.get('subjectId'),
    'capacity': 5, 'monthlyFee': 1500000,
    'schedule': [{'dayOfWeek': 2, 'startTime': '18:00', 'endTime': '20:30'}],
}, role='tutor2')
check('tạo lớp test trùng lịch OK', st in (200, 201) and out.get('id'), f'st={st} err={out.get("error", "")}')
conflict_cls = out if st in (200, 201) and out.get('id') else None

if conflict_cls:
    st, out = req('POST', f"/api/classes/{conflict_cls['id']}/enroll", {'note': 'test trùng lịch'}, role='student2')
    check('enroll trùng lịch → 409 + danh sách conflicts', st == 409 and len(out.get('conflicts', [])) >= 1,
          f'st={st} err={out.get("error", "")[:80]}')
    check('conflict nhắc đúng lớp đang học (Toán 10)', any('Toán 10' in c for c in out.get('conflicts', [])),
          str(out.get('conflicts'))[:120])
    # force=true → được đăng ký
    st, out = req('POST', f"/api/classes/{conflict_cls['id']}/enroll", {'note': 'test trùng lịch', 'force': True}, role='student2')
    check('enroll force=true → 200 đăng ký thành công', st == 200, f'st={st} err={out.get("error","")}')
    # rút đăng ký + xóa lớp test để dữ liệu sạch
    st, out = req('GET', '/api/enrollments/mine', role='student2')
    enr4 = next((e for e in out.get('enrollments', []) if e['class']['id'] == conflict_cls['id'] and e['status'] in ('PENDING', 'WAITLIST')), None)
    if enr4:
        st, out = req('PATCH', f"/api/classes/{conflict_cls['id']}/enrollments/{enr4['id']}", {'status': 'CANCELLED'}, role='student2')
        check('rút đăng ký test (dọn dữ liệu)', st == 200)
    st, out = req('DELETE', f"/api/classes/{conflict_cls['id']}", role='tutor2')
    check('xóa lớp test trùng lịch', st == 200, f'st={st} err={out.get("error", "")}')
else:
    print('  (bỏ qua — không tạo được lớp test)')

# ===== KẾT QUẢ =====
print(f'\n{"="*50}\nKẾT QUẢ: {ok} PASS · {fail} FAIL')
raise SystemExit(1 if fail else 0)
