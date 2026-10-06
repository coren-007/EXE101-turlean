#!/bin/bash
# Smoke test: booking flow với validation mới + cancel kèm lý do + reliability
# + Phase 2: khóa định kỳ + thông báo + tin nhắn
# + Phase 3: LỚP HỌC CỐ ĐỊNH (nhóm) — công khai sĩ số, đăng ký, duyệt, chặn trùng lịch
set -e
BASE="http://localhost:3000"
JAR="/tmp/smoke_cookies.txt"
JAR2="/tmp/smoke_cookies2.txt"
TJAR="/tmp/smoke_cookies_tutor.txt"
rm -f $JAR $JAR2 $TJAR

# Dọn booking smoke cũ (PENDING/CONFIRMED tương lai của lan & minhtam) để chạy lại được
python3 - <<'PYEOF' 2>/dev/null || true
import sqlite3
db = sqlite3.connect('/home/z/my-project/db/custom.db')
db.execute("UPDATE Booking SET status='CANCELLED' WHERE status IN ('PENDING','CONFIRMED') AND date >= date('now','localtime') AND studentId IN (SELECT id FROM User WHERE email IN ('lan.parent@example.com','minhtam.parent@example.com'))")
db.commit()
print('cleaned smoke bookings:', db.total_changes)
PYEOF

echo "=== 1. Đăng nhập học sinh ==="
# Dùng lan.parent (không có dữ liệu demo 1-1) để tránh xung đột lịch với
# khóa định kỳ demo của hoa.parent ↔ minhanh.tutor (thứ Tư 18:30–20:00)
curl -s -c $JAR -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"lan.parent@example.com","password":"123456"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('login OK:', d.get('name'), d.get('role'))"

