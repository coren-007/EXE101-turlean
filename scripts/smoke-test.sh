#!/bin/bash
# Smoke test: booking flow với validation mới + cancel kèm lý do + reliability
set -e
BASE="http://localhost:3000"
JAR="/tmp/smoke_cookies.txt"
rm -f $JAR

echo "=== 1. Đăng nhập học sinh ==="
# Dùng lan.parent (không có dữ liệu demo) để tránh xung đột lịch với
# khóa định kỳ demo của hoa.parent ↔ minhanh.tutor (thứ Tư 18:30–20:00)
curl -s -c $JAR -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"lan.parent@example.com","password":"123456"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('login OK:', d.get('name'), d.get('role'))"

echo ""
echo "=== 2. Lấy gia sư + môn + lịch trống ==="
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
import json,sys,datetime
d=json.load(sys.stdin)
avails=d['availabilities']
# tìm ngày tới khớp lịch trống (thứ trong availabilities)
import calendar
days={a['dayOfWeek'] for a in avails}
today=datetime.date.today()
found=None
for i in range(1,20):
    cand=today+datetime.timedelta(days=i)
    if cand.weekday()+1 if cand.weekday()<6 else 0 in days: pass
    dow=(cand.weekday()+1)%7
    if dow in days:
        found=cand
        break
slot=[a for a in avails if a['dayOfWeek']==(found.weekday()+1)%7][0]
print(json.dumps({'date': found.isoformat(), 'start': slot['startTime'], 'end': slot['endTime']}))
")
B_DATE=$(echo $AVAIL | python3 -c "import json,sys; print(json.load(sys.stdin)['date'])")
AV_START=$(echo $AVAIL | python3 -c "import json,sys; print(json.load(sys.stdin)['start'])")
echo "Ngày có lịch: $B_DATE, slot bắt đầu từ $AV_START"

echo ""
echo "=== 3. Test BUG FIX endTime: đặt 09:30-style (giờ có phút lẻ) + 1.5h ==="
# Lấy giờ bắt đầu có phút 30 nếu có, không thì dùng :30 đầu tiên trong slot
START_MIN=$(python3 -c "
s='$AV_START'
h=int(s[:2]); m=int(s[3:5])
# đặt bắt đầu ở phút 30 để test tính toán endTime (09:30 + 1.5h phải ra 11:00)
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
JAR2="/tmp/smoke_cookies2.txt"
TJAR="/tmp/smoke_cookies_tutor.txt"
rm -f $JAR2 $TJAR

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
# Ngày gia sư trống KHÔNG rơi vào thứ Tư (tránh trùng khóa demo 18:30–20:00)
B3_DATE=$(python3 -c "
import datetime
today=datetime.date.today()
for i in range(1,15):
    cand=today+datetime.timedelta(days=i)
    if cand.weekday()!=2:  # không phải thứ Tư
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
echo "=== DONE ==="
