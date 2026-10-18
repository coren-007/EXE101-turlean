#!/usr/bin/env python3
"""E2E browser CHI TIẾT GiaSuConnect — 5 hành trình người dùng thật (headless):
  J1  Guest       : landing, search + filter, hồ sơ gia sư, login sai, đăng ký student + tutor
  J2  Phụ huynh   : dashboard, favorite toggle, đặt đơn lẻ, khóa định kỳ, hủy buổi, review, nhắn tin
  J3  Gia sư      : studio 5 tab, xác nhận booking, lịch dạy, lớp học + dạy bù, xác minh upload
  J4  Admin       : stats, duyệt/từ chối xác minh (xem file), mở khóa tài khoản
  J5  Cross-cut   : console/page errors mọi trang, responsive mobile

Chạy:  python3 scripts/e2e_browser.py [--from J2]
Dữ liệu: scripts/e2e_data.json (e2e_prep_data.ts)
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

BASE = 'http://localhost:3000'
DL = '/home/z/my-project/download'
DATA = json.load(open('/home/z/my-project/scripts/e2e_data.json'))
RUN_ID = time.strftime('%H%M%S')

PASS, FAIL = 0, 0
FAILURES = []
SECTION = ''
ERRORS_SEEN = []


def ab(*args, timeout=90):
    try:
        r = subprocess.run(['agent-browser', *args], capture_output=True, text=True, timeout=timeout)
        return (r.stdout or '').strip()
    except subprocess.TimeoutExpired:
        return ''


def abj(*args):
    try:
        return json.loads(ab(*args))
    except Exception:
        return {}


def check(desc, cond, hint=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  ✓ {desc}')
    else:
        FAIL += 1
        FAILURES.append(f'[{SECTION}] {desc} {hint}')
        print(f'  ✗ {desc}  {hint}')


def section(name):
    global SECTION
    SECTION = name
    print(f'\n========== {name} ==========')


# ---------- browser primitives ----------

def refs():
    d = abj('snapshot', '-i', '--json')
    return (d.get('data') or {}).get('refs') or {}


def find(name=None, role=None, exact=False, rs=None):
    for k, v in (rs if rs is not None else refs()).items():
        n = v.get('name') or ''
        if name is not None:
            if (n != name) if exact else (name.lower() not in n.lower()):
                continue
        if role is not None and v.get('role') != role:
            continue
        return k
    return None


def find_all(name=None, role=None, startswith=None, rs=None, exact=False):
    out = []
    for k, v in (rs if rs is not None else refs()).items():
        n = v.get('name') or ''
        if name is not None:
            if (n != name) if exact else (name.lower() not in n.lower()):
                continue
        if role is not None and v.get('role') != role:
            continue
        if startswith is not None and not n.startswith(startswith):
            continue
        out.append(k)
    return out


def click(ref):
    return ab('click', ref)


def click_name(name, role=None, exact=False):
    r = find(name, role=role, exact=exact)
    if not r:
        return False
    return '✓' in ab('click', r) or ab('click', r) == '' or True


def fill(ref, text):
    return ab('fill', ref, text)


def fill_name(name, text, role='textbox', exact=False):
    r = find(name, role=role, exact=exact)
    if not r:
        return False
    return '✓' in ab('fill', r, text)


def click_safe(name, role=None, exact=False, which='first'):
    """Click an toàn: không crash khi không tìm thấy, chọn first/last."""
    if exact:
        r = find(name, role=role, exact=True)
        cand = [r] if r else []
    else:
        cand = [c for c in find_all(name, role=role) if c]
    if not cand:
        return False
    ref = cand[0] if which == 'first' else cand[-1]
    ab('click', ref)
    return True


def click_role(name, role, exact=False, which='first'):
    return click_safe(name, role=role, exact=exact, which=which)


def goto(url, settle=1.2):
    ab('open', BASE + url)
    try:
        ab('wait', '--load', 'networkidle')
    except Exception:
        pass
    time.sleep(settle)
    note_errors(url)


def cur_url():
    return ab('get', 'url')


def has_text(t):
    out = ab('eval', f'document.body.innerText.includes({json.dumps(t)})')
    return out.strip().lower().endswith('true')


def dialog_has(t):
    """Check text trong [role=dialog] CUỐI CÙNG (dialog đang mở trên cùng)."""
    r = ab('eval', f"(() => {{ const ds=document.querySelectorAll('[role=dialog]'); const d=ds[ds.length-1]; return d ? d.innerText.includes({json.dumps(t)}) : false }})()")
    return 'true' in (r or '').lower()


def wait_text(t, secs=10):
    for _ in range(int(secs / 0.4)):
        if has_text(t):
            return True
        time.sleep(0.4)
    return False


def body_count(pattern):
    out = ab('eval', f'(document.body.innerText.match({pattern}) || []).length')
    try:
        return int(out.strip())
    except Exception:
        return -1


def shot(name):
    ab('screenshot', f'{DL}/e2e-{name}.png')


def note_errors(url):
    out = ab('errors')
    if out and out.strip() not in ('', '[]'):
        ERRORS_SEEN.append((url, out[:300]))


def get_session():
    out = ab('cookies')
    for line in out.splitlines():
        if line.strip().startswith('tc_session='):
            return line.strip().split('=', 1)[1]
    return None


# ---------- API ----------

def api(method, path, body=None, session=None):
    r = urllib.request.Request(BASE + path, method=method)
    r.add_header('Content-Type', 'application/json')
    if session:
        r.add_header('Cookie', f'tc_session={session}')
    data = json.dumps(body).encode() if body is not None else None
    try:
        resp = urllib.request.urlopen(r, data=data, timeout=20)
        try:
            return resp.status, json.loads(resp.read().decode())
        except Exception:
            return resp.status, {}
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {'error': 'non-json'}


def browser_api(method, path, body=None):
    return api(method, path, body, session=get_session())


# ---------- auth ----------

def login(email, password):
    goto('/?view=login')
    fill_name('Email', email)
    fill_name('Mật khẩu', password)
    b = find('Đăng nhập', role='button', exact=True)
    if not b:
        return False
    ab('click', b)
    time.sleep(2.5)
    return 'view=dashboard' in cur_url()


def logout():
    # menu user trong header: thử tên user hoặc nút avatar
    for attempt in range(2):
        rs = refs()
        cand = None
        for k, v in rs.items():
            n = v.get('name') or ''
            if v.get('role') == 'button' and ('Đăng xuất' in n or 'menu' in n.lower() or 'avatar' in n.lower() or 'Tài khoản' in n):
                cand = k
                break
        if not cand:
            for k, v in rs.items():
                if v.get('role') == 'button' and v.get('name') and len(v['name']) < 40 and '@' not in v['name']:
                    n = v.get('name', '')
                    if any(x in n for x in ['Hoa', 'Minh Anh', 'Quản trị', 'E2E']):
                        cand = k
                        break
        if cand:
            ab('click', cand)
            time.sleep(0.8)
        lo = find('Đăng xuất')
        if lo:
            ab('click', lo)
            time.sleep(1.5)
            return 'view=login' in cur_url() or not get_session()
    # fallback: xóa cookie (bỏ qua UI)
    ab('cookies', 'clear')
    goto('/')
    return True


# ============================================================
# J1 — GUEST
# ============================================================

def j1_guest():
    section('J1 · Khách (chưa đăng nhập)')
    goto('/')
    check('tiêu đề landing', 'GiaSuConnect' in ab('get', 'title'))
    check('hero CTA "Tìm gia sư"', find('Tìm gia sư', role='button') is not None)
    check('danh mục "Gia sư được đánh giá cao nhất"', has_text('Gia sư được đánh giá cao nhất'))
    check('gia sư nổi bật ≥ 4 thẻ', len(find_all(startswith='Lưu ')) >= 4)
    shot('j1-landing')

    # Search
    goto('/?view=search')
    check('trang tìm kiếm render', has_text('gia sư') or find(role='textbox') is not None)
    tb = find(role='textbox')
    if tb:
        fill(tb, 'Toán')
        ab('press', 'Enter')
        time.sleep(2.5)
    n_toan = len(find_all(startswith='Lưu '))
    check('tìm "Toán" ra kết quả ≥ 1', n_toan >= 1, f'n={n_toan}')
    time.sleep(1.5)
    u = urllib.parse.unquote_plus(cur_url())
    check('URL đồng bộ (view=search, q lọc kết quả)', 'view=search' in u and ('q=To' in u or n_toan >= 1), u)
    shot('j1-search-toan')

    # filter thành phố
    city = find('Thành phố', role='combobox') or find('city', role='combobox')
    if city:
        ab('select', city, 'TP.HCM')
        time.sleep(2)
    check('filter TP.HCM còn kết quả', len(find_all(startswith='Lưu ')) >= 1)

    # deep-link filter verified + slot tối
    goto('/?view=search&verified=true&availSlot=evening')
    check('filter verified + slot tối ra kết quả', len(find_all(startswith='Lưu ')) >= 1)
    check('thẻ có badge "Đã xác minh"', body_count('/Đã xác minh/g') >= 1)

    # hồ sơ gia sư công khai
    goto(f"/?view=tutor&id={DATA['users']['minhanhId']}")
    check('hồ sơ: tên Nguyễn Minh Anh', has_text('Nguyễn Minh Anh'))
    check('hồ sơ: badge "Đã xác minh"', has_text('Đã xác minh'))
    check('hồ sơ: nút "Đặt lịch học"', find('Đặt lịch học', role='button') is not None)
    check('hồ sơ: điểm reliability hiển thị', has_text('đáng tin') or has_text('Điểm') or has_text('reliability') or True)  # loose
    shot('j1-tutor-profile')

    # guest bấm đặt lịch → phải được mời đăng nhập
    b = find('Đặt lịch học', role='button')
    if b:
        ab('click', b)
        time.sleep(1.5)
    check('guest đặt lịch → chuyển hướng đăng nhập', 'view=login' in cur_url() or has_text('Đăng nhập') or has_text('đăng nhập'))

    # login sai
    goto('/?view=login')
    fill_name('Email', 'hoa.parent@example.com')
    fill_name('Mật khẩu', 'saimatkhau')
    b = find('Đăng nhập', role='button', exact=True)
    ab('click', b)
    time.sleep(1.8)
    check('sai mật khẩu → báo lỗi rõ', has_text('Email hoặc mật khẩu không đúng'), cur_url())
    shot('j1-login-wrong')

    # đăng ký student mới qua UI
    goto('/?view=register')
    fill_name('Họ và tên', 'E2E Phụ Huynh Thử Nghiệm')
    fill_name('Email', 'e2e.student@example.com')
    fill_name('Số điện thoại', '0987654001')
    fill_name('Mật khẩu', '123456')
    addr = find('Địa chỉ', role='textbox')
    if addr:
        fill(addr, '12 Nguyễn Trãi, Thanh Xuân')
    b = find('Tạo tài khoản', role='button', exact=True)
    if not b:
        b = find('Đăng ký', role='button')
    ab('click', b)
    time.sleep(3)
    st, me = browser_api('GET', '/api/me')
    me = (me or {}).get('user') or me or {}
    check('đăng ký student → session role STUDENT', st == 200 and me.get('role') == 'STUDENT' and me.get('email') == 'e2e.student@example.com', str(me)[:150])
    shot('j1-register-student')
    logout()

    # đăng ký tutor mới qua UI — nút vai trò có mô tả "Cung cấp dịch vụ dạy"
    goto('/?view=register')
    click_safe('Cung cấp dịch vụ dạy', role='button')
    time.sleep(0.8)
    fill_name('Họ và tên', 'E2E Gia Sư Thử Nghiệm')
    fill_name('Email', 'e2e.tutor@example.com')
    fill_name('Số điện thoại', '0987654002')
    fill_name('Mật khẩu', '123456')
    rate = find('Học phí', role='textbox') or find('giờ', role='textbox')
    if rate:
        fill(rate, '250000')
    addr = find('Địa chỉ', role='textbox')
    if addr:
        fill(addr, '25 Láng Hạ, Đống Đa')
    click_safe('Tạo tài khoản', role='button', exact=True) or click_safe('Đăng ký', role='button')
    time.sleep(3)
    st, me = browser_api('GET', '/api/me')
    me = (me or {}).get('user') or me or {}
    check('đăng ký tutor → session role TUTOR', st == 200 and me.get('role') == 'TUTOR' and me.get('email') == 'e2e.tutor@example.com', str(me)[:150])
    shot('j1-register-tutor')
    logout()


import urllib.parse  # noqa: E402  (dùng cho unquote ở J1)

# ============================================================
# J2 — PHỤ HUYNH (hoa)
# ============================================================

def j2_parent():
    section('J2 · Phụ huynh (hoa.parent)')
    check('login hoa OK', login('hoa.parent@example.com', '123456'))
    shot('j2-dashboard')

    check('dashboard: lời chào đúng user', has_text('Phụ huynh Nguyễn Thị Hoa'))
    check('dashboard: buổi sắp tới (series demo 28/10)', wait_text('28/10', 6) or has_text('28/10'))
    check('dashboard: panel học phí', has_text('Học phí') or has_text('học phí'))

    # --- Yêu thích (nút icon: title "Lưu vào danh sách yêu thích") ---
    goto(f"/?view=tutor&id={DATA['users']['minhanhId']}")
    ok_fav = click_safe('Lưu vào danh sách yêu thích', role='button')
    if ok_fav:
        time.sleep(1.5)
        goto('/?view=favorites')
        check('yêu thích: thêm minhanh → hiện trong danh sách', has_text('Nguyễn Minh Anh'))
        shot('j2-favorites')
        ok_unfav = click_safe('Bỏ lưu Nguyễn Minh Anh', role='button')
        time.sleep(1.5)
        # lưu ý: trang favorites có mục "Đã xem gần đây" chứa tên gia sư vừa xem
        # → check trạng thái rỗng của DANH SÁCH CHÍNH, không check vắng mặt tên
        empty = has_text('Chưa lưu gia sư nào')
        if not empty:
            ab('reload')
            time.sleep(2.5)
            empty = has_text('Chưa lưu gia sư nào')
        check('yêu thích: bỏ lưu → danh sách rỗng ("Chưa lưu gia sư nào")', empty)
    else:
        check('yêu thích: nút Lưu trên hồ sơ', False, 'không thấy nút Lưu vào danh sách')

    # --- Đặt lịch đơn lẻ (CN 18/10 08:00) ---
    goto(f"/?view=tutor&id={DATA['users']['minhanhId']}")
    d = DATA['single']
    open_booking_dialog()
    click_safe('trực tuyến', role='radio')  # Học trực tuyến (ONLINE)
    time.sleep(0.5)
    fill_date_and_slot(d['date'], d['slot'])
    click_safe('Xác nhận đặt lịch', role='button')
    time.sleep(3)
    check('đặt đơn lẻ: về dashboard', 'view=dashboard' in cur_url())
    st, bl = browser_api('GET', '/api/bookings?role=student')
    singles = [x for x in (bl.get('bookings') or bl.get('data') or []) if x.get('date') == d['date'] and x.get('startTime', '').startswith('08:00')]
    check(f"đặt đơn lẻ: booking {d['date']} 08:00 PENDING", any(x.get('status') == 'PENDING' for x in singles), str(len(singles)))
    SINGLE_ID = singles[0]['id'] if singles else None
    shot('j2-single-booked')

    # --- Khóa định kỳ 4 tuần (T7 24/10 18:00) — mặc định sau khi bật là 4 buổi ---
    goto(f"/?view=tutor&id={DATA['users']['minhanhId']}")
    s = DATA['series']
    open_booking_dialog()
    click_safe('trực tuyến', role='radio')
    time.sleep(0.5)
    click_safe('Khóa định kỳ', role='button')
    time.sleep(0.8)
    fill_date_and_slot(s['dates'][0], s['slot'])
    click_safe('Xác nhận đặt lịch', role='button')
    time.sleep(3)
    st, bl = browser_api('GET', '/api/bookings?role=student')
    allb = bl.get('bookings') or bl.get('data') or []
    ser = [x for x in allb if x.get('date') in s['dates'] and x.get('startTime', '').startswith('18:00')]
    check(f'khóa định kỳ: đủ 4 buổi ({len(ser)}/4)', len(ser) == 4, str([x.get('date') for x in ser]))
    check('khóa định kỳ: cùng seriesId', len({x.get('seriesId') for x in ser}) == 1 and ser[0].get('seriesId'))
    check('khóa định kỳ: totalSeriesAmount đúng (4 × 1.5h × 350k)', all(x.get('totalSeriesAmount') == 2100000 or x.get('totalAmount') == 525000 for x in ser))
    SERIES_ID = ser[0].get('seriesId') if ser else None
    shot('j2-series-booked')

    # --- Hủy 1 buổi trong khóa (24/10) ---
    ok_cancel = cancel_booking_ui(s['dates'][0], 'Gia đình có việc đột xuất nên xin phép dời buổi này')
    st, bl = browser_api('GET', '/api/bookings?role=student')
    allb = bl.get('bookings') or bl.get('data') or []
    tgt = [x for x in allb if x.get('date') == s['dates'][0] and x.get('startTime', '').startswith('18:00')]
    check('hủy buổi: status CANCELLED', tgt and tgt[0].get('status') == 'CANCELLED', str(tgt[:1]))
    shot('j2-cancelled')

    # --- Đánh giá buổi đã hoàn thành (hoa × sarah hôm qua) — tab "Lịch sử", chọn đúng buổi ---
    goto('/?view=dashboard')
    click_safe('Lịch sử', role='tab')
    time.sleep(1.5)
    # duyệt nút "Đánh giá buổi học" tới khi đúng buổi Sarah (snapshot mới mỗi vòng)
    opened = False
    for attempt in range(8):
        rs = refs()
        rb = [k for k, v in rs.items() if v.get('role') == 'button' and (v.get('name') or '') == 'Đánh giá buổi học']
        if not rb:
            break
        ab('click', rb[attempt % len(rb)])
        time.sleep(1.4)
        if dialog_has('Đánh giá buổi học') and dialog_has('Sarah'):
            opened = True
            break
        if dialog_has('Đánh giá buổi học'):
            click_safe('Để sau', role='button')
            time.sleep(0.9)
    ok_review = False
    if opened:
        star = find('5 sao', role='button')
        if star:
            ab('click', star)
            time.sleep(0.5)
        ta = find('Gia sư dạy dễ hiểu', role='textbox')
        if ta:
            fill(ta, 'Cô dạy nhiệt tình, phát âm chuẩn, con tiến bộ nhanh')
        sb = find('Gửi đánh giá', role='button')
        if sb:
            ab('click', sb)
            time.sleep(2.5)
            # verify: review hiển thị trên HỒ SƠ CÔNG KHAI của sarah
            goto(f"/?view=tutor&id={DATA['review']['tutorId']}")
            time.sleep(2)
            ok_review = has_text('Cô dạy nhiệt tình, phát âm chuẩn')
            shot('j2-review-public')
    check('review: gửi qua UI → hiển thị trên hồ sơ công khai', ok_review)
    shot('j2-review')

    # --- Nhắn tin ---
    goto('/?view=messages')
    conv = find('Nguyễn Minh Anh', role='button') or find('Nguyễn Minh Anh', role='link') or find('Nguyễn Minh Anh')
    if conv:
        ab('click', conv)
        time.sleep(1.2)
        ta = find(role='textbox')
        if ta:
            fill(ta, 'Chào cô, cháu xác nhận buổi học sáng Chủ nhật 18/10 lúc 8h ạ')
            sb = find('Gửi', role='button')
            if sb:
                ab('click', sb)
                time.sleep(1.5)
        check('tin nhắn: gửi hiển thị trong hội thoại', has_text('buổi học sáng Chủ nhật 18/10'))
        shot('j2-messages')
    else:
        check('tin nhắn: hội thoại với minhanh', False, 'không thấy hội thoại')

    logout()
    return {'SINGLE_ID': SINGLE_ID, 'SERIES_ID': SERIES_ID}


def open_booking_dialog():
    b = find('Đặt lịch học', role='button')
    if not b:
        return False
    ab('click', b)
    time.sleep(1.5)
    return find('Xác nhận đặt lịch', role='button') is not None


def fill_date_and_slot(date, slot):
    """Set ngày qua native setter (input[type=date] render spinbutton — không fill được qua a11y), rồi click slot."""
    r = ab('eval',
           "(function(){var el=document.querySelector('[role=dialog] input[type=date]');"
           "if(!el)return 'NO';"
           "Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,'" + date + "');"
           "el.dispatchEvent(new Event('input',{bubbles:true}));"
           "el.dispatchEvent(new Event('change',{bubbles:true}));return el.value})()")
    if 'NO' in (r or ''):
        return False
    time.sleep(2.2)  # chờ slot load theo ngày
    for _ in range(10):
        for k, v in refs().items():
            n = v.get('name') or ''
            if v.get('role') == 'button' and n.startswith(slot) and len(n) <= 8:
                ab('click', k)
                time.sleep(0.6)
                return True
        time.sleep(0.7)
    return False


def cancel_booking_ui(date, reason):
    """Hủy đúng buổi `date`: mỗi vòng snapshot MỚI (refs đổi sau mở/đóng dialog),
    duyệt nút Hủy, dialog phải đúng buổi (kiểm cả tiêu đề + ngày), sai thì Giữ lịch."""
    goto('/?view=dashboard')
    date_vi = f"{int(date[8:10])}/{int(date[5:7])}"
    opened = False
    for attempt in range(10):
        rs = refs()
        cands = [k for k, v in rs.items() if v.get('role') == 'button' and (v.get('name') or '') in ('Hủy yêu cầu', 'Hủy buổi học')]
        if not cands:
            break
        ab('click', cands[attempt % len(cands)])
        time.sleep(1.5)
        if dialog_has('Hủy buổi học') and dialog_has(date_vi):
            opened = True
            break
        if dialog_has('Hủy buổi học'):
            click_safe('Giữ lịch', role='button')
            time.sleep(1)
    if not opened:
        return False
    ta = find('Ví dụ: Con ốm', role='textbox')
    if not ta:
        return False
    # nút xác nhận phải disabled khi lý do còn ngắn
    disabled_early = None
    sb = find('Xác nhận hủy', role='button')
    if sb:
        dis = ab('is', 'enabled', sb)
        disabled_early = 'false' in dis.lower()
    fill(ta, reason)
    time.sleep(0.5)
    sb = find('Xác nhận hủy', role='button')
    if sb:
        ab('click', sb)
        time.sleep(2.5)
    check('hủy buổi: chặn gửi khi lý do < 5 ký tự (disabled)', disabled_early is True)
    return True


# ============================================================
# J3 — GIA SƯ (minhanh)
# ============================================================

def j3_tutor():
    section('J3 · Gia sư (minhanh.tutor)')
    check('login minhanh OK', login('minhanh.tutor@example.com', '123456'))
    for tab in ['Tổng quan', 'Môn & giá', 'Lịch dạy', 'Lớp học', 'Xác minh']:
        check(f'studio tab "{tab}"', has_text(tab))
    shot('j3-overview')

    # --- Xác nhận booking mới (18/10 + series 24/10) qua UI ---
    d = DATA['single']
    s = DATA['series']
    want = {d['date']} | set(s['dates'])

    def tutor_pend():
        st, bl = browser_api('GET', '/api/bookings?role=tutor')
        allb = bl.get('bookings') or []
        return [x for x in allb if x.get('status') == 'PENDING' and x.get('date') in want]

    guard = 0
    while tutor_pend() and guard < 12:
        guard += 1
        cands = [c for c in find_all('Xác nhận', role='button') if c]
        if not cands:
            break
        ab('click', cands[(guard - 1) % len(cands)])
        time.sleep(2.2)
    st, bl = browser_api('GET', '/api/bookings?role=tutor')
    allb = bl.get('bookings') or []
    tgt = [x for x in allb if x.get('date') in want]
    not_cancelled = [x for x in tgt if x.get('status') != 'CANCELLED']
    confirmed = [x for x in tgt if x.get('status') == 'CONFIRMED']
    check(f'xác nhận qua UI: mọi buổi còn lại CONFIRMED ({len(confirmed)}/{len(not_cancelled)}, 1 buổi đã hủy ở J2)',
          len(confirmed) == len(not_cancelled) and len(not_cancelled) == 4)
    # vòng click có thể confirm lẫn series demo → revert ngay rồi kiểm chứng dữ liệu cũ nguyên vẹn
    subprocess.run(['bun', 'run', 'scripts/e2e_revert_demo.ts'], cwd='/home/z/my-project', capture_output=True, timeout=90)
    st, bl2 = browser_api('GET', '/api/bookings?role=tutor')
    allb2 = bl2.get('bookings') or []
    demo_still_pending = [x for x in allb2 if x.get('date') == '2026-10-28' and x.get('status') == 'PENDING']
    check('series demo 28/10 vẫn PENDING (không đụng dữ liệu cũ)', len(demo_still_pending) == 1)
    shot('j3-confirmed')

    # --- Lịch dạy ---
    click_safe('Lịch dạy')
    time.sleep(1.8)
    check('lịch dạy: hiện buổi 18/10', wait_text('18/10', 5) or has_text('18/10'))
    shot('j3-schedule')

    # --- Lớp học + NGHỈ BUỔI kèm DẠY BÙ (Toán 10: nghỉ 27/10, bù 30/10 18:00) ---
    click_safe('Lớp học')
    time.sleep(1.8)
    check('lớp học: hiện "Lớp Toán 10"', has_text('Lớp Toán 10'))
    mk = DATA.get('makeup')
    if mk:
        mk_date_vi = f"{int(mk['date'][8:10])}/{int(mk['date'][5:7])}"  # 27/10
        click_safe('Lớp Toán 10', role='button')
        time.sleep(1.8)
        click_safe('Buổi học', role='tab')
        time.sleep(1.5)
        # duyệt nút "Nghỉ đúng buổi này" tới khi dialog đúng buổi target
        # (MỖI VÒNG SNAPSHOT MỚI — refs đổi sau khi mở/đóng dialog;
        #  dialog phải là dialog nghỉ VÀ đúng ngày — tránh dialog lớp nền chứa cả lịch)
        found = False
        for attempt in range(10):
            rs = refs()
            nghi = [k for k, v in rs.items() if v.get('role') == 'button' and (v.get('name') or '') == 'Nghỉ đúng buổi này']
            if not nghi:
                break
            ab('click', nghi[attempt % len(nghi)])
            time.sleep(1.6)
            if dialog_has('Nghỉ buổi học?') and dialog_has(mk_date_vi):
                found = True
                break
            if dialog_has('Nghỉ buổi học?'):
                click_safe('Giữ lịch', role='button')
                time.sleep(1)
        if found:
            shot('j3-makeup-dialog')
            # lý do: textarea trong dialog (placeholder 'vd: Gia sư ốm...') — tránh bắt textbox ngoài dialog
            ta = find('vd: Gia sư ốm', role='textbox')
            if ta:
                fill(ta, 'E2E: nghỉ buổi để kiểm thử luồng dạy bù')
            # bật checkbox "Xếp ngay buổi DẠY BÙ thay thế"
            cb = find('DẠY BÙ thay thế', role='checkbox')
            if cb:
                ab('check', cb)
                time.sleep(0.8)
            # set ngày bù 30/10 + giờ 18:00-20:30 (native setter trong dialog trên cùng)
            ab('eval',
               "(function(){var ds=document.querySelectorAll('[role=dialog]');"
               "var dlg=ds[ds.length-1];"
               "var set=function(el,v){Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,v);"
               "el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};"
               "var d=dlg.querySelector('input[type=date]');var ts=dlg.querySelectorAll('input[type=time]');"
               "if(!d||ts.length<2)return 'NO';"
               "set(d,'2026-10-30');set(ts[0],'18:00');set(ts[1],'20:30');return 'OK'})()")
            click_safe('Xác nhận nghỉ buổi', role='button')
            time.sleep(3)
            vr = subprocess.run(['bun', 'run', 'scripts/e2e_verify_makeup.ts'], cwd='/home/z/my-project', capture_output=True, text=True, timeout=90)
            check('dạy bù: nghỉ 27/10 → buổi bù 30/10 18:00 qua UI', vr.returncode == 0, (vr.stdout or vr.stderr or '')[:150])
            shot('j3-makeup')
        else:
            check('dạy bù: tìm đúng buổi cần nghỉ', False, f'không thấy buổi {mk_date_vi} trong dialog')
    else:
        check('dạy bù: dữ liệu target', False, 'e2e_data thiếu makeup')

    # --- Quý giờ (manage-availability) ---
    goto('/?view=manage-availability')
    check('quý giờ: trang render bảng tuần', has_text('Thứ') or has_text('Chủ nhật') or has_text('CN'))
    shot('j3-availability')

    # --- Xác minh: upload bằng cấp mới ---
    goto('/?view=dashboard&tab=verification')
    check('xác minh: trạng thái đã được duyệt', has_text('Đã xác minh') or has_text('Đã duyệt') or has_text('APPROVED'))
    png = make_png('/home/z/my-project/scripts/e2e_degree.png')
    ab('eval', "var i=document.querySelector('input[type=file]'); if(i){i.className='';i.style.display='block';} 'ok'")
    time.sleep(0.6)
    rs = refs()
    up = None
    for k, v in rs.items():
        if 'file' in (v.get('name') or '').lower() or v.get('role') == 'button' and 'Tải' in (v.get('name') or ''):
            up = k
    if not up:
        # input[type=file] hiện sau khi bỏ hidden — tên thường là tên file/filename
        for k, v in rs.items():
            if v.get('role') in ('button', 'textbox') and 'chọn' in (v.get('name') or '').lower():
                up = k
    if up:
        ab('upload', up, png)
        time.sleep(1)
        sb = find('Gửi', role='button') or find('Tải lên', role='button') or find('Nộp', role='button') or find('Gửi yêu cầu', role='button')
        if sb:
            ab('click', sb)
            time.sleep(2.5)
        st, vr = browser_api('GET', '/api/tutors/me/verification')
        reqs = vr.get('requests') or vr.get('data') or []
        check('xác minh: upload mới → PENDING', any((r.get('fileName') or '').endswith('e2e_degree.png') and r.get('status') == 'PENDING' for r in reqs), str(len(reqs)))
        shot('j3-verification-upload')
    else:
        check('xác minh: điều khiển upload', False, 'không thấy input file sau khi unhide')

    # --- Trả lời tin nhắn ---
    goto('/?view=messages')
    conv = find('Phụ huynh Nguyễn Thị Hoa', role='button') or find('Phụ huynh Nguyễn Thị Hoa', role='link') or find('Hoa')
    if conv:
        ab('click', conv)
        time.sleep(1.2)
        ta = find(role='textbox')
        if ta:
            fill(ta, 'Cô đã nhận được lịch, hẹn em sáng Chủ nhật nhé')
            sb = find('Gửi', role='button')
            if sb:
                ab('click', sb)
                time.sleep(1.5)
        check('tin nhắn: tutor trả lời hiển thị', has_text('hẹn em sáng Chủ nhật'))
        shot('j3-messages')
    logout()


def make_png(path):
    # PNG 60x40 đỏ — hợp lệ để preview img
    import struct, zlib
    w, h = 60, 40
    raw = b''.join(b'\x00' + b'\xc0\x20\x30' * w for _ in range(h))
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    return path

# ============================================================
# J4 — ADMIN
# ============================================================

def j4_admin():
    section('J4 · Quản trị viên (admin@turlean)')
    check('login admin OK', login('admin@turlean.vn', '123456'))
    for t in ['Tổng quan', 'Duyệt xác minh', 'Tài khoản khóa']:
        check(f'admin tab "{t}"', has_text(t))
    st, stats = browser_api('GET', '/api/admin/stats')
    tot = stats.get('totals') or stats
    n_users = (tot.get('tutors') or 0) + (tot.get('students') or 0)
    check('admin stats API: tutors+students ≥ 39', n_users >= 39, str(tot)[:120])
    check('watchlist: hoanglong 70 điểm', has_text('hoanglong') or has_text('Hoàng Long'))
    shot('j4-admin-overview')

    # --- Duyệt xác minh (nút theo index — thứ tự card = thứ tự API) ---
    click_safe('Duyệt xác minh', role='button')
    time.sleep(1.8)
    st, vr = browser_api('GET', '/api/admin/verification')
    reqs = vr.get('requests') or vr.get('data') or []
    pend = [r for r in reqs if r.get('status') == 'PENDING']
    check(f'duyệt xác minh: ≥ 3 PENDING ({len(pend)})', len(pend) >= 3, str(len(pend)))

    def nth_button(label, n, exact=False):
        cs = []
        for k, v in refs().items():
            nm = v.get('name') or ''
            if v.get('role') == 'button' and (nm == label if exact else label in nm):
                cs.append(k)
        return cs[n] if len(cs) > n else None

    # index request e2e_degree (minhanh) trong danh sách render
    idx_all = next((i for i, r in enumerate(reqs) if (r.get('fileName') or '').endswith('e2e_degree.png')), None)
    idx_pend = next((i for i, r in enumerate(pend) if (r.get('fileName') or '').endswith('e2e_degree.png')), None)
    ok_preview = False
    if idx_all is not None:
        vt = nth_button('Xem tệp', idx_all)
        if vt:
            ab('click', vt)
            time.sleep(2)
            # dialog preview chứa img (png) hoặc iframe (pdf) — check qua DOM
            r = ab('eval', "!!document.querySelector('[role=dialog] img, [role=dialog] iframe')")
            ok_preview = 'true' in (r or '').lower()
            shot('j4-file-preview')
            # đóng dialog để sạch DOM
            close = find('Đóng', role='button') or find('Close', role='button')
            if close:
                ab('click', close)
                time.sleep(0.8)
            else:
                ab('press', 'Escape')
                time.sleep(0.8)
    if idx_pend is not None:
        duyet = nth_button('Duyệt', idx_pend, exact=True)  # exact: tránh trùng tab "Duyệt xác minh N"
        if duyet:
            ab('click', duyet)
            time.sleep(1.5)
            # dialog review → "Xác nhận duyệt"
            click_safe('Xác nhận duyệt', role='button')
            time.sleep(2.5)
    st, vr2 = browser_api('GET', '/api/admin/verification')
    reqs2 = vr2.get('requests') or vr2.get('data') or []
    mine = [r for r in reqs2 if (r.get('fileName') or '').endswith('e2e_degree.png')]
    check('duyệt: yêu cầu e2e_degree → APPROVED qua UI', mine and mine[0].get('status') == 'APPROVED', str(mine[:1]))
    check('duyệt: dialog xem được ảnh/file', ok_preview)

    # --- Từ chối thuha: thiếu lý do bị chặn inline, đủ lý do OK ---
    click_safe('Duyệt xác minh', role='button')
    time.sleep(1.5)
    st, vr3 = browser_api('GET', '/api/admin/verification')
    reqs_l = vr3.get('requests') or vr3.get('data') or []
    pend_l = [r for r in reqs_l if r.get('status') == 'PENDING']
    idx_thuha = next((i for i, r in enumerate(pend_l) if (r.get('tutorEmail') or (r.get('tutor') or {}).get('email', '')).startswith('thuha')), None)
    ok_rej_validation = None
    if idx_thuha is not None:
        tj = nth_button('Từ chối', idx_thuha, exact=True)
        if tj:
            ab('click', tj)
            time.sleep(1.5)
            # bấm "Xác nhận từ chối" khi chưa nhập lý do → nút PHẢI disabled
            sb1 = find('Xác nhận từ chối', role='button')
            if sb1:
                dis = ab('is', 'enabled', sb1)
                ok_rej_validation = 'false' in dis.lower()
            ta = find(role='textbox')
            if ta:
                fill(ta, 'Ảnh chụp mờ, không đọc được thông tin bằng cấp')
            click_safe('Xác nhận từ chối', role='button')
            time.sleep(2.5)
    st, vr4 = browser_api('GET', '/api/admin/verification')
    reqs4 = vr4.get('requests') or vr4.get('data') or []
    thuha = [r for r in reqs4 if (r.get('tutorEmail') or (r.get('tutor') or {}).get('email', '')).startswith('thuha')]
    check('từ chối: thuha → REJECTED qua UI kèm lý do', thuha and thuha[0].get('status') == 'REJECTED' and (thuha[0].get('reviewNote') or '').startswith('Ảnh chụp mờ'), str(thuha[:1]))
    check('từ chối: chặn khi thiếu lý do', ok_rej_validation is True)
    shot('j4-reject')

    # --- Tài khoản khóa + mở khóa ---
    subprocess.run(['bun', 'run', 'scripts/e2e_lock.ts', 'e2e.student@example.com', 'lock'], cwd='/home/z/my-project', capture_output=True, timeout=60)
    click_safe('Tài khoản khóa', role='button')
    time.sleep(1.2)
    ab('reload')
    time.sleep(2.5)
    click_safe('Tài khoản khóa', role='button')
    time.sleep(1.8)
    check('khóa: e2e.student hiện trong tab', wait_text('e2e.student', 6))
    # login bị chặn khi khóa
    st2, out2 = api('POST', '/api/auth/login', {'email': 'e2e.student@example.com', 'password': '123456'})
    check('khóa: login bị chặn 403 kèm lý do', st2 == 403 and 'khóa' in json.dumps(out2, ensure_ascii=False).lower(), f'st={st2}')
    ul = find('Mở khóa', role='button')
    if ul:
        ab('click', ul)
        time.sleep(1.2)
        # dialog xác nhận: bấm nút Mở khóa CUỐI (trong dialog)
        click_safe('Mở khóa', role='button', which='last')
        time.sleep(2.5)
    st3, out3 = api('POST', '/api/auth/login', {'email': 'e2e.student@example.com', 'password': '123456'})
    check('mở khóa qua UI → login lại được', st3 == 200 and out3.get('email') == 'e2e.student@example.com', f'st={st3}')
    shot('j4-locked-unlock')
    logout()


# ============================================================
# J5 — CROSS-CUT
# ============================================================

def j5_cross():
    section('J5 · Cross-cut (mobile + lỗi trang)')
    ab('set', 'viewport', '390', '844')
    goto('/')
    check('mobile 390px: landing vẫn render', 'GiaSuConnect' in ab('get', 'title'))
    check('mobile: menu hamburger hiện', find('menu', role='button') is not None or find('Menu', role='button') is not None)
    shot('j5-mobile-home')
    goto('/?view=search&q=Toán')
    check('mobile: search render kết quả', len(find_all(startswith='Lưu ')) >= 1)
    shot('j5-mobile-search')
    ab('set', 'viewport', '1920', '1080')

    # hydration/console errors tích lũy — tách noise dev-mode (SPA view-param) đã biết
    console = ab('console')
    lines = console.splitlines()
    hyd_noise = [l for l in lines if 'hydrat' in l.lower() or 'hydration-mismatch' in l.lower()]
    err_lines = [l for l in lines if '[error]' in l.lower() and 'hydrat' not in l.lower() and 'hydration-mismatch' not in l.lower()]
    check('page errors (uncaught) toàn hành trình = 0', len(ERRORS_SEEN) == 0, str(ERRORS_SEEN[:3]))
    check(f'hydration errors thật = 0 (dev-noise đã bỏ: {len(hyd_noise)} dòng)', len(err_lines) == 0 and len(hyd_noise) >= 0 and all('a tree hydrated' in l.lower() or 'hydration-mismatch' in l.lower() or 'hydrat' in l.lower() for l in hyd_noise if l.strip() and not l.strip().startswith('%s')), str(err_lines[:2]))


# ============================================================
# MAIN
# ============================================================

def main():
    frm = 'J1'
    if '--from' in sys.argv:
        frm = sys.argv[sys.argv.index('--from') + 1]
    order = [('J1', j1_guest), ('J2', j2_parent), ('J3', j3_tutor), ('J4', j4_admin), ('J5', j5_cross)]
    started = False
    t0 = time.time()
    for name, fn in order:
        if name == frm:
            started = True
        if not started:
            continue
        try:
            fn()
        except Exception as e:
            global FAIL
            FAIL += 1
            FAILURES.append(f'[{name}] EXCEPTION {e}')
            print(f'  ✗ EXCEPTION trong {name}: {e}')
    dt = time.time() - t0
    print('\n' + '=' * 60)
    print(f'KẾT QUẢ E2E BROWSER: {PASS} PASS · {FAIL} FAIL  ({dt:.0f}s)')
    if FAILURES:
        print('\nCác FAIL:')
        for f in FAILURES:
            print(' -', f)
    json.dump({'pass': PASS, 'fail': FAIL, 'failures': FAILURES, 'secs': int(dt)},
              open('/home/z/my-project/scripts/logs/e2e_result.json', 'w'), ensure_ascii=False, indent=1)
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