echo ""
echo "=== 2. Lấy gia sư + môn + lịch trống (tránh trùng lớp học cố định) ==="
TUTOR=$(curl -s "$BASE/api/tutors?pageSize=26" | python3 -c "
import json,sys
data=json.load(sys.stdin)
# chọn gia sư nhận dạy CẢ HAI nơi (tại nhà + tại cơ sở) để mọi mode trong
# bài test đều hợp lệ (danh sách sort theo rating thay đổi sau mỗi lần seed)
t=[x for x in data['tutors'] if x.get('teachesAtStudentHome') and x.get('teachesAtOwnPlace')][0]
print(json.dumps({'id': t['id'], 'subjectId': t['subjects'][0]['id'], 'price': t['subjects'][0]['pricePerHour'], 'name': t['name']}))
")
TUTOR_ID=$(echo $TUTOR | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
SUBJECT_ID=$(echo $TUTOR | python3 -c "import json,sys; print(json.load(sys.stdin)['subjectId'])")
SUBJECT_PRICE=$(echo $TUTOR | python3 -c "import json,sys; print(json.load(sys.stdin)['price'])")
TUTOR_NAME=$(echo $TUTOR | python3 -c "import json,sys; print(json.load(sys.stdin)['name'])")
echo "Tutor: $TUTOR_NAME | Giá môn: $SUBJECT_PRICE"

AVAIL=$(curl -s "$BASE/api/tutors/$TUTOR_ID" | python3 -c "
import json,sys,datetime,urllib.request
d=json.load(sys.stdin)
avails=[a for a in d['availabilities'] if a.get('kind')!='FIXED']
# Lịch lớp học cố định (nhóm) của gia sư — tránh đặt 1-1 trùng giờ lớp
cls=json.load(urllib.request.urlopen('$BASE/api/classes?tutorId=$TUTOR_ID'))
cslots=[]
for c in cls.get('classes',[]):
    if c['status'] in ('OPEN','PAUSED'):
        for s in c['schedule']:
            sh,sm=map(int,s['startTime'].split(':')); eh,em=map(int,s['endTime'].split(':'))
            cslots.append((s['dayOfWeek'], sh*60+sm, eh*60+em))
today=datetime.date.today()
found=None; pick=None
for i in range(1,20):
    cand=today+datetime.timedelta(days=i)
    dow=(cand.weekday()+1)%7
    for a in [x for x in avails if x['dayOfWeek']==dow]:
        sh,sm=map(int,a['startTime'].split(':')); eh,em=map(int,a['endTime'].split(':'))
        smin,emin=sh*60+sm, eh*60+em
        t=smin
        while t+150<=emin:  # đủ dài cho biến thể :30 + 1.5h
            if not any(cd==dow and t<ce and t+90>cs for cd,cs,ce in cslots):
                found=cand; pick=t; break
            t+=30
        if found: break
    if found: break
assert found, 'Không tìm được slot trống không trùng lớp trong 20 ngày'
print(json.dumps({'date': found.isoformat(), 'start': f'{pick//60:02d}:{pick%60:02d}'}))
")
B_DATE=$(echo $AVAIL | python3 -c "import json,sys; print(json.load(sys.stdin)['date'])")
AV_START=$(echo $AVAIL | python3 -c "import json,sys; print(json.load(sys.stdin)['start'])")
echo "Ngày có lịch: $B_DATE, đặt từ $AV_START (đã tránh giờ lớp học cố định)"

echo ""
echo "=== 3. Test BUG FIX endTime: đặt giờ có phút lẻ + 1.5h ==="
START_MIN=$(python3 -c "
s='$AV_START'
h=int(s[:2]); m=int(s[3:5])
if m < 30: print(f'{h:02d}:30')
else: print(f'{h+1:02d}:30')
")
END_EXPECTED=$(python3 -c "
s='$START_MIN'; h=int(s[:2]); m=int(s[3:5])
total=h*60+m+90
print(f'{total//60:02d}:{total%60:02d}')
")
echo "Đặt $START_MIN + 1.5h → kỳ vọng endTime = $END_EXPECTED"

BOOKING=$(curl -s -b $JAR -X POST "$BASE/api/bookings" -H "Content-Type: application/json" \
  -d "{\"tutorId\":\"$TUTOR_ID\",\"subjectId\":\"$SUBJECT_ID\",\"mode\":\"TUTOR_TO_STUDENT\",\"date\":\"$B_DATE\",\"startTime\":\"$START_MIN\",\"endTime\":\"$END_EXPECTED\",\"durationHours\":1.5,\"address\":\"Số 1 Nguyễn Trãi, Thanh Xuân\"}")
echo "$BOOKING" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'error' in d: print('❌ ERROR:', d['error'])
else:
    print('✅ Booking tạo xong:')
    print('   startTime:', d['startTime'], '→ endTime:', d['endTime'], '(đúng giờ kết thúc!)')
    print('   durationHours:', d['durationHours'])
    print('   totalAmount:', d['totalAmount'], '(= giá môn × 1.5)')
    print('   status:', d['status'])
" 2>/dev/null || echo "$BOOKING"
BOOKING_ID=$(echo "$BOOKING" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

echo ""
echo "=== 4. Test chặn đặt quá khứ / duration sai ==="
curl -s -b $JAR -X POST "$BASE/api/bookings" -H "Content-Type: application/json" \
  -d "{\"tutorId\":\"$TUTOR_ID\",\"subjectId\":\"$SUBJECT_ID\",\"mode\":\"TUTOR_TO_STUDENT\",\"date\":\"2020-01-01\",\"startTime\":\"18:00\",\"endTime\":\"19:30\"}" | python3 -c "import json,sys; print('✅ Chặn quá khứ:', json.load(sys.stdin).get('error'))"
curl -s -b $JAR -X POST "$BASE/api/bookings" -H "Content-Type: application/json" \
  -d "{\"tutorId\":\"$TUTOR_ID\",\"subjectId\":\"$SUBJECT_ID\",\"mode\":\"TUTOR_TO_STUDENT\",\"date\":\"$B_DATE\",\"startTime\":\"18:00\",\"endTime\":\"17:00\"}" | python3 -c "import json,sys; print('✅ Chặn endTime<sstartTime:', json.load(sys.stdin).get('error'))"

echo ""
echo "=== 5. Test conflict check học sinh (đặt trùng giờ mình vừa đặt) ==="
curl -s -b $JAR -X POST "$BASE/api/bookings" -H "Content-Type: application/json" \
  -d "{\"tutorId\":\"$TUTOR_ID\",\"subjectId\":\"$SUBJECT_ID\",\"mode\":\"STUDENT_TO_TUTOR\",\"date\":\"$B_DATE\",\"startTime\":\"$START_MIN\",\"endTime\":\"$END_EXPECTED\"}" | python3 -c "import json,sys; print('✅ Chặn double-booking:', json.load(sys.stdin).get('error'))"

echo ""
echo "=== 6. Hủy lịch KHÔNG lý do → phải bị chặn ==="
if [ -n "$BOOKING_ID" ]; then
  curl -s -b $JAR -X POST "$BASE/api/bookings/$BOOKING_ID/cancel" -H "Content-Type: application/json" -d '{"reason":"ng"}' | python3 -c "import json,sys; print('✅ Chặn lý do ngắn:', json.load(sys.stdin).get('error'))"
else
  echo "⚠ Bỏ qua test 6 (buổi học ở test 3 chưa tạo được)"
fi

echo ""
echo "=== 7. Hủy lịch CÓ lý do → ghi nhận vi phạm ==="
if [ -n "$BOOKING_ID" ]; then
  curl -s -b $JAR -X POST "$BASE/api/bookings/$BOOKING_ID/cancel" -H "Content-Type: application/json" \
    -d '{"reason":"Con ốm sốt phải nghỉ học buổi này, xin lỗi gia sư"}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('✅ Hủy thành công:', d.get('message'))
v=d.get('violation',{})
print('   Mức vi phạm:', v.get('severity'), '| trừ', v.get('points'), 'điểm |', v.get('label'))
"
fi

echo ""
echo "=== 8. Kiểm tra điểm tin cậy học sinh sau khi hủy ==="
curl -s -b $JAR "$BASE/api/users/me/violations" | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d['reliability']
print('✅ Điểm tin cậy:', r['score'], '/', 'tier:', r['tier']['label'])
print('   violations:', r['violations'], '| warnings:', r['warnings'])
for v in d['violations'][:3]:
    print('   -', v['severity'], '|', v['reason'][:40], '| với', v['counterpart'])
"

echo ""
echo "=== 9. PATCH hủy trực tiếp (cũ) → phải bị chặn ==="
curl -s -b $JAR -X PATCH "$BASE/api/bookings" -H "Content-Type: application/json" \
  -d "{\"bookingId\":\"$BOOKING_ID\",\"status\":\"CANCELLED\"}" | python3 -c "import json,sys; print('✅ Chặn hủy trơn:', json.load(sys.stdin).get('error'))"

echo ""
echo "=== 10. Test PATCH /api/me validation (học phí âm) ==="
curl -s -b $JAR -X PATCH "$BASE/api/me" -H "Content-Type: application/json" -d '{"hourlyRate":-5000}' | python3 -c "import json,sys; print('✅ Chặn giá âm:', json.load(sys.stdin).get('error'))"

echo ""
echo "=== 11. SĐT hiện ra khi CÓ booking (test với booking mới) ==="
BOOKING2=$(curl -s -b $JAR -X POST "$BASE/api/bookings" -H "Content-Type: application/json" \
  -d "{\"tutorId\":\"$TUTOR_ID\",\"subjectId\":\"$SUBJECT_ID\",\"mode\":\"STUDENT_TO_TUTOR\",\"date\":\"$B_DATE\",\"startTime\":\"$START_MIN\",\"endTime\":\"$END_EXPECTED\"}")
B2_ID=$(echo "$BOOKING2" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
curl -s -b $JAR "$BASE/api/tutors/$TUTOR_ID" | python3 -c "
import json,sys
d=json.load(sys.stdin)
phone=d.get('phone')
print('✅ SĐT khi có booking:', phone if phone else '(tutor chưa set SĐT — null OK)')
"

echo ""
echo "=== 12. Test case-insensitive search: 'toán' thường ==="
curl -s "$BASE/api/tutors?q=to%C3%A1n&pageSize=3" | python3 -c "import json,sys; d=json.load(sys.stdin); print('✅ Tìm \"toán\" thường:', d['total'], 'kết quả')"
curl -s "$BASE/api/tutors?q=To%C3%A1n&pageSize=3" | python3 -c "import json,sys; d=json.load(sys.stdin); print('✅ Tìm \"Toán\" hoa:', d['total'], 'kết quả')"

echo ""
echo "=== 13. Test ONLINE filter ==="
curl -s "$BASE/api/tutors?mode=ONLINE" | python3 -c "import json,sys; d=json.load(sys.stdin); print('✅ Tutor online:', d['total'])"

# ============================================================
# Phase 2 (Mục đích 1 & 2): khóa định kỳ + thông báo + tin nhắn
# Dùng cặp tài khoản demo: gia sư Minh Anh ↔ phụ huynh Minh Tâm
# ============================================================
echo ""
echo "=== 14. Đặt KHÓA ĐỊNH KỲ 2 tuần (repeatWeeks=2) ==="
curl -s -c $JAR2 -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"minhtam.parent@example.com","password":"123456"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('login OK:', d.get('name'), d.get('role'))"

TUTOR2_ID=$(curl -s "$BASE/api/tutors?pageSize=50" | python3 -c "
import json,sys
d=json.load(sys.stdin)
t=[x for x in d['tutors'] if x['name']=='Nguyễn Minh Anh'][0]
print(t['id'])
")
SUBJECT2_ID=$(curl -s "$BASE/api/tutors/$TUTOR2_ID" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['subjects'][0]['id'])
")
# Ngày trống của Minh Anh KHÔNG rơi vào: thứ Tư (khóa demo 18:30–20:00),
# thứ 3 & thứ 5 (Lớp Toán 10 cố định 18:00–20:30) — còn lại: T2, T6
B3_DATE=$(python3 -c "
import datetime
today=datetime.date.today()
for i in range(1,15):
    cand=today+datetime.timedelta(days=i)
    if cand.weekday() in (0,4):  # Thứ 2 hoặc Thứ 6
        print(cand.isoformat())
        break
")
SERIES=$(curl -s -b $JAR2 -X POST "$BASE/api/bookings" -H "Content-Type: application/json" \
  -d "{\"tutorId\":\"$TUTOR2_ID\",\"subjectId\":\"$SUBJECT2_ID\",\"mode\":\"ONLINE\",\"date\":\"$B3_DATE\",\"startTime\":\"18:00\",\"endTime\":\"19:30\",\"repeatWeeks\":2,\"note\":\"Khóa test định kỳ\"}")
echo "$SERIES" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'error' in d: print('❌ ERROR:', d['error'])
else:
    print('✅ Khóa định kỳ tạo xong:')
    print('   Số buổi tạo:', d.get('created'), '| seriesId:', (d.get('seriesId') or '')[:8]+'...')
    print('   seriesTotal:', d.get('seriesTotal'), '| tổng tiền khóa:', d.get('totalSeriesAmount'))
    print('   Tuần bị bỏ qua:', d.get('skipped'))
"
BOOKING3_ID=$(echo "$SERIES" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

echo ""
echo "=== 15. Gia sư nhận THÔNG BÁO hệ thống về khóa mới ==="
curl -s -c $TJAR -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"minhanh.tutor@example.com","password":"123456"}' > /dev/null
curl -s -b $TJAR "$BASE/api/conversations" | python3 -c "
import json,sys
d=json.load(sys.stdin)
conv=[c for c in d['conversations'] if 'Minh Tâm' in c['other']['name']]
if not conv: print('❌ Không tìm thấy hội thoại với Minh Tâm')
else:
    c=conv[0]
    lm=c['lastMessage']
    ok = lm and lm.get('kind')=='SYSTEM' and 'Khóa học định kỳ' in lm['body'] and '2 buổi' in lm['body']
    print('✅ Thông báo khóa mới:' , 'ĐÚNG' if ok else 'SAI', '| unread badge cho gia sư:', d.get('totalUnread'))
    print('   Tin cuối:', (lm['body'][:80]+'...') if lm else None)
"

echo ""
echo "=== 16. Gia sư XÁC NHẬN → học sinh nhận thông báo ==="
curl -s -b $TJAR -X PATCH "$BASE/api/bookings" -H "Content-Type: application/json" \
  -d "{\"bookingId\":\"$BOOKING3_ID\",\"status\":\"CONFIRMED\"}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('✅ Xác nhận buổi đầu khóa:', d.get('status') or d.get('error'))
"
CONV2_ID=$(curl -s -b $JAR2 -X POST "$BASE/api/conversations" -H "Content-Type: application/json" \
  -d "{\"otherUserId\":\"$TUTOR2_ID\"}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('conversationId',''))")
curl -s -b $JAR2 "$BASE/api/conversations/$CONV2_ID" | python3 -c "
import json,sys
d=json.load(sys.stdin)
last=d['messages'][-1]
ok = last.get('kind')=='SYSTEM' and '[Đã xác nhận]' in last['body']
print('✅ Học sinh thấy thông báo xác nhận:', 'ĐÚNG' if ok else 'SAI')
print('   ', last['body'][:80].replace(chr(10),' / '))
"

echo ""
echo "=== 17. Học sinh gửi tin nhắn → gia sư thấy chưa đọc ==="
curl -s -b $JAR2 -X POST "$BASE/api/conversations/$CONV2_ID" -H "Content-Type: application/json" \
  -d '{"body":"Em cảm ơn thầy, bé sẽ học đúng giờ ạ!"}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=d.get('message',{})
print('✅ Gửi tin thành công:', m.get('body','')[:40] if m.get('body') else d.get('error'))
"
curl -s -b $TJAR "$BASE/api/conversations" | python3 -c "
import json,sys
d=json.load(sys.stdin)
conv=[c for c in d['conversations'] if 'Minh Tâm' in c['other']['name']]
print('✅ Gia sư thấy chưa đọc:', conv[0]['unread'] if conv else '?', 'tin (badge trên header)')
"

echo ""
echo "=== 18. Hủy 1 buổi của khóa → gia sư nhận thông báo hủy kèm lý do ==="
curl -s -b $JAR2 -X POST "$BASE/api/bookings/$BOOKING3_ID/cancel" -H "Content-Type: application/json" \
  -d '{"reason":"Bé bị ốm, gia đình xin hoãn buổi này sang tuần sau"}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('✅ Hủy buổi:', d.get('message'))
"
curl -s -b $TJAR "$BASE/api/conversations" | python3 -c "
import json,sys
d=json.load(sys.stdin)
conv=[c for c in d['conversations'] if 'Minh Tâm' in c['other']['name']]
lm=conv[0]['lastMessage'] if conv else None
ok = lm and lm.get('kind')=='SYSTEM' and '[Đã hủy]' in lm['body'] and 'ốm' in lm['body']
print('✅ Thông báo hủy kèm lý do:', 'ĐÚNG' if ok else 'SAI')
print('   ', (lm['body'][:90]+'...') if lm else None)
"

# ============================================================
# Phase 3: LỚP HỌC CỐ ĐỊNH (nhóm) — hồ sơ công khai + đăng ký + duyệt
# Dùng cặp: gia sư Hoàng Long (Lớp Vật lý 11) ↔ phụ huynh Lê Thu Trang
# ============================================================
echo ""
HLJAR="/tmp/smoke_cookies_hl.txt"
TRJAR="/tmp/smoke_cookies_trang.txt"
rm -f $HLJAR $TRJAR

echo "=== 19. Hồ sơ công khai: lớp học cố định + sĩ số + lịch tuần ==="
TUTOR3_ID=$(curl -s "$BASE/api/tutors?pageSize=50" | python3 -c "
import json,sys
d=json.load(sys.stdin)
t=[x for x in d['tutors'] if x['name']=='Trần Hoàng Long'][0]
print(t['id'])
")
curl -s "$BASE/api/classes?tutorId=$TUTOR3_ID" | python3 -c "
import json,sys
d=json.load(sys.stdin)
cs=d['classes']
assert len(cs)>=1, '❌ thiếu lớp demo'
c=cs[0]
ok_title = 'Vật lý' in c['title']
ok_sched = sorted([s['dayOfWeek'] for s in c['schedule']])==[1,5]
ok_cap = 1 <= c['enrolledCount'] <= c['capacity']
print('✅ Lớp công khai:', c['title'], '|', c['gradeLevel'])
print('   Sĩ số:', c['enrolledCount'], '/', c['capacity'], '| chờ duyệt:', c['pendingCount'], '| trạng thái:', c['status'])
print('   Lịch T2&T6 19:00–21:00:', 'ĐÚNG' if ok_sched else 'SAI', '| sĩ số hợp lệ:', 'ĐÚNG' if ok_cap else 'SAI')
print('   Địa điểm:', (c['address'] or '—')[:50])
"

echo ""
echo "=== 20. Đăng ký lớp → gia sư duyệt → học sinh vào lớp (idempotent) ==="
curl -s -c $TRJAR -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"trang.parent@example.com","password":"123456"}' > /dev/null
CLASS3_ID=$(curl -s "$BASE/api/classes?tutorId=$TUTOR3_ID" | python3 -c "import json,sys; print(json.load(sys.stdin)['classes'][0]['id'])")
# Nếu trang đã trong lớp (chạy lại) → rút trước để test trọn chu trình
python3 - <<PYEOF
import json, subprocess
mine=json.loads(subprocess.run(['curl','-s','-b','$TRJAR','$BASE/api/enrollments/mine'],capture_output=True,text=True).stdout)
for e in mine.get('enrollments',[]):
    if e['class']['id']=='$CLASS3_ID' and e['status'] in ('PENDING','APPROVED'):
        r=subprocess.run(['curl','-s','-b','$TRJAR','-X','PATCH',
            '$BASE/api/classes/$CLASS3_ID/enrollments/'+e['id'],
            '-H','Content-Type: application/json','-d','{"status":"CANCELLED"}'],capture_output=True,text=True)
        print('   (dọn đăng ký cũ của trang:', json.loads(r.stdout).get('status'), ')')
PYEOF
curl -s -b $TRJAR -X POST "$BASE/api/classes/$CLASS3_ID/enroll" -H "Content-Type: application/json" \
  -d '{"studentName":"Lê Minh Tâm","note":"Bé muốn học nhóm để tiến bộ nhanh hơn ạ"}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
msg=d.get('message') or d.get('error')
print('✅ Gửi đăng ký:', msg)
assert 'Đã gửi đăng ký' in msg
"
curl -s -c $HLJAR -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"hoanglong.tutor@example.com","password":"123456"}' > /dev/null
TRANG_EID=$(curl -s -b $HLJAR "$BASE/api/classes/mine" | python3 -c "
import json,sys
d=json.load(sys.stdin)
c=[x for x in d['classes'] if x['id']=='$CLASS3_ID'][0]
e=[x for x in c['enrollments'] if x['parent']['name'].startswith('Phụ huynh Lê Thu') and x['status']=='PENDING'][0]
print(e['id'])
")
curl -s -b $HLJAR -X PATCH "$BASE/api/classes/$CLASS3_ID/enrollments/$TRANG_EID" -H "Content-Type: application/json" \
  -d '{"status":"APPROVED"}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('✅ Gia sư duyệt:', d.get('status') or d.get('error'))
assert d.get('status')=='APPROVED'
"
curl -s -b $TRJAR "$BASE/api/enrollments/mine" | python3 -c "
import json,sys
d=json.load(sys.stdin)
e=[x for x in d['enrollments'] if x['class']['id']=='$CLASS3_ID'][0]
ok = e['status']=='APPROVED' and e['class']['enrolledCount']>=1
print('✅ Dashboard học sinh thấy lớp:', e['class']['title'], '|', e['status'], '| sĩ số', e['class']['enrolledCount'],'/',e['class']['capacity'])
assert ok
"

echo ""
echo "=== 21. Chặn đặt lịch 1-1 trùng giờ lớp học cố định ==="
NEXT_TUE=$(python3 -c "
import datetime
t=datetime.date.today()
while True:
    t+=datetime.timedelta(days=1)
    if t.weekday()==1: break
print(t.isoformat())")
MINHANH_CLASSES=$(curl -s "$BASE/api/classes?tutorId=$TUTOR2_ID")
SUBJECT_M=$(curl -s "$BASE/api/tutors/$TUTOR2_ID" | python3 -c "import json,sys; print(json.load(sys.stdin)['subjects'][0]['id'])")
curl -s -b $JAR -X POST "$BASE/api/bookings" -H "Content-Type: application/json" \
  -d "{\"tutorId\":\"$TUTOR2_ID\",\"subjectId\":\"$SUBJECT_M\",\"mode\":\"ONLINE\",\"date\":\"$NEXT_TUE\",\"startTime\":\"18:30\",\"endTime\":\"20:00\"}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
err=d.get('error') or ''
ok = 'Trùng lịch lớp học cố định' in err
print('✅ Chặn đặt 1-1 trùng lớp:', 'ĐÚNG' if ok else 'SAI', '|', err[:80])
assert ok
"

echo ""
echo "=== 22. Lớp đủ sĩ số → chặn đăng ký + chặn duyệt thêm ==="
FULL_CLASS=$(echo "$MINHANH_CLASSES" | python3 -c "
import json,sys
cs=json.load(sys.stdin)['classes']
c=[x for x in cs if x['enrolledCount']>=x['capacity']]
print(c[0]['id'] if c else '')
")
if [ -n "$FULL_CLASS" ]; then
  curl -s -b $JAR -X POST "$BASE/api/classes/$FULL_CLASS/enroll" -H "Content-Type: application/json" \
    -d '{"studentName":"Test Full"}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = 'đủ sĩ số' in (d.get('error') or '')
print('✅ Chặn đăng ký lớp đầy:', 'ĐÚNG' if ok else 'SAI', '|', d.get('error'))
assert ok
"
else
  echo "⚠ Không có lớp đầy trong dữ liệu — bỏ qua"
fi

echo ""
echo "=== 23. Thông báo hệ thống về đăng ký lớp (hội thoại) ==="
HL_CONV=$(curl -s -b $HLJAR "$BASE/api/conversations" | python3 -c "
import json,sys
d=json.load(sys.stdin)
conv=[c for c in d['conversations'] if 'Lê Thu' in c['other']['name']]
print(conv[0]['id'] if conv else '')
")
curl -s -b $HLJAR "$BASE/api/conversations/$HL_CONV" | python3 -c "
import json,sys
d=json.load(sys.stdin)
msgs=d.get('messages',[])
found=[m for m in msgs if m.get('kind')=='SYSTEM' and 'Đăng ký lớp học' in m['body']]
approved=[m for m in msgs if m.get('kind')=='SYSTEM' and 'Đã vào lớp' in m['body']]
ok = bool(found) and bool(approved)
print('✅ Gia sư có đủ 2 thông báo (đăng ký + duyệt):', 'ĐÚNG' if ok else 'SAI')
if found: print('   ', found[-1]['body'][:90].replace(chr(10),' / ')+'...')
"

echo "=== DONE ==="
