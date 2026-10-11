#!/usr/bin/env python3
"""Quick smoke test các param API mới của phase 5."""
import json
import urllib.request

BASE = 'http://localhost:3000'

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=20) as r:
        return json.loads(r.read().decode())

# 1. Lấy vài tutor làm mốc
data = get('/api/tutors?sort=rating&pageSize=5')
tutors = data['tutors']
print('A. total =', data['total'])
ids = [t['id'] for t in tutors[:3]]
names = [t['name'] for t in tutors[:3]]
print('   top3 =', names)

# 2. ids mode — đúng thứ tự (đảo ngược thứ tự)
rev = list(reversed(ids))
d2 = get('/api/tutors?ids=' + ','.join(rev))
got = [t['name'] for t in d2['tutors']]
print('B. ids reversed ->', got, '| đúng thứ tự:', got == list(reversed(names)))

# 3. availDay=6 (thứ 7), không slot
d3 = get('/api/tutors?availDay=6&pageSize=50')
print('C. availDay=6 (T7) ->', d3['total'], 'gia sư')

# 4. availDay=1 + availSlot=evening (tối T2)
d4 = get('/api/tutors?availDay=1&availSlot=evening&pageSize=50')
print('D. T2 + tối ->', d4['total'], 'gia sư:', [t['name'] for t in d4['tutors']][:5])

# 5. availSlot=evening mọi ngày
d5 = get('/api/tutors?availSlot=evening&pageSize=50')
print('E. mọi ngày + tối ->', d5['total'], 'gia sư')

# 6. availSlot=morning
d6 = get('/api/tutors?availSlot=morning&pageSize=50')
print('F. mọi ngày + sáng ->', d6['total'], 'gia sư')

# 7. verified
d7 = get('/api/tutors?verified=true&pageSize=50')
print('G. verified ->', d7['total'], 'gia sư; all verified =', all(t.get('isVerified') for t in d7['tutors']))

# 8. kết hợp subject + availDay
d8 = get('/api/tutors?subject=toan-hoc&availDay=6&pageSize=50')
print('H. Toán THPT + T7 ->', d8['total'])

# 9. ids rác → mảng rỗng, không lỗi
d9 = get('/api/tutors?ids=')
print('I. ids rỗng ->', d9['tutors'])

# 10. availDay rác (NaN) → bỏ qua filter
d10 = get('/api/tutors?availDay=abc&pageSize=50')
print('J. availDay=abc (bỏ qua) ->', d10['total'])
